import { z } from "zod";
import { $ } from "bun";
import { existsSync } from "fs";
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
  programKp: z
    .union([z.literal("protocol"), z.string().brand<"programKp">()])
    .default("protocol"),
});

type Args = z.infer<typeof argsSchema>;
type ProgramArg = z.infer<typeof argsSchema.shape.program>;
type ProgramKpArg = z.infer<typeof argsSchema.shape.programKp>;

export async function handleBuild(args: Args): Promise<void> {
  try {
    logger.info("--- Build script ---");

    // Get config for cluster and release
    const config = CONFIGS[args.deployEnv];

    // Get project root
    const projectRoot = await findGitRoot();
    logger.info(`Project root: ${projectRoot}`);

    // Find lib.rs
    const libRsPath = await findLibRs(projectRoot, args.program);
    logger.info(`Found lib.rs at: ${libRsPath}`);

    // Get program ID from keypair
    const programKpPath =
      args.program === "bridge"
        ? config.solana.bridgeKpPath
        : config.solana.baseRelayerKpPath;

    const programId = await resolveProgramId(
      projectRoot,
      args.programKp,
      programKpPath
    );
    logger.info(`Program ID: ${programId}`);

    // Backup lib.rs
    const backupPath = `${libRsPath}.backup`;
    await $`cp ${libRsPath} ${backupPath}`;
    logger.info("Backed up lib.rs");

    // Setup signal handlers to ensure cleanup on interruption
    let isRestored = false;
    const restoreLibRs = async () => {
      if (!isRestored && existsSync(backupPath)) {
        logger.info("Interrupted! Restoring lib.rs...");
        await $`mv ${backupPath} ${libRsPath}`;
        logger.info("lib.rs restored");
        isRestored = true;
      }
    };

    const signalHandler = async (signal: string) => {
      logger.info(`\nReceived ${signal}, cleaning up...`);
      await restoreLibRs();
      process.exit(128 + (signal === "SIGINT" ? 2 : 15));
    };

    // Register signal handlers
    process.on("SIGINT", () => signalHandler("SIGINT")); // Ctrl+C
    process.on("SIGTERM", () => signalHandler("SIGTERM")); // Kill
    process.on("SIGHUP", () => signalHandler("SIGHUP")); // Terminal closed

    try {
      // Update declare_id in lib.rs
      const libContent = await Bun.file(libRsPath).text();
      const updatedContent = libContent.replace(
        /declare_id!\("([^"]+)"\)/,
        `declare_id!("${programId}")`
      );
      await Bun.write(libRsPath, updatedContent);
      logger.info("Updated declare_id in lib.rs");

      // Build program with cargo-build-sbf
      logger.info("Running cargo-build-sbf...");
      const solanaDir = join(projectRoot, "solana");
      const packageName = args.program === "bridge" ? "bridge" : "base_relayer";
      await $`cargo-build-sbf -- -p ${packageName}`.cwd(solanaDir);

      logger.success("Program build completed!");
    } finally {
      // Always restore lib.rs
      if (!isRestored) {
        await $`mv ${backupPath} ${libRsPath}`;
        logger.info("Restored lib.rs");
        isRestored = true;
      }

      // Remove signal handlers
      process.removeAllListeners("SIGINT");
      process.removeAllListeners("SIGTERM");
      process.removeAllListeners("SIGHUP");
    }
  } catch (error) {
    logger.error("Failed to build program:", error);
    throw error;
  }
}

async function findLibRs(
  projectRoot: string,
  programArg: ProgramArg
): Promise<string> {
  const programDir = programArg === "bridge" ? "bridge" : "base_relayer";
  const libRsPath = join(
    projectRoot,
    `solana/programs/${programDir}/src/lib.rs`
  );
  if (!existsSync(libRsPath)) {
    throw new Error(`lib.rs not found at: ${libRsPath}`);
  }

  return libRsPath;
}

async function resolveProgramId(
  projectRoot: string,
  programKpArg: ProgramKpArg,
  programKpPath: string
): Promise<string> {
  let kpPath = programKpArg;

  if (kpPath === "protocol") {
    kpPath = join(projectRoot, "solana", programKpPath) as ProgramKpArg;
    logger.info(`Using protocol keypair: ${kpPath}`);
  } else {
    logger.info(`Using custom keypair: ${kpPath}`);
  }

  const signer = await getKeypairSignerFromPath(kpPath);
  return signer.address;
}
