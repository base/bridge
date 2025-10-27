import { Command } from "commander";

import {
  getOrPromptHash,
  getOrPromptFilePath,
  getOrPromptDeployEnv,
  validateAndExecute,
} from "@internal/utils/cli";
import { argsSchema, handleRelayMessage } from "./relay-message.handler";

type CommanderOptions = {
  deployEnv?: string;
  messageHash?: string;
  payerKp?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  if (!opts.deployEnv) {
    opts.deployEnv = await getOrPromptDeployEnv();
  }

  opts.messageHash = await getOrPromptHash(
    opts.messageHash,
    "Enter message hash to relay"
  );

  opts.payerKp = await getOrPromptFilePath(
    opts.payerKp,
    "Enter payer keypair path (or 'config' for Solana CLI config)",
    ["config"]
  );

  return opts;
}

export const relayMessageCommand = new Command("relay-message")
  .description("Relay a message from Base to Solana")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod | mainnet)"
  )
  .option("--message-hash <hash>", "Message hash to relay (0x...)")
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);
    await validateAndExecute(argsSchema, opts, handleRelayMessage);
  });
