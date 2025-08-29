import { Command } from "commander";
import { select, text, confirm, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";
import { argsSchema, handleProveMessage } from "./prove-message.handler";
import { handleRelayMessage } from "./relay-message.handler";

type CommanderOptions = {
  cluster?: string;
  release?: string;
  transactionHash?: string;
  payerKp?: string;
  skipRelay?: boolean;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  if (!opts.cluster) {
    const cluster = await select({
      message: "Select target cluster:",
      options: [{ value: "devnet", label: "Devnet" }],
      initialValue: "devnet",
    });
    if (isCancel(cluster)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.cluster = cluster;
  }

  if (!opts.release) {
    const release = await select({
      message: "Select release type:",
      options: [
        { value: "prod", label: "Prod" },
        { value: "alpha", label: "Alpha" },
      ],
      initialValue: "prod",
    });
    if (isCancel(release)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.release = release;
  }

  if (!opts.transactionHash) {
    const transactionHash = await text({
      message: "Enter Base transaction hash to prove:",
      placeholder: "0x...",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Transaction hash cannot be empty";
        }
        const cleanHash = value.trim();
        if (!cleanHash.startsWith("0x")) {
          return "Transaction hash must start with 0x";
        }
        if (cleanHash.length !== 66) {
          return "Transaction hash must be 32 bytes (66 characters including 0x)";
        }
      },
    });
    if (isCancel(transactionHash)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.transactionHash = transactionHash.trim();
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

  if (!opts.skipRelay) {
    const relayMessage = await confirm({
      message: "Relay message after proving?",
      initialValue: true,
    });
    if (isCancel(relayMessage)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.skipRelay = !relayMessage;
  }

  return opts;
}

export const proveMessageCommand = new Command("prove-message")
  .description("Prove a message from Base transaction on Solana")
  .option("--cluster <cluster>", "Target cluster (devnet)")
  .option("--release <release>", "Release type (alpha | prod)")
  .option("--transaction-hash <hash>", "Base transaction hash to prove (0x...)")
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .option("--skip-relay", "Skip message relay after proving")
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

    const messageHash = await handleProveMessage(parsed.data);

    if (!opts.skipRelay) {
      logger.info("Relaying message...");
      await handleRelayMessage({
        cluster: parsed.data.cluster,
        release: parsed.data.release,
        messageHash: messageHash as any,
        payerKp: parsed.data.payerKp,
      });
    }
  });
