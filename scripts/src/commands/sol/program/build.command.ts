import { Command } from "commander";
import { select, text, confirm, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";
import { argsSchema, handleBuild } from "./build.handler";

type CommanderOptions = {
  cluster?: string;
  release?: string;
  programKp?: string;
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
  .description("Build the Bridge Solana program")
  .option("--cluster <cluster>", "Target cluster (devnet)")
  .option("--release <release>", "Release type (alpha | prod)")
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
