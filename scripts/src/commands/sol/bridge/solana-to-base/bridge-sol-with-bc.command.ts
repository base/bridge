import { Command } from "commander";

import {
  getInteractiveConfirm,
  getOrPromptEvmAddress,
  getOrPromptDecimal,
  getOrPromptFilePath,
  getOrPromptDeployEnv,
  getOrPromptHex,
  getOrPromptInteger,
  validateAndExecute,
  getOrPromptHash,
} from "@internal/utils/cli";
import {
  argsSchema,
  handleBridgeSolWithBc,
} from "./bridge-sol-with-bc.handler";

type CommanderOptions = {
  deployEnv?: string;
  to?: string;
  amount?: string;
  builderCode?: string;
  feeBps?: string;
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
    "Enter user address on Base (recipient for hookData)"
  );

  opts.amount = await getOrPromptDecimal(
    opts.amount,
    "Enter amount to bridge (in SOL)",
    0.001
  );

  opts.builderCode = await getOrPromptHash(
    opts.builderCode,
    "Enter builder code (bytes32, 0x followed by 64 hex chars)"
  );

  opts.feeBps = await getOrPromptInteger(
    opts.feeBps,
    "Enter fee in basis points (e.g., 100 for 1%)",
    0,
    10000
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

export const bridgeSolWithBcCommand = new Command("bridge-sol-with-bc")
  .description("Bridge SOL from Solana to Base with Builder Code attribution")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod | mainnet)"
  )
  .option("--to <address>", "User address on Base (for hookData)")
  .option("--amount <amount>", "Amount to bridge in SOL")
  .option(
    "--builder-code <hex>",
    "Builder code (bytes32, 0x followed by 64 hex chars)"
  )
  .option("--fee-bps <number>", "Fee in basis points (e.g., 100 for 1%)")
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .option("--pay-for-relay", "Pay for relaying the message to Base")
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);
    await validateAndExecute(argsSchema, opts, handleBridgeSolWithBc);
  });
