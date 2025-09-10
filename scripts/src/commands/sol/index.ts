import { Command } from "commander";

import { programCommand } from "./program";
import { onchainCommand } from "./onchain";
import { generateKeypairCommand } from "./generate-keypair.command";

export const solCommand = new Command("sol").description("Solana commands");

solCommand.addCommand(programCommand);
solCommand.addCommand(onchainCommand);
solCommand.addCommand(generateKeypairCommand);
