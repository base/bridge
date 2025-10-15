import { Command } from "commander";

import {
  getInteractiveSelect,
  getOrPromptSolanaAddress,
  getOrPromptDecimal,
  getOrPromptFilePath,
  validateAndExecute,
} from "@internal/utils/cli";
import { argsSchema, handleMint } from "./mint.handler";

type CommanderOptions = {
  deployEnv?: string;
  mint?: string;
  to?: string;
  amount?: string;
  payerKp?: string;
  mintAuthorityKp?: string;
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

  opts.mint = await getOrPromptSolanaAddress(opts.mint, "Enter mint address");

  // 'to' can be "config" or a Solana address - handled by handler
  opts.to = await getOrPromptSolanaAddress(
    opts.to,
    "Enter recipient address (or 'config' for Solana CLI config)",
    ["config"]
  );

  opts.amount = await getOrPromptDecimal(
    opts.amount,
    "Enter amount to mint",
    0.001
  );

  opts.mintAuthorityKp = await getOrPromptFilePath(
    opts.mintAuthorityKp,
    "Enter mint authority keypair path (or 'config' for Solana CLI config)",
    ["config"]
  );

  opts.payerKp = await getOrPromptFilePath(
    opts.payerKp,
    "Enter payer keypair path (or 'config' for Solana CLI config)",
    ["config"]
  );

  return opts;
}

export const mintCommand = new Command("mint")
  .description("Mint SPL tokens to an ATA")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod)"
  )
  .option("--mint <address>", "Mint address")
  .option(
    "--to <address>",
    "Recipient address: 'config' or custom recipient address"
  )
  .option("--amount <amount>", "Amount to mint")
  .option(
    "--mint-authority-kp <path>",
    "Mint authority keypair: 'config' or custom mint authority keypair path"
  )
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);
    await validateAndExecute(argsSchema, opts, handleMint);
  });
