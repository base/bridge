import { Command } from "commander";
import { select, text, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";
import { isAddress } from "@solana/kit";

import { logger } from "@internal/logger";
import { argsSchema, handleCreateMint } from "./create-mint.handler";

type CommanderOptions = {
  cluster?: string;
  release?: string;
  decimals?: string;
  mintAuthority?: string;
  payerKp?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  if (!opts.cluster) {
    const cluster = await select({
      message: "Select RPC:",
      options: [{ value: "devnet", label: "Devnet (api.devnet.solana.com)" }],
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
      placeholder: "9",
      initialValue: "9",
      validate: (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 0 || num > 18) {
          return "Decimals must be a number between 0 and 18";
        }
      },
    });
    if (isCancel(decimals)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.decimals = decimals;
  }

  if (!opts.mintAuthority) {
    const mintAuthority = await text({
      message: "Enter mint authority address (or 'payer' for payer address):",
      placeholder: "payer",
      initialValue: "payer",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Mint authority cannot be empty";
        }

        if (value !== "payer") {
          if (!isAddress(value.trim())) {
            return "Invalid address";
          }
        }
      },
    });
    if (isCancel(mintAuthority)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.mintAuthority = mintAuthority.trim();
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

export const createMintCommand = new Command("create-mint")
  .description("Create a new SPL token mint")
  .option("--cluster <cluster>", "Cluster: 'devnet'")
  .option("--release <release>", "Release type (alpha | prod)")
  .option("--decimals <decimals>", "Token decimals")
  .option(
    "--mint-authority <address>",
    "Mint authority: 'payer' or custom mint authority address"
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
    await handleCreateMint(parsed.data);
  });
