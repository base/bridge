import { Command } from "commander";

import { splCommand } from "./spl";
import { bridgeCommand } from "./bridge";
import { baseRelayerCommand } from "./base-relayer";

export const onchainCommand = new Command("onchain").description(
  "Onchain utilities"
);

onchainCommand.addCommand(splCommand);
onchainCommand.addCommand(bridgeCommand);
onchainCommand.addCommand(baseRelayerCommand);
