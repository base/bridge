import { Command } from "commander";

import { initializeCommand } from "./initialize.command";

export const baseRelayerCommand = new Command("base-relayer").description(
  "Base Relayer management commands"
);

baseRelayerCommand.addCommand(initializeCommand);
