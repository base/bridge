import { Command } from "commander";

import { deployCommand } from "./deploy.command";
import { initializeCommand } from "./initialize.command";

import { initSignersCommand } from "./signers/init-signers.command";
import { appendSignersCommand } from "./signers/append-signers.command";
import { finalizeSignersCommand } from "./signers/finalize-signers.command";
import { setConfigCommand } from "./signers/set-config.command";

import { initSignaturesCommand } from "./signatures/init-signatures.command";
import { appendSignaturesCommand } from "./signatures/append-signatures.command";
import { finalizeSignaturesCommand } from "./signatures/finalize-signatures.command";
import { clearSignaturesCommand } from "./signatures/clear-signatures.command";

import { setRootCommand } from "./set-root.command";
import { executeCommand } from "./execute.command";

export const mcmCommand = new Command("mcm").description(
  "MCM management commands"
);

mcmCommand.addCommand(deployCommand);
mcmCommand.addCommand(initializeCommand);

mcmCommand.addCommand(initSignersCommand);
mcmCommand.addCommand(appendSignersCommand);
mcmCommand.addCommand(finalizeSignersCommand);
mcmCommand.addCommand(setConfigCommand);

mcmCommand.addCommand(initSignaturesCommand);
mcmCommand.addCommand(appendSignaturesCommand);
mcmCommand.addCommand(finalizeSignaturesCommand);
mcmCommand.addCommand(clearSignaturesCommand);
mcmCommand.addCommand(setRootCommand);
mcmCommand.addCommand(executeCommand);
