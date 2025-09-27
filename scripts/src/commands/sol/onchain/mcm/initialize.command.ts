import { Command } from "commander";
import { select, text, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";
import { argsSchema, handleInitialize } from "./initialize.handler";
import { isHash } from "viem";

type CommanderOptions = {
  deployEnv?: string;
  payerKp?: string;
  chainId?: string;
  multisigId?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  // Deploy Environment
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

  // Payer Keypair
  if (!opts.payerKp) {
    const payerKp = await text({
      message: "Enter payer keypair path (or 'config' for Solana CLI config):",
      placeholder: "config",
      initialValue: "config",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Payer keypair cannot be empty";
        }
        const cleanPath = value.trim().replace(/^["']|["']$/g, "");
        if (cleanPath !== "config" && !existsSync(cleanPath)) {
          return "Payer keypair file does not exist";
        }
      },
    });
    if (isCancel(payerKp)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.payerKp = payerKp.trim().replace(/^["']|["']$/g, "");
  }

  // Chain ID
  if (!opts.chainId) {
    const chainId = await text({
      message: "Enter chain ID:",
      placeholder: "1",
      initialValue: "1",
      validate: (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num <= 0) {
          return "Chain ID must be a positive integer";
        }
      },
    });
    if (isCancel(chainId)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.chainId = chainId;
  }

  // Multisig ID
  if (!opts.multisigId) {
    const multisigId = await text({
      message: "Enter multisig ID (will be padded to 32 bytes):",
      placeholder:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      validate: (value) => {
        if (!isHash(value)) {
          return "Multisig ID must be a 32-byte hex string";
        }
      },
    });
    if (isCancel(multisigId)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.multisigId = multisigId.trim();
  }

  return opts;
}

export const initializeCommand = new Command("initialize")
  .description("Initialize a new MCM multisig configuration")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (development-alpha | development-prod)"
  )
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .option("--chain-id <chainId>", "Chain ID for the multisig configuration")
  .option(
    "--multisig-id <multisigId>",
    "Unique identifier for the multisig (will be padded to 32 bytes)"
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
    await handleInitialize(parsed.data);
  });
