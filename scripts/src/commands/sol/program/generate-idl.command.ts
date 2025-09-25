import { Command } from "commander";
import { select, confirm, isCancel, cancel } from "@clack/prompts";

import { logger } from "@internal/logger";
import { argsSchema, handleGenerateIdl } from "./generate-idl.handler";
import { handleGenerateClient } from "./generate-client.handler";

type CommanderOptions = {
  program?: string;
  skipClient?: boolean;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  if (!opts.program) {
    const program = await select({
      message: "Select program to generate IDL for:",
      options: [
        { value: "bridge", label: "Bridge" },
        { value: "base-relayer", label: "Base Relayer" },
      ],
      initialValue: "bridge",
    });
    if (isCancel(program)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.program = program;
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
  .description("Generate IDL for a Solana program (bridge | base-relayer)")
  .option("--program <program>", "Program (bridge | base-relayer)")
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
      await handleGenerateClient(parsed.data);
    }
  });
