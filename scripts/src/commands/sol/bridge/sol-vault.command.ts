import { Command } from "commander";

import {
  getOrPromptSolanaAddress,
  validateAndExecute,
} from "@internal/utils/cli";
import { argsSchema, handleSolVault } from "./sol-vault.handler";

type CommanderOptions = {
  bridgeProgram?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  opts.bridgeProgram = await getOrPromptSolanaAddress(
    opts.bridgeProgram,
    "Enter bridge program address (Solana address)"
  );

  return opts;
}

export const solVaultCommand = new Command("sol-vault")
  .description("Display SOL vault PDA")
  .option("--bridge-program <address>", "Bridge program address on Solana")
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);
    await validateAndExecute(argsSchema, opts, handleSolVault);
  });
