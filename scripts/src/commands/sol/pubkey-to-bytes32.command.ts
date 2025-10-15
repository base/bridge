import { Command } from "commander";
import { text, isCancel, cancel } from "@clack/prompts";
import { isAddress } from "@solana/kit";

import { logger } from "@internal/logger";

import { argsSchema, handlePubkeyToBytes32 } from "./pubkey-to-bytes32.handler";

type CommanderOptions = {
  pubkey?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  if (!opts.pubkey) {
    const pubkey = await text({
      message: "Enter Solana pubkey to convert:",
      placeholder: "Base58 encoded address",
      validate: (value) => {
        if (!isAddress(value)) {
          return "Invalid pubkey format";
        }
        return undefined;
      },
    });

    if (isCancel(pubkey)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.pubkey = pubkey;
  }

  return opts;
}

export const pubkeyToBytes32Command = new Command("pubkey-to-bytes32")
  .description("Convert Solana pubkey to bytes32 format")
  .option("--pubkey <pubkey>", "Solana pubkey to convert")
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
    await handlePubkeyToBytes32(parsed.data);
  });
