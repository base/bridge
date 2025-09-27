import { Command } from "commander";
import { select, text, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";
import { argsSchema, handleInitSignatures } from "./init-signatures.handler";

type CommanderOptions = {
  deployEnv?: string;
  payerKp?: string;
  proposalFile?: string;
  totalSignatures?: string;
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

  // Proposal File
  if (!opts.proposalFile) {
    const proposalFile = await text({
      message: "Enter proposal JSON file path:",
      placeholder: "mcm-proposal-*.json",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Proposal file path cannot be empty";
        }
        const cleanPath = value.trim().replace(/^["']|["']$/g, "");
        if (!existsSync(cleanPath)) {
          return "Proposal file does not exist";
        }
        if (!cleanPath.endsWith(".json")) {
          return "Proposal file must be a JSON file";
        }
      },
    });
    if (isCancel(proposalFile)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.proposalFile = proposalFile.trim().replace(/^["']|["']$/g, "");
  }

  // Total Signatures
  if (!opts.totalSignatures) {
    const totalSignatures = await text({
      message: "Enter total number of signatures expected:",
      placeholder: "2",
      initialValue: "2",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Total signatures cannot be empty";
        }
        const num = parseInt(value.trim());
        if (isNaN(num) || num <= 0 || num > 180) {
          return "Total signatures must be between 1 and 180";
        }
      },
    });
    if (isCancel(totalSignatures)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.totalSignatures = totalSignatures.trim();
  }

  return opts;
}

export const initSignaturesCommand = new Command("init-signatures")
  .description(
    "Initialize storage for ECDSA signatures that will validate a new Merkle root"
  )
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (development-alpha | development-prod)"
  )
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .option(
    "--proposal-file <path>",
    "Path to proposal JSON file (required, contains multisigId)"
  )
  .option(
    "--total-signatures <count>",
    "Total number of signatures to be added (1-180, default: 2)"
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
    await handleInitSignatures(parsed.data);
  });
