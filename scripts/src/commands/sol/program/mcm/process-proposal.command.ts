import { Command } from "commander";
import { text, select, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";
import { argsSchema, handleProcessProposal } from "./process-proposal.handler";

type CommanderOptions = {
  deployEnv?: string;
  payerKp?: string;
  proposalPath?: string;
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

  // Proposal Path
  if (!opts.proposalPath) {
    const proposalPath = await text({
      message: "Enter proposal JSON file path:",
      placeholder: "mcm-proposal-*.json",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Proposal path cannot be empty";
        }
        // Remove surrounding quotes if present
        const cleanPath = value.trim().replace(/^["']|["']$/g, "");
        if (!existsSync(cleanPath)) {
          return "Proposal file does not exist";
        }
        if (!cleanPath.endsWith(".json")) {
          return "Proposal file must be a JSON file";
        }
      },
    });
    if (isCancel(proposalPath)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    // Clean the path before storing
    opts.proposalPath = proposalPath.trim().replace(/^["']|["']$/g, "");
  }

  return opts;
}

export const processProposalCommand = new Command("process-proposal")
  .description("Process an MCM proposal JSON file")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (development-alpha | development-prod)"
  )
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .option("--proposal-path <path>", "Path to proposal JSON file")
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
    await handleProcessProposal(parsed.data);
  });
