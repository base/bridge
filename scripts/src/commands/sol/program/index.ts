import { Command } from "commander";

import { buildCommand } from "./build.command";

import { deployCommand } from "./deploy.command";
import { writeBufferCommand } from "./write-buffer.command";

import { generateIdlCommand } from "./generate-idl.command";
import { generateClientCommand } from "./generate-client.command";

import { mcmCommand } from "./mcm";

export const programCommand = new Command("program").description(
  "Program management commands"
);

programCommand.addCommand(buildCommand);

programCommand.addCommand(deployCommand);
programCommand.addCommand(writeBufferCommand);

programCommand.addCommand(generateIdlCommand);
programCommand.addCommand(generateClientCommand);

programCommand.addCommand(mcmCommand);
