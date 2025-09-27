import { Command } from "commander";
import { text, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";

import {
  argsSchema,
  handleKeypairToAddress,
} from "./keypair-to-address.handler";

type CommanderOptions = {
  keypairPath?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  if (!opts.keypairPath) {
    const keypairPath = await text({
      message: "Enter keypair file path:",
      placeholder: "Path to keypair.json file",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Keypair path cannot be empty";
        }
        const cleanPath = value.trim().replace(/^["']|["']$/g, "");
        if (!existsSync(cleanPath)) {
          return "Keypair file does not exist";
        }
      },
    });

    if (isCancel(keypairPath)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.keypairPath = keypairPath.trim().replace(/^["']|["']$/g, "");
  }

  return opts;
}

export const keypairToAddressCommand = new Command("keypair-to-address")
  .description("Display Solana address from keypair file")
  .option("--keypair-path <path>", "Path to keypair file")
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
    await handleKeypairToAddress(parsed.data);
  });
