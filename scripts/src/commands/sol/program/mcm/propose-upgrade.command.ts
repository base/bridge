import { Command } from "commander";
import { text, select, confirm, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";
import { isAddress } from "@solana/kit";
import { isHash } from "viem";

import { logger } from "@internal/logger";
import { argsSchema, handleProposeUpgrade } from "./propose-upgrade.handler";

type CommanderOptions = {
  deployEnv?: string;
  payerKp?: string;
  multisigId?: string;
  bufferAddress?: string;
  spillAddress?: string;
  overridePreviousRoot?: boolean;
  validUntil?: string;
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

  // Buffer address
  if (!opts.bufferAddress) {
    const bufferAddress = await text({
      message: "Enter buffer address (containing new program bytecode):",
      placeholder: "Buffer account address",
      validate: (value) => {
        if (!isAddress(value)) {
          return "Invalid buffer address format";
        }
      },
    });
    if (isCancel(bufferAddress)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.bufferAddress = bufferAddress.trim();
  }

  // Spill address (optional)
  if (!opts.spillAddress) {
    const usePayerAsSpill = await confirm({
      message: "Use payer address as spill account (receives buffer lamports)?",
      initialValue: true,
    });
    if (isCancel(usePayerAsSpill)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (!usePayerAsSpill) {
      const spillAddress = await text({
        message: "Enter spill address:",
        placeholder: "Spill account address",
        validate: (value) => {
          if (!isAddress(value)) {
            return "Spill address cannot be empty";
          }
        },
      });
      if (isCancel(spillAddress)) {
        cancel("Operation cancelled.");
        process.exit(1);
      }
      opts.spillAddress = spillAddress.trim();
    }
  }

  if (opts.overridePreviousRoot === undefined) {
    const overridePreviousRoot = await confirm({
      message: "Override previous root (invalidates pending operations)?",
      initialValue: false,
    });
    if (isCancel(overridePreviousRoot)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.overridePreviousRoot = overridePreviousRoot;
  }

  // Valid until timestamp
  if (!opts.validUntil) {
    const defaultValidUntil = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours from now
    const validUntil = await text({
      message: "Enter valid until timestamp (seconds):",
      placeholder: `${defaultValidUntil} (24h from now)`,
      initialValue: defaultValidUntil.toString(),
      validate: (value) => {
        const timestamp = parseInt(value);
        if (isNaN(timestamp) || timestamp <= 0) {
          return "Valid until must be a positive timestamp";
        }
        if (timestamp <= Math.floor(Date.now() / 1000)) {
          return "Valid until must be in the future";
        }
      },
    });
    if (isCancel(validUntil)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.validUntil = validUntil.trim();
  }

  return opts;
}

export const proposeUpgradeCommand = new Command("propose-upgrade")
  .description("Create an MCM upgrade proposal and save to JSON file")
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
    "--buffer-address <address>",
    "Buffer address containing new program bytecode"
  )
  .option(
    "--spill-address <address>",
    "Spill address to receive buffer lamports (optional)"
  )
  .option("--override-previous-root", "Override previous root")
  .option("--valid-until <timestamp>", "Valid until timestamp in seconds")
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
    await handleProposeUpgrade(parsed.data);
  });
