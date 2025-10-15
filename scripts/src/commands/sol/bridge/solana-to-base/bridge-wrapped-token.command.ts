import { Command } from "commander";

import {
  getInteractiveSelect,
  getInteractiveConfirm,
  getOrPromptEvmAddress,
  getOrPromptSolanaAddress,
  getOrPromptDecimal,
  getOrPromptFilePath,
  validateAndExecute,
} from "@internal/utils/cli";
import {
  argsSchema,
  handleBridgeWrappedToken,
} from "./bridge-wrapped-token.handler";

type CommanderOptions = {
  deployEnv?: string;
  to?: string;
  mint?: string;
  fromTokenAccount?: string;
  amount?: string;
  payerKp?: string;
  payForRelay?: boolean;
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

  if (!opts.mint) {
    const mint = await getInteractiveSelect({
      message: "Select wrapped token mint:",
      options: [
        { value: "constants-wErc20", label: "Wrapped ERC20 from constants" },
        { value: "constants-wEth", label: "Wrapped ETH from constants" },
        { value: "custom", label: "Custom wrapped token address" },
      ],
      initialValue: "constants-wErc20",
    });

    if (mint === "custom") {
      opts.mint = await getOrPromptSolanaAddress(
        undefined,
        "Enter wrapped token mint address"
      );
    } else {
      opts.mint = mint;
    }
  }

  if (!opts.fromTokenAccount) {
    const fromTokenAccount = await getInteractiveSelect({
      message: "Select from token account:",
      options: [
        { value: "payer", label: "ATA derived from payer" },
        { value: "config", label: "ATA derived from CLI config" },
        { value: "custom", label: "Custom token account address" },
      ],
      initialValue: "payer",
    });

    if (fromTokenAccount === "custom") {
      opts.fromTokenAccount = await getOrPromptSolanaAddress(
        undefined,
        "Enter token account address"
      );
    } else {
      opts.fromTokenAccount = fromTokenAccount;
    }
  }

  opts.to = await getOrPromptEvmAddress(
    opts.to,
    "Enter recipient address (Base address)"
  );

  opts.amount = await getOrPromptDecimal(
    opts.amount,
    "Enter amount to bridge (in token units)",
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

export const bridgeWrappedTokenCommand = new Command("bridge-wrapped-token")
  .description("Bridge wrapped ERC20 tokens from Solana to Base")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod)"
  )
  .option(
    "--mint <address>",
    "Wrapped token mint: 'constants-wErc20', 'constants-wEth', or custom mint address"
  )
  .option(
    "--from-token-account <fromTokenAccount>",
    "From token account: 'payer', 'config', or custom address"
  )
  .option("--to <address>", "Recipient address on Base")
  .option("--amount <amount>", "Amount to bridge in token units")
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .option("--pay-for-relay", "Pay for relaying the message to Base")
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);
    await validateAndExecute(argsSchema, opts, handleBridgeWrappedToken);
  });
