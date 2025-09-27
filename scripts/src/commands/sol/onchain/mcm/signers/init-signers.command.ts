import { Command } from "commander";
import { select, text, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";
import { isHash } from "viem";

import { logger } from "@internal/logger";
import { argsSchema, handleInitSigners } from "./init-signers.handler";

type CommanderOptions = {
  deployEnv?: string;
  payerKp?: string;
  multisigId?: string;
  totalSigners?: string;
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

  if (!opts.multisigId) {
    const multisigId = await text({
      message: "Enter multisig ID:",
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

  if (!opts.totalSigners) {
    const totalSigners = await text({
      message: "Enter total number of signers:",
      placeholder: "5",
      validate: (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num <= 0 || num > 180) {
          return "Total signers must be between 1 and 180";
        }
      },
    });
    if (isCancel(totalSigners)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.totalSigners = totalSigners.trim();
  }

  return opts;
}

export const initSignersCommand = new Command("init-signers")
  .description("Initialize storage for multisig signers")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (development-alpha | development-prod)"
  )
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .option("--multisig-id <id>", "Multisig ID")
  .option("--total-signers <number>", "Total number of signers")
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);
    const parsed = argsSchema.safeParse(opts);
    if (!parsed.success) {
      logger.error("Validation failed:");
      parsed.error.issues.forEach((err: any) => {
        logger.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      process.exit(1);
    }
    await handleInitSigners(parsed.data);
  });
