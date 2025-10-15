import { Command } from "commander";

import { buildCommand } from "./build.command";
import { deployCommand } from "./deploy.command";
import { generateIdlCommand } from "./generate-idl.command";
import { generateClientCommand } from "./generate-client.command";
import { generateKeypairCommand } from "./generate-keypair.command";
import { pubkeyToBytes32Command } from "./pubkey-to-bytes32.command";
import { splCommand } from "./spl";
import { bridgeCommand } from "./bridge";
import { baseRelayerCommand } from "./base-relayer";

export const solCommand = new Command("sol").description("Solana commands");

solCommand.addCommand(buildCommand);
solCommand.addCommand(deployCommand);
solCommand.addCommand(generateIdlCommand);
solCommand.addCommand(generateClientCommand);
solCommand.addCommand(generateKeypairCommand);
solCommand.addCommand(pubkeyToBytes32Command);

solCommand.addCommand(splCommand);
solCommand.addCommand(bridgeCommand);
solCommand.addCommand(baseRelayerCommand);
