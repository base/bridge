#!/usr/bin/env bun
import { Command } from "commander";
import { solCommand } from "./commands/sol";
import { utilsCommand } from "./commands/utils";

const program = new Command();

program.name("bridge").description("Bridge CLI").version("1.0.0");
program.addCommand(solCommand);
program.addCommand(utilsCommand);
program.parse();
