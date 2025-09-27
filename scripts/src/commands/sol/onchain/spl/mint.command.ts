import { existsSync } from "fs";
import { Command } from "commander";
import { text, isCancel, cancel, select } from "@clack/prompts";
import { isAddress } from "@solana/kit";

import { logger } from "@internal/logger";
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

  if (!opts.mint) {
    const mint = await text({
      message: "Enter mint address:",
      placeholder: "11111111111111111111111111111112",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Mint address cannot be empty";
        }
        if (!isAddress(value.trim())) {
          return "Invalid mint address";
        }
      },
    });
    if (isCancel(mint)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.mint = mint.trim();
  }

  if (!opts.to) {
    const to = await text({
      message: "Enter recipient address (or 'config' for Solana CLI config):",
      placeholder: "config",
      initialValue: "config",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Recipient address cannot be empty";
        }

        if (value !== "config") {
          if (!isAddress(value.trim())) {
            return "Invalid recipient address";
          }
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
      message: "Enter amount to mint:",
      placeholder: "100",
      initialValue: "100",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Amount cannot be empty";
        }
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
    opts.amount = amount.trim();
  }

  if (!opts.mintAuthorityKp) {
    const mintAuthorityKp = await text({
      message:
        "Enter mint authority keypair path (or 'config' for Solana CLI config):",
      placeholder: "config",
      initialValue: "config",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Mint authority keypair cannot be empty";
        }
        const cleanPath = value.trim().replace(/^["']|["']$/g, "");
        if (cleanPath !== "config" && !existsSync(cleanPath)) {
          return "Mint authority keypair file does not exist";
        }
      },
    });
    if (isCancel(mintAuthorityKp)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    // Clean the path before storing
    opts.mintAuthorityKp = mintAuthorityKp.trim().replace(/^["']|["']$/g, "");
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
    // Clean the path before storing
    opts.payerKp = payerKp.trim().replace(/^["']|["']$/g, "");
  }

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
    const parsed = argsSchema.safeParse(opts);
    if (!parsed.success) {
      logger.error("Validation failed:");
      parsed.error.issues.forEach((err) => {
        logger.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      process.exit(1);
    }
    await handleMint(parsed.data);
  });
