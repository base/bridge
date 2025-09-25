import { Command } from "commander";
import { select, text, confirm, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";
import { argsSchema, handleRelayMessage } from "./relay-message.handler";

type CommanderOptions = {
  deployEnv?: string;
  messageHash?: string;
  payerKp?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  if (!opts.deployEnv) {
    const deployEnv = await select({
      message: "Select target deploy environment:",
      options: [
        { value: "development-alpha", label: "Development Alpha" },
        { value: "development-prod", label: "Development Prod" },
      ],
      initialValue: "development-alpha",
    });
    if (isCancel(deployEnv)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.deployEnv = deployEnv;
  }

  if (!opts.messageHash) {
    const messageHash = await text({
      message: "Enter message hash to relay:",
      placeholder: "0x...",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Message hash cannot be empty";
        }
        const cleanHash = value.trim();
        if (!cleanHash.startsWith("0x")) {
          return "Message hash must start with 0x";
        }
        if (cleanHash.length !== 66) {
          return "Message hash must be 32 bytes (66 characters including 0x)";
        }
      },
    });
    if (isCancel(messageHash)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.messageHash = messageHash.trim();
  }

  if (!opts.payerKp) {
    const useConfigPayer = await confirm({
      message: "Use config payer keypair?",
      initialValue: true,
    });
    if (isCancel(useConfigPayer)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (useConfigPayer) {
      opts.payerKp = "config";
    } else {
      const keypairPath = await text({
        message: "Enter path to payer keypair:",
        placeholder: "/path/to/keypair.json",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Keypair path cannot be empty";
          }
          const cleanPath = value.trim().replace(/^["']|["']$/g, "");
          if (!existsSync(cleanPath)) {
            return "Keypair file does not exist";
          }
        },
      });
      if (isCancel(keypairPath)) {
        cancel("Operation cancelled.");
        process.exit(1);
      }
      opts.payerKp = keypairPath.trim().replace(/^["']|["']$/g, "");
    }
  }

  return opts;
}

export const relayMessageCommand = new Command("relay-message")
  .description("Relay a message from Base to Solana")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (development-alpha | development-prod)"
  )
  .option("--message-hash <hash>", "Message hash to relay (0x...)")
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);
    const parsed = argsSchema.safeParse(opts);
    if (!parsed.success) {
      logger.error("Validation failed:");
      parsed.error.issues.forEach((err) => {
        logger.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      process.exit(1);
    }
    await handleRelayMessage(parsed.data);
  });
