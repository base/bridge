import { Command } from "commander";

import {
  getInteractiveSelect,
  getInteractiveConfirm,
  getOrPromptHash,
  getOrPromptFilePath,
  validateAndExecute,
} from "@internal/utils/cli";
import { logger } from "@internal/logger";
import { argsSchema, handleProveMessage } from "./prove-message.handler";
import { handleRelayMessage } from "./relay-message.handler";

type CommanderOptions = {
  deployEnv?: string;
  transactionHash?: string;
  payerKp?: string;
  skipRelay?: boolean;
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

  opts.transactionHash = await getOrPromptHash(
    opts.transactionHash,
    "Enter Base transaction hash to prove"
  );

  opts.payerKp = await getOrPromptFilePath(
    opts.payerKp,
    "Enter payer keypair path (or 'config' for Solana CLI config)",
    ["config"]
  );

  if (opts.skipRelay === undefined) {
    const relayMessage = await getInteractiveConfirm(
      "Relay message after proving?",
      true
    );
    opts.skipRelay = !relayMessage;
  }

  return opts;
}

export const proveMessageCommand = new Command("prove-message")
  .description("Prove a message from Base transaction on Solana")
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod)"
  )
  .option("--transaction-hash <hash>", "Base transaction hash to prove (0x...)")
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .option("--skip-relay", "Skip message relay after proving")
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);

    await validateAndExecute(argsSchema, opts, async (parsed) => {
      const messageHash = await handleProveMessage(parsed);

      if (!opts.skipRelay) {
        logger.info("Relaying message...");
        await handleRelayMessage({
          deployEnv: parsed.deployEnv,
          messageHash: messageHash as any,
          payerKp: parsed.payerKp,
        });
      }
    });
  });
