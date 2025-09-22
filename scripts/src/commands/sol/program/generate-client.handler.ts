import { join } from "path";
import { mkdirSync } from "fs";
import * as c from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor as renderJavaScriptVisitor } from "@codama/renderers-js";
import { z } from "zod";

import { logger } from "@internal/logger";
import { findGitRoot } from "@internal/utils";

export const argsSchema = z.object({
  program: z
    .enum(["bridge", "base-relayer"], {
      message: "Program must be either 'bridge' or 'base-relayer'",
    })
    .default("bridge"),
});

type GenerateClientArgs = z.infer<typeof argsSchema>;

export async function handleGenerateClient(
  args: GenerateClientArgs
): Promise<void> {
  try {
    logger.info("--- Generate client script ---");

    const projectRoot = await findGitRoot();
    logger.info(`Project root: ${projectRoot}`);

    const programDir = args.program === "bridge" ? "bridge" : "base_relayer";
    const outputDir = args.program === "bridge" ? "bridge" : "base-relayer";

    const idlPath = join(projectRoot, `solana/programs/${programDir}/idl.json`);
    const clientOutputPath = join(
      projectRoot,
      `clients/ts/src/${outputDir}/generated`
    );

    logger.info(`IDL Path: ${idlPath}`);
    logger.info(`Client Output Path: ${clientOutputPath}`);

    logger.info("Instantiating Codama...");
    const idl = rootNodeFromAnchor(require(idlPath));
    const codama = c.createFromRoot(idl);

    logger.info("Rendering TypeScript client...");
    codama.accept(renderJavaScriptVisitor(clientOutputPath));

    const programClientDir = join(projectRoot, "clients/ts/src", outputDir);
    mkdirSync(programClientDir, { recursive: true });
    const indexPath = join(programClientDir, "index.ts");
    await Bun.write(indexPath, 'export * from "./generated";\n');

    logger.success("Client generation completed!");
  } catch (error) {
    logger.error("Client generation failed:", error);
    throw error;
  }
}
