import { Command } from "commander";

import {
  getInteractiveConfirm,
  getOrPromptSolanaAddress,
  getOrPromptFilePath,
  getOrPromptDeployEnv,
  validateAndExecute,
} from "@internal/utils/cli";
import { argsSchema, handleCreateAta } from "./create-ata.handler";

type CommanderOptions = {
  deployEnv?: string;
  mint?: string;
  owner?: string;
  payerKp?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  if (!opts.deployEnv) {
    opts.deployEnv = await getOrPromptDeployEnv();
  }

  opts.mint = await getOrPromptSolanaAddress(opts.mint, "Enter mint address");

  if (!opts.owner) {
    const usePayerAsOwner = await getInteractiveConfirm(
      "Use payer address as owner?",
      true
    );

    if (usePayerAsOwner) {
      opts.owner = "payer";
    } else {
      opts.owner = await getOrPromptSolanaAddress(
        undefined,
        "Enter owner address"
      );
    }
  }

  opts.payerKp = await getOrPromptFilePath(
    opts.payerKp,
    "Enter payer keypair path (or 'config' for Solana CLI config)",
    ["config"]
  );

  return opts;
}

export const createAtaCommand = new Command("create-ata")
  .description("Create an Associated Token Account (ATA)")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod | mainnet)"
  )
  .option("--mint <address>", "Mint address")
  .option("--owner <address>", "Owner address or 'payer'")
  .option("--payer-kp <path>", "Payer keypair path or 'config'")
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);
    await validateAndExecute(argsSchema, opts, handleCreateAta);
  });
