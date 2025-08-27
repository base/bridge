import { Command } from "commander";
import { select, confirm, isCancel, cancel } from "@clack/prompts";

import { logger } from "../../../internal/logger";
import { argsSchema, handleGenerateIdl } from "./generate-idl.handler";
import { handleGenerateClient } from "./generate-client.handler";

type CommanderOptions = {
  cluster?: string;
  release?: string;
  skipClient?: boolean;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  if (!opts.cluster) {
    const cluster = await select({
      message: "Select target cluster:",
      options: [{ value: "devnet", label: "Devnet" }],
      initialValue: "devnet",
    });
    if (isCancel(cluster)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.cluster = cluster;
  }

  if (!opts.release) {
    const release = await select({
      message: "Select release type:",
      options: [
        { value: "prod", label: "Prod" },
        { value: "alpha", label: "Alpha" },
      ],
      initialValue: "prod",
    });
    if (isCancel(release)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.release = release;
  }

  if (!opts.skipClient) {
    const generateClient = await confirm({
      message: "Generate TypeScript client after IDL?",
      initialValue: true,
    });
    if (isCancel(generateClient)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.skipClient = !generateClient;
  }

  return opts;
}

export const generateIdlCommand = new Command("generate-idl")
  .description("Generate IDL for the Bridge Solana program")
  .option("--cluster <cluster>", "Target cluster (devnet)")
  .option("--release <release>", "Release type (alpha | prod)")
  .option("--skip-client", "Skip TypeScript client generation")
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

    await handleGenerateIdl(parsed.data);

    if (!opts.skipClient) {
      logger.info("Generating TypeScript client...");
      await handleGenerateClient();
    }
  });
