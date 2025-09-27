import { Command } from "commander";
import { select, text, confirm, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";
import { isAddress, isHash } from "viem";

import { logger } from "@internal/logger";
import { argsSchema, handleSetConfig } from "./set-config.handler";

type CommanderOptions = {
  deployEnv?: string;
  payerKp?: string;
  multisigId?: string;
  levels?: string;
  clearRoot?: boolean;
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

  if (!opts.levels) {
    const levels = await text({
      message: "Enter multisig structure (nested with parentheses):",
      placeholder:
        "m:root:1o2(s:0x1234...,m:child1:1o3(s:0xabcd...,m:child11:1o2(s:0xefgh...,s:0x5678...)))",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Levels cannot be empty";
        }

        // Basic validation for structure format
        try {
          validateBasicStructure(value);
        } catch (error: any) {
          return error.message;
        }
      },
    });
    if (isCancel(levels)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.levels = levels.trim();
  }

  if (opts.clearRoot === undefined) {
    const clearRoot = await confirm({
      message: "Clear existing root (invalidates pending operations)?",
      initialValue: false,
    });
    if (isCancel(clearRoot)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.clearRoot = clearRoot;
  }

  return opts;
}

export const setConfigCommand = new Command("set-config")
  .description("Configure multisig groups, quorums and hierarchy")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (development-alpha | development-prod)"
  )
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .option("--multisig-id <id>", "Multisig ID")
  .option(
    "--levels <structure>",
    "Multisig structure: m:name:xoy(s:address,m:child:xoy(...))"
  )
  .option("--clear-root", "Clear existing root")
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
    await handleSetConfig(parsed.data);
  });

function validateBasicStructure(input: string): void {
  // Check parentheses balance
  let depth = 0;
  for (const char of input) {
    if (char === "(") depth++;
    else if (char === ")") depth--;
    if (depth < 0) throw new Error("Unmatched closing parenthesis");
  }
  if (depth > 0) throw new Error("Unmatched opening parenthesis");

  // Must start with m:
  if (!input.trim().startsWith("m:")) {
    throw new Error("Structure must start with a multisig (m:name:xoy)");
  }

  // Validate all multisig patterns
  const mPattern = /m:[^:,()]+:\d+o\d+/g;
  const mMatches = input.match(mPattern) || [];
  if (mMatches.length === 0) {
    throw new Error("No valid multisig definitions found (m:name:xoy)");
  }

  // Check each multisig format
  for (const match of mMatches) {
    const parts = match.split(":");
    if (parts.length !== 3) {
      throw new Error(`Invalid multisig format: ${match}. Expected m:name:xoy`);
    }
    const [, name, quorum] = parts;
    if (!name || !quorum) {
      throw new Error(`Missing name or quorum in: ${match}`);
    }
    if (!/^\d+o\d+$/.test(quorum)) {
      throw new Error(`Invalid quorum format: ${quorum}. Expected xoy`);
    }
  }

  // Find all s: patterns and validate addresses using isAddress
  const sPattern = /s:[^,()]+/g;
  const sMatches = input.match(sPattern) || [];

  for (const match of sMatches) {
    const address = match.slice(2); // Remove "s:" prefix
    if (!isAddress(address)) {
      throw new Error(`Invalid Ethereum address: ${address} in ${match}`);
    }
  }
}
