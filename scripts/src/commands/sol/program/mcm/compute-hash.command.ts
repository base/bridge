import { Command } from "commander";
import { text, isCancel, cancel } from "@clack/prompts";
import { isHex } from "viem";

import { logger } from "@internal/logger";
import { argsSchema, handleComputeHash } from "./compute-hash.handler";

type CommanderOptions = {
  root?: string;
  validUntil?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  // Root
  if (!opts.root) {
    const root = await text({
      message: "Enter Merkle root (32-byte hex with 0x prefix):",
      placeholder: "0x1234567890abcdef...",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Root cannot be empty";
        }
        if (!isHex(value) || value.length !== 66) {
          return "Root must be a 32-byte hex string (64 chars + 0x prefix)";
        }
      },
    });
    if (isCancel(root)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.root = root.trim();
  }

  // Valid Until
  if (!opts.validUntil) {
    const validUntil = await text({
      message: "Enter valid until timestamp (Unix timestamp):",
      placeholder: Math.floor(Date.now() / 1000 + 3600 * 24).toString(), // 24 hours from now
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Valid until cannot be empty";
        }
        const timestamp = parseInt(value.trim());
        if (isNaN(timestamp) || timestamp <= 0) {
          return "Valid until must be a positive timestamp";
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

export const computeHashCommand = new Command("compute-hash")
  .description("Compute the hash to be signed for MCM root validation")
  .option("--root <root>", "Merkle root (32-byte hex with 0x prefix)")
  .option("--valid-until <timestamp>", "Valid until timestamp (Unix timestamp)")
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
    await handleComputeHash(parsed.data);
  });
