import { Command } from "commander";
import { select, text, confirm, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";
import { argsSchema, handleBuild } from "./build.handler";

type CommanderOptions = {
  deployEnv?: string;
  program?: string;
  programKp?: string;
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

  if (!opts.program) {
    const program = await select({
      message: "Select program to build:",
      options: [
        { value: "bridge", label: "Bridge" },
        { value: "base-relayer", label: "Base Relayer" },
      ],
      initialValue: "bridge",
    });
    if (isCancel(program)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.program = program;
  }

  if (!opts.programKp) {
    const useProtocolKeypair = await confirm({
      message: "Use protocol keypair?",
      initialValue: true,
    });
    if (isCancel(useProtocolKeypair)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (useProtocolKeypair) {
      opts.programKp = "protocol";
    } else {
      const keypairPath = await text({
        message: "Enter path to program keypair:",
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
      opts.programKp = keypairPath.trim().replace(/^["']|["']$/g, "");
    }
  }

  return opts;
}

export const buildCommand = new Command("build")
  .description("Build a Solana program (bridge | base-relayer)")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod)"
  )
  .option("--program <program>", "Program to build (bridge | base-relayer)")
  .option(
    "--program-kp <path>",
    "Program keypair: 'protocol' or custom program keypair path"
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
