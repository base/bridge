import { Command } from "commander";
import { text, select, isCancel, cancel } from "@clack/prompts";

import { logger } from "@internal/logger";
import { argsSchema, handlePrintAuthority } from "./print-authority.handler";
import { isHash } from "viem";

type CommanderOptions = {
  deployEnv?: string;
  multisigId?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  // Deploy Environment
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

  // Multisig ID
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

  return opts;
}

export const printAuthorityCommand = new Command("print-authority")
  .description("Get the multisig signer PDA address for a given multisig ID")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (development-alpha | development-prod)"
  )
  .option("--multisig-id <id>", "Multisig ID")
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
    await handlePrintAuthority(parsed.data);
  });
