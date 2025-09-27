import { Command } from "commander";
import { select, text, confirm, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";
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
    const deployEnv = await select({
      message: "Select target deploy environment:",
      options: [
        { value: "testnet-alpha", label: "Testnet Alpha" },
        { value: "testnet-prod", label: "Testnet Prod" },
      ],
      initialValue: "testnet-alpha",
    });
    if (isCancel(deployEnv)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.deployEnv = deployEnv;
  }

  if (!opts.payerKp) {
    const useConfigPayer = await confirm({
      message: "Use config payer keypair?",
      initialValue: true,
    });
    if (isCancel(useConfigPayer)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (useConfigPayer) {
      opts.payerKp = "config";
    } else {
      const keypairPath = await text({
        message: "Enter path to payer keypair:",
        placeholder: "/path/to/keypair.json",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Keypair path cannot be empty";
          }
          const cleanPath = value.trim().replace(/^["']|["']$/g, "");
          if (!existsSync(cleanPath)) {
            return "Keypair file does not exist";
          }
        },
      });
      if (isCancel(keypairPath)) {
        cancel("Operation cancelled.");
        process.exit(1);
      }
      opts.payerKp = keypairPath.trim().replace(/^["']|["']$/g, "");
    }
  }

  if (!opts.to) {
    const to = await select({
      message: "Select target contract:",
      options: [
        { value: "counter", label: "Counter contract" },
        { value: "custom", label: "Custom address" },
      ],
      initialValue: "counter",
    });
    if (isCancel(to)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (to === "custom") {
      const customAddress = await text({
        message: "Enter target contract address:",
        placeholder: "0x...",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Target address cannot be empty";
          }
          if (!value.trim().startsWith("0x")) {
            return "Address must start with 0x";
          }
        },
      });
      if (isCancel(customAddress)) {
        cancel("Operation cancelled.");
        process.exit(1);
      }
      opts.to = customAddress.trim();
    } else {
      opts.to = to;
    }
  }

  if (!opts.value) {
    const value = await text({
      message: "Enter value to send (in ETH):",
      placeholder: "0",
      initialValue: "0",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Value cannot be empty";
        }
        const num = parseFloat(value);
        if (isNaN(num) || num < 0) {
          return "Value must be a non-negative number";
        }
      },
    });
    if (isCancel(value)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.value = value.trim();
  }

  if (!opts.data) {
    const data = await select({
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
    if (isCancel(data)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (data === "custom") {
      const customData = await text({
        message: "Enter call data (hex):",
        placeholder: "0x...",
        initialValue: "0x",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Data cannot be empty";
          }
          if (!value.trim().startsWith("0x")) {
            return "Data must start with 0x";
          }
        },
      });
      if (isCancel(customData)) {
        cancel("Operation cancelled.");
        process.exit(1);
      }
      opts.data = customData.trim();
    } else {
      opts.data = data;
    }
  }

  if (opts.payForRelay === undefined) {
    const payForRelay = await confirm({
      message: "Pay for relaying the message to Base?",
      initialValue: true,
    });
    if (isCancel(payForRelay)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.payForRelay = payForRelay;
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
    const parsed = argsSchema.safeParse(opts);
    if (!parsed.success) {
      logger.error("Validation failed:");
      parsed.error.issues.forEach((err) => {
        logger.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      process.exit(1);
    }
    await handleBridgeCall(parsed.data);
  });
