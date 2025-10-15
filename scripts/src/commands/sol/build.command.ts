import { Command } from "commander";

import {
  getInteractiveSelect,
  getInteractiveConfirm,
  getOrPromptFilePath,
  validateAndExecute,
} from "@internal/utils/cli";
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
    opts.deployEnv = await getInteractiveSelect({
      message: "Select target deploy environment:",
      options: [
        { value: "testnet-alpha", label: "Testnet Alpha" },
        { value: "testnet-prod", label: "Testnet Prod" },
      ],
      initialValue: "testnet-alpha",
    });
  }

  // Bridge program keypair with "protocol" as default
  if (!opts.bridgeProgramKp) {
    const useProtocol = await getInteractiveConfirm(
      "Use protocol keypair for Bridge?",
      true
    );
    if (useProtocol) {
      opts.bridgeProgramKp = "protocol";
    } else {
      opts.bridgeProgramKp = await getOrPromptFilePath(
        undefined,
        "Enter path to Bridge program keypair",
        []
      );
    }
  }

  // Base Relayer program keypair with "protocol" as default
  if (!opts.baseRelayerProgramKp) {
    const useProtocol = await getInteractiveConfirm(
      "Use protocol keypair for Base Relayer?",
      true
    );
    if (useProtocol) {
      opts.baseRelayerProgramKp = "protocol";
    } else {
      opts.baseRelayerProgramKp = await getOrPromptFilePath(
        undefined,
        "Enter path to Base Relayer program keypair",
        []
      );
    }
  }

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
    await validateAndExecute(argsSchema, opts, handleBuild);
  });
