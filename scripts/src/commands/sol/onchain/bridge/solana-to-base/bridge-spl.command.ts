import { Command } from "commander";
import { select, text, isCancel, cancel, confirm } from "@clack/prompts";
import { existsSync } from "fs";
import { isAddress } from "@solana/kit";

import { logger } from "@internal/logger";
import { argsSchema, handleBridgeSpl } from "./bridge-spl.handler";

type CommanderOptions = {
  cluster?: string;
  release?: string;
  to?: string;
  mint?: string;
  fromTokenAccount?: string;
  remoteToken?: string;
  amount?: string;
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

  if (!opts.mint) {
    const mint = await select({
      message: "Select SPL token mint:",
      options: [
        { value: "constant", label: "Default SPL from constants" },
        { value: "custom", label: "Custom mint address" },
      ],
      initialValue: "constant",
    });
    if (isCancel(mint)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (mint === "custom") {
      const customAddress = await text({
        message: "Enter SPL token mint address:",
        placeholder: "mint address...",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Mint address cannot be empty";
          }
          if (!isAddress(value.trim())) {
            return "Invalid Solana address format";
          }
        },
      });
      if (isCancel(customAddress)) {
        cancel("Operation cancelled.");
        process.exit(1);
      }
      opts.mint = customAddress.trim();
    } else {
      opts.mint = mint;
    }
  }

  if (!opts.remoteToken) {
    const remoteToken = await select({
      message: "Select remote token:",
      options: [
        { value: "constant", label: "Default wSpl from constants" },
        { value: "custom", label: "Custom ERC20 address" },
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
          const cleanAddress = value.trim();
          if (!cleanAddress.startsWith("0x") || cleanAddress.length !== 42) {
            return "Invalid ERC20 address format";
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

  if (!opts.fromTokenAccount) {
    const fromTokenAccount = await select({
      message: "Select from token account:",
      options: [
        { value: "payer", label: "ATA derived from payer" },
        { value: "config", label: "ATA derived from CLI config" },
        { value: "custom", label: "Custom token account address" },
      ],
      initialValue: "payer",
    });
    if (isCancel(fromTokenAccount)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (fromTokenAccount === "custom") {
      const customAddress = await text({
        message: "Enter token account address:",
        placeholder: "token account address...",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Token account address cannot be empty";
          }
          if (!isAddress(value.trim())) {
            return "Invalid Solana address format";
          }
        },
      });
      if (isCancel(customAddress)) {
        cancel("Operation cancelled.");
        process.exit(1);
      }
      opts.fromTokenAccount = customAddress.trim();
    } else {
      opts.fromTokenAccount = fromTokenAccount;
    }
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
      message: "Enter amount to bridge (in token units):",
      placeholder: "1",
      initialValue: "1",
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

export const bridgeSplCommand = new Command("bridge-spl")
  .description("Bridge SPL tokens from Solana to Base")
  .option("--cluster <cluster>", "Target cluster (devnet)")
  .option("--release <release>", "Release type (alpha | prod)")
  .option(
    "--mint <address>",
    "SPL token mint: 'constant' or custom mint address"
  )
  .option(
    "--remote-token <remoteToken>",
    "Remote ERC20 token: 'constant' or custom address"
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
    const parsed = argsSchema.safeParse(opts);
    if (!parsed.success) {
      logger.error("Validation failed:");
      parsed.error.issues.forEach((err) => {
        logger.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      process.exit(1);
    }
    await handleBridgeSpl(parsed.data);
  });
