import { z } from "zod";
import { $ } from "bun";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import { logger } from "@internal/logger";
import { findGitRoot } from "@internal/utils";
import { getKeypairSignerFromPath } from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS } from "@internal/constants";

export const argsSchema = z.object({
  deployEnv: z
    .enum(DEPLOY_ENVS, {
      message:
        "Deploy environment must be either 'development-alpha' or 'development-prod'",
    })
    .default("development-alpha"),
  program: z
    .enum(["bridge", "base-relayer"], {
      message: "Program must be either 'bridge' or 'base-relayer'",
    })
    .default("bridge"),
  bufferKp: z
    .union([z.literal("generate"), z.string().brand<"bufferKp">()])
    .default("generate"),
  authorityKp: z
    .union([z.literal("config"), z.string().brand<"authorityKp">()])
    .default("config"),
});

type Args = z.infer<typeof argsSchema>;
type ProgramArg = z.infer<typeof argsSchema.shape.program>;
type BufferKpArg = z.infer<typeof argsSchema.shape.bufferKp>;

export async function handleWriteBuffer(args: Args): Promise<void> {
  try {
    logger.info("--- Write Buffer script ---");

    const config = CONFIGS[args.deployEnv];
    const projectRoot = await findGitRoot();
    const solanaDir = join(projectRoot, "solana");

    const programPath = await resolveProgramPath(projectRoot, args.program);
    const bufferKpPath = await resolveBufferKpPath(projectRoot, args.bufferKp);

    logger.info("Writing program binary to buffer...");

    const authorityKpPath =
      args.authorityKp === "config"
        ? join(homedir(), ".config/solana/id.json")
        : args.authorityKp;

    await $`solana program write-buffer ${programPath} --buffer ${bufferKpPath} --url ${config.solana.cluster} --buffer-authority ${authorityKpPath}`.cwd(
      solanaDir
    );

    const bufferSigner = await getKeypairSignerFromPath(bufferKpPath);
    const authoritySigner = await getKeypairSignerFromPath(authorityKpPath);

    logger.success("Buffer written successfully!");
    logger.info(`Buffer address: ${bufferSigner.address}`);
    logger.info(`Buffer authority: ${authoritySigner.address}`);
  } catch (error) {
    logger.error("Failed to write buffer:", error);
    throw error;
  }
}

async function resolveProgramPath(
  projectRoot: string,
  programArg: ProgramArg
): Promise<string> {
  const programName = programArg === "bridge" ? "bridge" : "base_relayer";

  const programPath = join(
    projectRoot,
    "solana",
    "target",
    "deploy",
    `${programName}.so`
  );

  if (!existsSync(programPath)) {
    throw new Error(`Built program not found: ${programPath}`);
  }

  return programPath;
}

async function resolveBufferKpPath(
  projectRoot: string,
  bufferKpArg: BufferKpArg
): Promise<string> {
  if (bufferKpArg === "generate") {
    const tempDir = join(projectRoot, "solana", "temp");
    await $`mkdir -p ${tempDir}`;

    const timestamp = Date.now();
    const bufferPath = join(tempDir, `buffer-${timestamp}.json`);

    await $`solana-keygen new --no-bip39-passphrase --outfile ${bufferPath}`;
    return bufferPath;
  }

  if (!existsSync(bufferKpArg)) {
    throw new Error(`Buffer keypair file not found: ${bufferKpArg}`);
  }

  return bufferKpArg;
}
