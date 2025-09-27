import { Command } from "commander";
import { select, text, isCancel, cancel, confirm } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";
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

  if (!opts.to) {
    const to = await text({
      message: "Enter recipient address (Base address):",
      placeholder: "0x...",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Recipient address cannot be empty";
        }
        const cleanAddress = value.trim();
        if (!cleanAddress.startsWith("0x") || cleanAddress.length !== 42) {
          return "Invalid address format";
        }
      },
    });
    if (isCancel(to)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.to = to.trim();
  }

  if (!opts.amount) {
    const amount = await text({
      message: "Enter amount to bridge (in SOL):",
      placeholder: "0.001",
      initialValue: "0.001",
      validate: (value) => {
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) {
          return "Amount must be a positive number";
        }
      },
    });
    if (isCancel(amount)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.amount = amount;
  }

  if (!opts.payerKp) {
    const payerKp = await text({
      message: "Enter payer keypair path (or 'config' for Solana CLI config):",
      placeholder: "config",
      initialValue: "config",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Payer keypair cannot be empty";
        }
        const cleanPath = value.trim().replace(/^["']|["']$/g, "");
        if (cleanPath !== "config" && !existsSync(cleanPath)) {
          return "Payer keypair file does not exist";
        }
      },
    });
    if (isCancel(payerKp)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.payerKp = payerKp.trim().replace(/^["']|["']$/g, "");
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

export const bridgeSolCommand = new Command("bridge-sol")
  .description("Bridge SOL from Solana to Base")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod)"
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
    const parsed = argsSchema.safeParse(opts);
    if (!parsed.success) {
      logger.error("Validation failed:");
      parsed.error.issues.forEach((err) => {
        logger.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      process.exit(1);
    }
    await handleBridgeSol(parsed.data);
  });
