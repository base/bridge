import { Command } from "commander";
import { select, text, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";
import { isAddress, isHash } from "viem";

import { logger } from "@internal/logger";
import { argsSchema, handleAppendSigners } from "./append-signers.handler";

type CommanderOptions = {
  deployEnv?: string;
  payerKp?: string;
  multisigId?: string;
  signers?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  if (!opts.deployEnv) {
    const deployEnv = await select({
      message: "Select target deploy environment:",
      options: [
        { value: "development-alpha", label: "Development Alpha" },
        { value: "development-prod", label: "Development Prod" },
      ],
      initialValue: "development-alpha",
    });
    if (isCancel(deployEnv)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.deployEnv = deployEnv;
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

  if (!opts.multisigId) {
    const multisigId = await text({
      message: "Enter multisig ID:",
      placeholder:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      validate: (value) => {
        if (!isHash(value)) {
          return "Multisig ID must be a 32-byte hex string";
        }
      },
    });
    if (isCancel(multisigId)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.multisigId = multisigId.trim();
  }

  if (!opts.signers) {
    const signers = await text({
      message: "Enter signer addresses (comma-separated Ethereum addresses):",
      placeholder:
        "0x25f7fD8f50D522b266764cD3b230EDaA8CbB9f75,0x742d35Cc6634C0532925a3b8D0Cb6c42de12345",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Signers cannot be empty";
        }
        const addresses = value.split(",").map((s) => s.trim());
        for (const addr of addresses) {
          if (!isAddress(addr)) {
            return `Invalid Ethereum address: ${addr}`;
          }
        }
      },
    });
    if (isCancel(signers)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.signers = signers.trim();
  }

  return opts;
}

export const appendSignersCommand = new Command("append-signers")
  .description("Append a batch of signer addresses to multisig storage")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (development-alpha | development-prod)"
  )
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .option("--multisig-id <id>", "Multisig ID")
  .option("--signers <addresses>", "Comma-separated Ethereum addresses (0x...)")
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);
    const parsed = argsSchema.safeParse(opts);
    if (!parsed.success) {
      logger.error("Validation failed:");
      parsed.error.issues.forEach((err: any) => {
        logger.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      process.exit(1);
    }
    await handleAppendSigners(parsed.data);
  });
