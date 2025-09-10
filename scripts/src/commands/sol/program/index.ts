import { Command } from "commander";

import { buildCommand } from "./build.command";
import { deployCommand } from "./deploy.command";
import { generateIdlCommand } from "./generate-idl.command";
import { generateClientCommand } from "./generate-client.command";

export const programCommand = new Command("program").description(
  "Program management commands"
);

programCommand.addCommand(buildCommand);
programCommand.addCommand(deployCommand);
programCommand.addCommand(generateIdlCommand);
programCommand.addCommand(generateClientCommand);
