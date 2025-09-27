import { Command } from "commander";

import { printAuthorityCommand } from "./print-authority.command";

import { proposeUpgradeCommand } from "./propose-upgrade.command";
import { processProposalCommand } from "./process-proposal.command";

export const mcmCommand = new Command("mcm").description(
  "MCM program utilities"
);

mcmCommand.addCommand(printAuthorityCommand);

mcmCommand.addCommand(proposeUpgradeCommand);
mcmCommand.addCommand(processProposalCommand);
