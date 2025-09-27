import { Command } from "commander";
import { select, text, confirm, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import { logger } from "@internal/logger";
import { argsSchema, handleDeploy } from "./deploy.handler";

type CommanderOptions = {
  deployEnv?: string;
  deployerKp?: string;
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

  if (!opts.deployerKp) {
    const deployerKp = await select({
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
    if (isCancel(deployerKp)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (deployerKp === "custom") {
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
      opts.deployerKp = deployerKp;
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
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod)"
  )
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
