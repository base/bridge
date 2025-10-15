import { Command } from "commander";

import {
  getInteractiveSelect,
  getOrPromptInteger,
  getOrPromptSolanaAddress,
  getOrPromptFilePath,
  validateAndExecute,
} from "@internal/utils/cli";
import { argsSchema, handleCreateMint } from "./create-mint.handler";

type CommanderOptions = {
  deployEnv?: string;
  decimals?: string;
  mintAuthority?: string;
  payerKp?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  if (!opts.deployEnv) {
    opts.deployEnv = await getInteractiveSelect({
      message: "Select target deploy environment:",
      options: [
        { value: "testnet-alpha", label: "Testnet Alpha" },
        { value: "testnet-prod", label: "Testnet Prod" },
      ],
      initialValue: "testnet-alpha",
    });
  }

  opts.decimals = await getOrPromptInteger(
    opts.decimals,
    "Enter token decimals",
    0,
    18
  );

  // mintAuthority accepts "payer" or a Solana address
  opts.mintAuthority = await getOrPromptSolanaAddress(
    opts.mintAuthority,
    "Enter mint authority address (or 'payer' for payer address)",
    ["payer"]
  );

  opts.payerKp = await getOrPromptFilePath(
    opts.payerKp,
    "Enter payer keypair path (or 'config' for Solana CLI config)",
    ["config"]
  );

  return opts;
}

export const createMintCommand = new Command("create-mint")
  .description("Create a new SPL token mint")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod)"
  )
  .option("--decimals <decimals>", "Token decimals")
  .option(
    "--mint-authority <address>",
    "Mint authority: 'payer' or custom mint authority address"
  )
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);
    await validateAndExecute(argsSchema, opts, handleCreateMint);
  });
