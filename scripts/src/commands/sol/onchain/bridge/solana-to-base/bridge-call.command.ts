import { Command } from "commander";

import {
  getInteractiveSelect,
  getInteractiveConfirm,
  getOrPromptDecimal,
  getOrPromptHex,
  getOrPromptEvmAddress,
  getOrPromptFilePath,
  validateAndExecute,
} from "@internal/utils/cli";
import { argsSchema, handleBridgeCall } from "./bridge-call.handler";

type CommanderOptions = {
  deployEnv?: string;
  payerKp?: string;
  to?: string;
  value?: string;
  data?: string;
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

  opts.payerKp = await getOrPromptFilePath(
    opts.payerKp,
    "Enter payer keypair path (or 'config' for Solana CLI config)",
    ["config"]
  );

  if (!opts.to) {
    const to = await getInteractiveSelect({
      message: "Select target contract:",
      options: [
        { value: "counter", label: "Counter contract" },
        { value: "custom", label: "Custom address" },
      ],
      initialValue: "counter",
    });

    if (to === "custom") {
      opts.to = await getOrPromptEvmAddress(
        undefined,
        "Enter target contract address"
      );
    } else {
      opts.to = to;
    }
  }

  opts.value = await getOrPromptDecimal(
    opts.value,
    "Enter value to send (in ETH)",
    0
  );

  if (!opts.data) {
    const data = await getInteractiveSelect({
      message: "Select call data:",
      options: [
        { value: "increment", label: "increment() - Counter.increment()" },
        {
          value: "incrementPayable",
          label: "incrementPayable() - Counter.incrementPayable()",
        },
        { value: "custom", label: "Custom hex data" },
      ],
      initialValue: "increment",
    });

    if (data === "custom") {
      opts.data = await getOrPromptHex(undefined, "Enter call data (hex)");
    } else {
      opts.data = data;
    }
  }

  if (opts.payForRelay === undefined) {
    opts.payForRelay = await getInteractiveConfirm(
      "Pay for relaying the message to Base?",
      true
    );
  }

  return opts;
}

export const bridgeCallCommand = new Command("bridge-call")
  .description("Execute a bridge call from Solana to Base")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod)"
  )
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .option("--to <address>", "Target contract: 'counter' or custom address")
  .option("--value <amount>", "Value to send in ETH")
  .option(
    "--data <hex>",
    "Call data: 'increment', 'incrementPayable', or custom hex"
  )
  .option("--pay-for-relay", "Pay for relaying the message to Base")
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);
    await validateAndExecute(argsSchema, opts, handleBridgeCall);
  });
