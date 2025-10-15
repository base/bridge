import { Command } from "commander";

import {
  getOrPromptEvmAddress,
  getOrPromptSolanaAddress,
  validateAndExecute,
} from "@internal/utils/cli";
import { argsSchema, handleSolVault } from "./sol-vault.handler";

type CommanderOptions = {
  bridgeProgram?: string;
  remoteToken?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  opts.bridgeProgram = await getOrPromptSolanaAddress(
    opts.bridgeProgram,
    "Enter bridge program address (Solana address)"
  );

  opts.remoteToken = await getOrPromptEvmAddress(
    opts.remoteToken,
    "Enter remote token address (Base EVM address)"
  );

  return opts;
}

export const solVaultCommand = new Command("sol-vault")
  .description("Display SOL vault PDA for a given remote token")
  .option("--bridge-program <address>", "Bridge program address on Solana")
  .option("--remote-token <address>", "Remote token address on Base")
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);
    await validateAndExecute(argsSchema, opts, handleSolVault);
  });
