import { Command } from "commander";

import {
  getInteractiveConfirm,
  getOrPromptEvmAddress,
  getOrPromptDecimal,
  getOrPromptFilePath,
  getOrPromptDeployEnv,
  validateAndExecute,
} from "@internal/utils/cli";
import { argsSchema, handleBridgeSol } from "./bridge-sol.handler";

type CommanderOptions = {
  deployEnv?: string;
  to?: string;
  amount?: string;
  payerKp?: string;
  payForRelay?: boolean;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  if (!opts.deployEnv) {
    opts.deployEnv = await getOrPromptDeployEnv();
  }

  opts.to = await getOrPromptEvmAddress(
    opts.to,
    "Enter recipient address (Base address)"
  );

  opts.amount = await getOrPromptDecimal(
    opts.amount,
    "Enter amount to bridge (in SOL)",
    0.001
  );

  opts.payerKp = await getOrPromptFilePath(
    opts.payerKp,
    "Enter payer keypair path (or 'config' for Solana CLI config)",
    ["config"]
  );

  if (opts.payForRelay === undefined) {
    opts.payForRelay = await getInteractiveConfirm(
      "Pay for relaying the message to Base?",
      true
    );
  }

  return opts;
}

export const bridgeSolCommand = new Command("bridge-sol")
  .description("Bridge SOL from Solana to Base")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod | mainnet)"
  )
  .option("--to <address>", "Recipient address on Base")
  .option("--amount <amount>", "Amount to bridge in SOL")
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .option("--pay-for-relay", "Pay for relaying the message to Base")
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);
    await validateAndExecute(argsSchema, opts, handleBridgeSol);
  });
