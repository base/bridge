import { Command } from "commander";

import { pubkeyToBytes32Command } from "./pubkey-to-bytes32.command";

export const utilsCommand = new Command("utils").description(
  "Utility commands"
);

utilsCommand.addCommand(pubkeyToBytes32Command);
