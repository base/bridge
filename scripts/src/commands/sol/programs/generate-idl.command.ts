import { Command } from "commander";

import {
  getInteractiveSelect,
  getInteractiveConfirm,
  validateAndExecute,
} from "@internal/utils/cli";
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
    opts.program = await getInteractiveSelect({
      message: "Select program to generate IDL for:",
      options: [
        { value: "bridge", label: "Bridge" },
        { value: "base-relayer", label: "Base Relayer" },
      ],
      initialValue: "bridge",
    });
  }

  if (opts.skipClient === undefined) {
    const generateClient = await getInteractiveConfirm(
      "Generate TypeScript client after IDL?",
      true
    );
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

    await validateAndExecute(argsSchema, opts, async (parsed) => {
      await handleGenerateIdl(parsed);

      if (!opts.skipClient) {
        logger.info("Generating TypeScript client...");
        await handleGenerateClient(parsed);
      }
    });
  });
