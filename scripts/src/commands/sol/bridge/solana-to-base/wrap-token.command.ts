import { Command } from "commander";

import {
  getInteractiveSelect,
  getInteractiveConfirm,
  getOrPromptInteger,
  getOrPromptString,
  getOrPromptEvmAddress,
  getOrPromptFilePath,
  validateAndExecute,
} from "@internal/utils/cli";
import { argsSchema, handleWrapToken } from "./wrap-token.handler";

type CommanderOptions = {
  deployEnv?: string;
  decimals?: string;
  name?: string;
  symbol?: string;
  remoteToken?: string;
  scalerExponent?: string;
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

  opts.decimals = await getOrPromptInteger(
    opts.decimals,
    "Enter token decimals",
    0
  );

  opts.name = await getOrPromptString(
    opts.name,
    "Enter token name",
    "Wrapped ERC20"
  );

  opts.symbol = await getOrPromptString(
    opts.symbol,
    "Enter token symbol",
    "wERC20"
  );

  if (!opts.remoteToken) {
    const remoteToken = await getInteractiveSelect({
      message: "Select remote token:",
      options: [
        { value: "constant-erc20", label: "ERC20 from constants" },
        { value: "constant-eth", label: "ETH from constants" },
        { value: "custom", label: "Custom address" },
      ],
      initialValue: "constant-erc20",
    });

    if (remoteToken === "custom") {
      opts.remoteToken = await getOrPromptEvmAddress(
        undefined,
        "Enter token address"
      );
    } else {
      opts.remoteToken = remoteToken;
    }
  }

  opts.scalerExponent = await getOrPromptInteger(
    opts.scalerExponent,
    "Enter scaler exponent",
    0
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

export const wrapTokenCommand = new Command("wrap-token")
  .description("Wrap an ERC20 token from Base to Solana")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod)"
  )
  .option("--decimals <decimals>", "Token decimals")
  .option("--name <name>", "Token name")
  .option("--symbol <symbol>", "Token symbol")
  .option(
    "--remote-token <remoteToken>",
    "Remote token address: 'constant-erc20', 'constant-eth', or custom address"
  )
  .option("--scaler-exponent <scalerExponent>", "Scaler exponent")
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .option("--pay-for-relay", "Pay for relaying the message to Base")
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);
    await validateAndExecute(argsSchema, opts, handleWrapToken);
  });
