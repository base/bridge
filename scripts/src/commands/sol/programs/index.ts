import { Command } from "commander";

import { buildCommand } from "./build.command";
import { deployCommand } from "./deploy.command";
import { generateIdlCommand } from "./generate-idl.command";
import { generateClientCommand } from "./generate-client.command";

export const programsCommand = new Command("programs").description(
  "Program management commands"
);

programsCommand.addCommand(buildCommand);
programsCommand.addCommand(deployCommand);
programsCommand.addCommand(generateIdlCommand);
programsCommand.addCommand(generateClientCommand);
