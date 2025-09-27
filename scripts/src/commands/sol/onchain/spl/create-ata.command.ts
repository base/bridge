import { Command } from "commander";
import { text, confirm, isCancel, cancel, select } from "@clack/prompts";
import { existsSync } from "fs";
import { isAddress } from "@solana/kit";

import { logger } from "@internal/logger";
import { argsSchema, handleCreateAta } from "./create-ata.handler";

type CommanderOptions = {
  deployEnv?: string;
  mint?: string;
  owner?: string;
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
        { value: "testnet-alpha", label: "Testnet Alpha" },
        { value: "testnet-prod", label: "Testnet Prod" },
      ],
      initialValue: "testnet-alpha",
    });
    if (isCancel(deployEnv)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.deployEnv = deployEnv;
  }

  if (!opts.mint) {
    const mint = await text({
      message: "Enter mint address:",
      placeholder: "11111111111111111111111111111112",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Mint address cannot be empty";
        }
        if (!isAddress(value.trim())) {
          return "Invalid mint address";
        }
      },
    });
    if (isCancel(mint)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.mint = mint.trim();
  }

  if (!opts.owner) {
    const usePayerAsOwner = await confirm({
      message: "Use payer address as owner?",
      initialValue: true,
    });
    if (isCancel(usePayerAsOwner)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (usePayerAsOwner) {
      opts.owner = "payer";
    } else {
      const owner = await text({
        message: "Enter owner address:",
        placeholder: "11111111111111111111111111111112",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Owner address cannot be empty";
          }
          if (!isAddress(value.trim())) {
            return "Invalid owner address";
          }
        },
      });
      if (isCancel(owner)) {
        cancel("Operation cancelled.");
        process.exit(1);
      }
      opts.owner = owner.trim();
    }
  }

  if (!opts.payerKp) {
    const useConfigKeypair = await confirm({
      message: "Use Solana CLI config keypair?",
      initialValue: true,
    });
    if (isCancel(useConfigKeypair)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (useConfigKeypair) {
      opts.payerKp = "config";
    } else {
      const payerKp = await text({
        message: "Enter path to payer keypair:",
        placeholder: "/path/to/keypair.json",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Payer keypair path cannot be empty";
          }
          // Remove surrounding quotes if present
          const cleanPath = value.trim().replace(/^["']|["']$/g, "");
          if (!existsSync(cleanPath)) {
            return "Payer keypair file does not exist";
          }
        },
      });
      if (isCancel(payerKp)) {
        cancel("Operation cancelled.");
        process.exit(1);
      }
      // Clean the path before storing
      opts.payerKp = payerKp.trim().replace(/^["']|["']$/g, "");
    }
  }

  return opts;
}

export const createAtaCommand = new Command("create-ata")
  .description("Create an Associated Token Account (ATA)")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod)"
  )
  .option("--mint <address>", "Mint address")
  .option("--owner <address>", "Owner address or 'payer'")
  .option("--payer-kp <path>", "Payer keypair path or 'config'")
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
    await handleCreateAta(parsed.data);
  });
