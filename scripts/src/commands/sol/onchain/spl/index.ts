import { Command } from "commander";

import { createMintCommand } from "./create-mint.command";
import { createAtaCommand } from "./create-ata.command";
import { mintCommand } from "./mint.command";

export const splCommand = new Command("spl").description("SPL token utilities");

splCommand.addCommand(createMintCommand);
splCommand.addCommand(createAtaCommand);
splCommand.addCommand(mintCommand);
