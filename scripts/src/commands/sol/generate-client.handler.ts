import { join } from "path";
import { mkdirSync } from "fs";
import * as c from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor as renderJavaScriptVisitor } from "@codama/renderers-js";
import { z } from "zod";

import { logger } from "@internal/logger";
import { findGitRoot } from "@internal/utils";

const TOKEN_2022_PROGRAM_ADDRESS = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

// Bridge instructions whose `token_program` is declared `Program<Token2022>` onchain. Codama
// defaults any account named `tokenProgram` to the legacy SPL Token program, which Anchor rejects
// for these, so the default has to be pinned. The `bridge_spl` instructions are intentionally
// absent: they take `Interface<TokenInterface>` and accept either program.
const TOKEN_2022_ONLY_INSTRUCTIONS = [
  "wrapToken",
  "bridgeWrappedToken",
  "bridgeWrappedTokenWithBufferedCall",
];

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

    codama.update(
      c.setInstructionAccountDefaultValuesVisitor(
        TOKEN_2022_ONLY_INSTRUCTIONS.map((instruction) => ({
          instruction,
          account: "tokenProgram",
          defaultValue: c.publicKeyValueNode(TOKEN_2022_PROGRAM_ADDRESS),
        }))
      )
    );

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
