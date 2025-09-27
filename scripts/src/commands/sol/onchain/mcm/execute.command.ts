import { Command } from "commander";
import { select, text, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";
import { argsSchema, handleExecute } from "./execute.handler";

type CommanderOptions = {
  deployEnv?: string;
  payerKp?: string;
  proposalFile?: string;
  opIndex?: string;
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

  if (!opts.opIndex) {
    const opIndex = await text({
      message: "Enter operation index to execute:",
      placeholder: "0",
      initialValue: "0",
      validate: (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 0) {
          return "Operation index must be a non-negative integer";
        }
      },
    });
    if (isCancel(opIndex)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.opIndex = opIndex.trim();
  }

  return opts;
}

export const executeCommand = new Command("execute")
  .description("Execute an operation from an MCM proposal")
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
  .option("--op-index <index>", "Operation index to execute (0-based)")
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
    await handleExecute(parsed.data);
  });
