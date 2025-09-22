import { Command } from "commander";
import { select, isCancel, cancel } from "@clack/prompts";

import { logger } from "@internal/logger";
import { argsSchema, handleGenerateClient } from "./generate-client.handler";

type CommanderOptions = {
  program?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  if (!opts.program) {
    const program = await select({
      message: "Select program to generate client for:",
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

  return opts;
}

export const generateClientCommand = new Command("generate-client")
  .description("Generate TypeScript client from IDL (bridge | base-relayer)")
  .option("--program <program>", "Program (bridge | base-relayer)")
  .action(async (options) => {
    try {
      const opts = await collectInteractiveOptions(options);
      const parsed = argsSchema.safeParse(opts);
      if (!parsed.success) {
        logger.error("Validation failed:");
        parsed.error.issues.forEach((err) => {
          logger.error(`  - ${err.path.join(".")}: ${err.message}`);
        });
        process.exit(1);
      }

      await handleGenerateClient(parsed.data);
    } catch (error) {
      logger.error("Client generation failed:", error);
      process.exit(1);
    }
  });
