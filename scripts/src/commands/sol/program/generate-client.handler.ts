import { join } from "path";
import * as c from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor as renderJavaScriptVisitor } from "@codama/renderers-js";

import { logger } from "../../../internal/logger";
import { findGitRoot } from "../../../internal/utils";

export async function handleGenerateClient(): Promise<void> {
  try {
    logger.info("--- Generate client script ---");

    const projectRoot = await findGitRoot();
    logger.info(`Project root: ${projectRoot}`);

    const solanaDir = join(projectRoot, "solana");
    const idlPath = join(solanaDir, "programs/bridge/idl.json");
    const clientOutputPath = join(projectRoot, "clients/ts/src/generated");

    logger.info(`IDL Path: ${idlPath}`);
    logger.info(`Client Output Path: ${clientOutputPath}`);

    logger.info("Instantiating Codama...");
    const idl = rootNodeFromAnchor(require(idlPath));
    const codama = c.createFromRoot(idl);

    logger.info("Rendering TypeScript client...");
    codama.accept(renderJavaScriptVisitor(clientOutputPath));

    logger.success("Client generation completed!");
  } catch (error) {
    logger.error("Client generation failed:", error);
    throw error;
  }
}
