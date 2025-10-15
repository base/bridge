import { Command } from "commander";

import {
  getInteractiveSelect,
  getInteractiveConfirm,
  getOrPromptFilePath,
  validateAndExecute,
} from "@internal/utils/cli";
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
    opts.deployEnv = await getInteractiveSelect({
      message: "Select target deploy environment:",
      options: [
        { value: "testnet-alpha", label: "Testnet Alpha" },
        { value: "testnet-prod", label: "Testnet Prod" },
      ],
      initialValue: "testnet-alpha",
    });
  }

  if (!opts.deployerKp) {
    const deployerKp = await getInteractiveSelect({
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

    if (deployerKp === "custom") {
      opts.deployerKp = await getOrPromptFilePath(
        undefined,
        "Enter path to deployer keypair",
        []
      );
    } else {
      opts.deployerKp = deployerKp;
    }
  }

  if (!opts.program) {
    opts.program = await getInteractiveSelect({
      message: "Select program to deploy:",
      options: [
        { value: "bridge", label: "Bridge" },
        { value: "base-relayer", label: "Base Relayer" },
      ],
      initialValue: "bridge",
    });
  }

  if (!opts.programKp) {
    const useProtocol = await getInteractiveConfirm(
      "Use protocol program keypair?",
      true
    );

    if (useProtocol) {
      opts.programKp = "protocol";
    } else {
      opts.programKp = await getOrPromptFilePath(
        undefined,
        "Enter path to program keypair",
        []
      );
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
    await validateAndExecute(argsSchema, opts, handleDeploy);
  });
