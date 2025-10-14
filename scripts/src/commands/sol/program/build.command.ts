import { Command } from "commander";
import { select, text, confirm, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";
import { argsSchema, handleBuild } from "./build.handler";

type CommanderOptions = {
  deployEnv?: string;
  bridgeProgramKp?: string;
  baseRelayerProgramKp?: string;
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

  const ensureProgramKeypair = async (
    optionKey: "bridgeProgramKp" | "baseRelayerProgramKp",
    programLabel: string
  ) => {
    if (opts[optionKey]) {
      return;
    }

    const useProtocolKeypair = await confirm({
      message: `Use protocol keypair for ${programLabel}?`,
      initialValue: true,
    });
    if (isCancel(useProtocolKeypair)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (useProtocolKeypair) {
      opts[optionKey] = "protocol";
      return;
    }

    const keypairPath = await text({
      message: `Enter path to ${programLabel} program keypair:`,
      placeholder: "/path/to/keypair.json",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Keypair path cannot be empty";
        }
        // Remove surrounding quotes if present
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
    // Clean the path before storing
    opts[optionKey] = keypairPath.trim().replace(/^["']|["']$/g, "");
  };

  await ensureProgramKeypair("bridgeProgramKp", "Bridge");
  await ensureProgramKeypair("baseRelayerProgramKp", "Base Relayer");

  return opts;
}

export const buildCommand = new Command("build")
  .description("Build the Solana bridge and base-relayer programs")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod)"
  )
  .option(
    "--bridge-program-kp <path>",
    "Bridge program keypair: 'protocol' or custom program keypair path"
  )
  .option(
    "--base-relayer-program-kp <path>",
    "Base relayer program keypair: 'protocol' or custom program keypair path"
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
    await handleBuild(parsed.data);
  });
