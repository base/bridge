import { Command } from "commander";
import { select, text, confirm, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";
import { argsSchema, handleDeploy } from "./deploy.handler";

type CommanderOptions = {
  cluster?: string;
  release?: string;
  deployerKp?: string;
  program?: string;
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

  if (!opts.deployerKp) {
    const deployerType = await select({
      message: "Select deployer keypair source:",
      options: [
        { value: "protocol", label: "Protocol deployer" },
        {
          value: "config",
          label: "Solana CLI config (~/.config/solana/id.json)",
        },
        { value: "custom", label: "Custom keypair path" },
      ],
      initialValue: "protocol",
    });
    if (isCancel(deployerType)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (deployerType === "custom") {
      const deployerPath = await text({
        message: "Enter path to deployer keypair:",
        placeholder: "/path/to/deployer.json",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Deployer keypair path cannot be empty";
          }
          // Remove surrounding quotes if present
          const cleanPath = value.trim().replace(/^["']|["']$/g, "");
          if (!existsSync(cleanPath)) {
            return "Deployer keypair file does not exist";
          }
        },
      });
      if (isCancel(deployerPath)) {
        cancel("Operation cancelled.");
        process.exit(1);
      }
      // Clean the path before storing
      opts.deployerKp = deployerPath.trim().replace(/^["']|["']$/g, "");
    } else {
      opts.deployerKp = deployerType;
    }
  }

  if (!opts.program) {
    const program = await select({
      message: "Select program to deploy:",
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
    const useProtocolProgram = await confirm({
      message: "Use protocol program keypair?",
      initialValue: true,
    });
    if (isCancel(useProtocolProgram)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (useProtocolProgram) {
      opts.programKp = "protocol";
    } else {
      const programPath = await text({
        message: "Enter path to program keypair:",
        placeholder: "/path/to/program.json",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Program keypair path cannot be empty";
          }
          // Remove surrounding quotes if present
          const cleanPath = value.trim().replace(/^["']|["']$/g, "");
          if (!existsSync(cleanPath)) {
            return "Program keypair file does not exist";
          }
        },
      });
      if (isCancel(programPath)) {
        cancel("Operation cancelled.");
        process.exit(1);
      }
      // Clean the path before storing
      opts.programKp = programPath.trim().replace(/^["']|["']$/g, "");
    }
  }

  return opts;
}

export const deployCommand = new Command("deploy")
  .description("Deploy a Solana program (bridge | base-relayer)")
  .option("--cluster <cluster>", "Target cluster (devnet)")
  .option("--release <release>", "Release type (alpha | prod)")
  .option(
    "--deployer-kp <path>",
    "Deployer keypair: 'protocol', 'config', or custom deployer keypair path"
  )
  .option("--program <program>", "Program to deploy (bridge | base-relayer)")
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
    await handleDeploy(parsed.data);
  });
