import { Command } from "commander";

import { initializeCommand } from "./initialize.command";
import {
  bridgeCallCommand,
  bridgeSolCommand,
  bridgeSplCommand,
  bridgeWrappedTokenCommand,
  wrapTokenCommand,
} from "./solana-to-base";
import { relayMessageCommand, proveMessageCommand } from "./base-to-solana";

export const bridgeCommand = new Command("bridge").description(
  "Bridge management commands"
);

bridgeCommand.addCommand(initializeCommand);

// Solana to Base
bridgeCommand.addCommand(bridgeCallCommand);
bridgeCommand.addCommand(bridgeSolCommand);
bridgeCommand.addCommand(bridgeSplCommand);
bridgeCommand.addCommand(bridgeWrappedTokenCommand);
bridgeCommand.addCommand(wrapTokenCommand);

// Base to Solana
bridgeCommand.addCommand(proveMessageCommand);
bridgeCommand.addCommand(relayMessageCommand);
