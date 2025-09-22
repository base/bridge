import { Command } from "commander";

import { handleGenerateKeypair } from "./generate-keypair.handler";

export const generateKeypairCommand = new Command("generate-keypair")
  .description("Generate a new Solana keypair")
  .action(async () => {
    await handleGenerateKeypair();
  });
