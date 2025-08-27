import { Command } from "commander";

import { logger } from "../../../internal/logger";
import { handleGenerateClient } from "./generate-client.handler";

export const generateClientCommand = new Command("generate-client")
  .description("Generate TypeScript client from IDL")
  .action(async () => {
    try {
      await handleGenerateClient();
    } catch (error) {
      logger.error("Client generation failed:", error);
      process.exit(1);
    }
  });
