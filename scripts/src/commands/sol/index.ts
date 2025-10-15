import { Command } from "commander";

import { programsCommand } from "./programs";
import { onchainCommand } from "./onchain";
import { generateKeypairCommand } from "./generate-keypair.command";

export const solCommand = new Command("sol").description("Solana commands");

solCommand.addCommand(programsCommand);
solCommand.addCommand(onchainCommand);
solCommand.addCommand(generateKeypairCommand);
