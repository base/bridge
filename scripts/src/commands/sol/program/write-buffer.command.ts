import { Command } from "commander";
import { select, text, confirm, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";
import { argsSchema, handleWriteBuffer } from "./write-buffer.handler";

type CommanderOptions = {
  deployEnv?: string;
  program?: string;
  bufferKp?: string;
  authorityKp?: string;
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

  if (!opts.program) {
    const program = await select({
      message: "Select program to upgrade:",
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

  if (!opts.bufferKp) {
    const useNewBuffer = await confirm({
      message: "Generate new buffer keypair?",
      initialValue: true,
    });
    if (isCancel(useNewBuffer)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (!useNewBuffer) {
      const bufferPath = await text({
        message: "Enter path to buffer keypair:",
        placeholder: "/path/to/buffer.json",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Buffer keypair path cannot be empty";
          }
          const cleanPath = value.trim().replace(/^["']|["']$/g, "");
          if (!existsSync(cleanPath)) {
            return "Buffer keypair file does not exist";
          }
        },
      });
      if (isCancel(bufferPath)) {
        cancel("Operation cancelled.");
        process.exit(1);
      }
      opts.bufferKp = bufferPath.trim().replace(/^["']|["']$/g, "");
    } else {
      opts.bufferKp = "generate";
    }
  }

  if (!opts.authorityKp) {
    const authorityType = await select({
      message: "Select buffer authority:",
      options: [
        { value: "config", label: "Config (~/.config/solana/id.json)" },
        { value: "custom", label: "Custom keypair path" },
      ],
      initialValue: "config",
    });
    if (isCancel(authorityType)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (authorityType === "config") {
      opts.authorityKp = "config";
    } else {
      const authorityKp = await text({
        message: "Enter buffer authority keypair path:",
        placeholder: "~/.config/solana/id.json",
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
      if (isCancel(authorityKp)) {
        cancel("Operation cancelled.");
        process.exit(1);
      }
      // Clean the path before storing
      opts.authorityKp = authorityKp.trim().replace(/^["']|["']$/g, "");
    }
  }

  return opts;
}

export const writeBufferCommand = new Command("write-buffer")
  .description(
    "Write program binary to upgrade buffer (Step 1 of multisig upgrade)"
  )
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (development-alpha | development-prod)"
  )
  .option("--program <program>", "Program to upgrade (bridge | base-relayer)")
  .option(
    "--buffer-kp <path>",
    "Buffer keypair: 'generate' or custom buffer keypair path"
  )
  .option(
    "--authority-kp <path>",
    "Buffer authority: 'config' or custom keypair path"
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
    await handleWriteBuffer(parsed.data);
  });
