import { Command } from "commander";

import { pubkeyToBytes32Command } from "./pubkey-to-bytes32.command";
import { keypairToAddressCommand } from "./keypair-to-address.command";
import { generateKeypairCommand } from "./generate-keypair.command";

export const utilsCommand = new Command("utils").description(
  "Utility commands"
);

utilsCommand.addCommand(pubkeyToBytes32Command);
utilsCommand.addCommand(keypairToAddressCommand);
utilsCommand.addCommand(generateKeypairCommand);
