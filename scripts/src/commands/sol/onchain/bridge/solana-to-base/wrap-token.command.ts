import { Command } from "commander";
import { text, select, confirm, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";
import { argsSchema, handleWrapToken } from "./wrap-token.handler";

type CommanderOptions = {
  cluster?: string;
  release?: string;
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

  if (!opts.cluster) {
    const cluster = await select({
      message: "Select target cluster:",
      options: [{ value: "devnet", label: "Devnet" }],
      initialValue: "devnet",
    });
    if (isCancel(cluster)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.cluster = cluster;
  }

  if (!opts.release) {
    const release = await select({
      message: "Select release type:",
      options: [
        { value: "prod", label: "Prod" },
        { value: "alpha", label: "Alpha" },
      ],
      initialValue: "prod",
    });
    if (isCancel(release)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.release = release;
  }

  if (!opts.decimals) {
    const decimals = await text({
      message: "Enter token decimals:",
      placeholder: "6",
      initialValue: "6",
      validate: (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 0) {
          return "Decimals must be a non-negative number";
        }
      },
    });
    if (isCancel(decimals)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.decimals = decimals.trim();
  }

  if (!opts.name) {
    const name = await text({
      message: "Enter token name:",
      placeholder: "Wrapped ERC20",
      initialValue: "Wrapped ERC20",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Token name cannot be empty";
        }
      },
    });
    if (isCancel(name)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.name = name.trim();
  }

  if (!opts.symbol) {
    const symbol = await text({
      message: "Enter token symbol:",
      placeholder: "wERC20",
      initialValue: "wERC20",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Token symbol cannot be empty";
        }
      },
    });
    if (isCancel(symbol)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.symbol = symbol.trim();
  }

  if (!opts.remoteToken) {
    const remoteToken = await select({
      message: "Select remote token:",
      options: [
        { value: "constant", label: "Default ERC20 from constants" },
        { value: "custom", label: "Custom address" },
      ],
      initialValue: "constant",
    });
    if (isCancel(remoteToken)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (remoteToken === "custom") {
      const customAddress = await text({
        message: "Enter ERC20 token address:",
        placeholder: "0x...",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Token address cannot be empty";
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
      opts.remoteToken = customAddress.trim();
    } else {
      opts.remoteToken = remoteToken;
    }
  }

  if (!opts.scalerExponent) {
    const scalerExponent = await text({
      message: "Enter scaler exponent:",
      placeholder: "9",
      initialValue: "9",
      validate: (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 0) {
          return "Scaler exponent must be a non-negative number";
        }
      },
    });
    if (isCancel(scalerExponent)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.scalerExponent = scalerExponent.trim();
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

export const wrapTokenCommand = new Command("wrap-token")
  .description("Wrap an ERC20 token from Base to Solana")
  .option("--cluster <cluster>", "Target cluster (devnet)")
  .option("--release <release>", "Release type (alpha | prod)")
  .option("--decimals <decimals>", "Token decimals")
  .option("--name <name>", "Token name")
  .option("--symbol <symbol>", "Token symbol")
  .option(
    "--remote-token <remoteToken>",
    "Remote ERC20 token address: 'constant' or custom address"
  )
  .option("--scaler-exponent <scalerExponent>", "Scaler exponent")
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
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
    await handleWrapToken(parsed.data);
  });
