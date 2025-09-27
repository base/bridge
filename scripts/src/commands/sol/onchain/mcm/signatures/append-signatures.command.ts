import { Command } from "commander";
import { select, text, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";
import { isHex } from "viem";

import { logger } from "@internal/logger";
import {
  argsSchema,
  handleAppendSignatures,
} from "./append-signatures.handler";

type CommanderOptions = {
  deployEnv?: string;
  payerKp?: string;
  proposalFile?: string;
  signatures?: string;
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

  // Signatures
  if (!opts.signatures) {
    const signatures = await text({
      message: "Enter ECDSA signatures (comma-separated 65-byte hex strings):",
      placeholder:
        "0x1234567890abcdef...(130 chars),0x9abcdef012345678...(130 chars)",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Signatures cannot be empty";
        }
        const sigs = value.trim().split(",");
        for (const sig of sigs) {
          const cleanSig = sig.trim();
          if (!isHex(cleanSig) || cleanSig.length !== 132) {
            return "Each signature must be a 65-byte hex string (130 chars + 0x prefix)";
          }
        }
      },
    });
    if (isCancel(signatures)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.signatures = signatures.trim();
  }

  return opts;
}

export const appendSignaturesCommand = new Command("append-signatures")
  .description("Append a batch of ECDSA signatures to the temporary storage")
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
    "Path to proposal JSON file (required, contains multisigId and root)"
  )
  .option(
    "--signatures <signatures>",
    "ECDSA signatures as comma-separated 65-byte hex strings: 0x1234...,0x5678..."
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
    await handleAppendSignatures(parsed.data);
  });
