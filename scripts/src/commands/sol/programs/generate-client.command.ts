import { Command } from "commander";

import { getInteractiveSelect, validateAndExecute } from "@internal/utils/cli";
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
    opts.program = await getInteractiveSelect({
      message: "Select program to generate client for:",
      options: [
        { value: "bridge", label: "Bridge" },
        { value: "base-relayer", label: "Base Relayer" },
      ],
      initialValue: "bridge",
    });
  }

  return opts;
}

export const generateClientCommand = new Command("generate-client")
  .description("Generate TypeScript client from IDL (bridge | base-relayer)")
  .option("--program <program>", "Program (bridge | base-relayer)")
  .action(async (options) => {
    try {
      const opts = await collectInteractiveOptions(options);
      await validateAndExecute(argsSchema, opts, handleGenerateClient);
    } catch (error) {
      logger.error("Client generation failed:", error);
      process.exit(1);
    }
  });
