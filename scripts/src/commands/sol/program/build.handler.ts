import { z } from "zod";
import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";

import { logger } from "@internal/logger";
import { findGitRoot } from "@internal/utils";
import { getKeypairSignerFromPath } from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS } from "@internal/constants";

const programKeypairSchema = z.union([
  z.literal("protocol"),
  z.string().brand<"programKp">(),
]);

export const argsSchema = z.object({
  deployEnv: z
    .enum(DEPLOY_ENVS, {
      message:
        "Deploy environment must be either 'testnet-alpha' or 'testnet-prod'",
    })
    .default("testnet-alpha"),
  bridgeProgramKp: programKeypairSchema.default("protocol"),
  baseRelayerProgramKp: programKeypairSchema.default("protocol"),
});

type Args = z.infer<typeof argsSchema>;
type ProgramKpArg = z.infer<typeof programKeypairSchema>;
type ProgramDir = "bridge" | "base_relayer";

type ProgramContext = {
  name: string;
  dir: ProgramDir;
  kpArg: ProgramKpArg;
  configKeypairPath: string;
  libRsPath: string;
  backupPath: string;
  isRestored: boolean;
};

export async function handleBuild(args: Args): Promise<void> {
  try {
    logger.info("--- Build script ---");

    // Get config for cluster and release
    const config = CONFIGS[args.deployEnv];

    // Get project root
    const projectRoot = await findGitRoot();
    logger.info(`Project root: ${projectRoot}`);

    // Prepare program contexts
    const programContexts: ProgramContext[] = [];

    const programDefinitions: Array<
      Omit<ProgramContext, "libRsPath" | "backupPath" | "isRestored">
    > = [
      {
        name: "Bridge",
        dir: "bridge",
        kpArg: args.bridgeProgramKp,
        configKeypairPath: config.solana.bridgeKpPath,
      },
      {
        name: "Base Relayer",
        dir: "base_relayer",
        kpArg: args.baseRelayerProgramKp,
        configKeypairPath: config.solana.baseRelayerKpPath,
      },
    ];

    for (const definition of programDefinitions) {
      const libRsPath = await findLibRs(projectRoot, definition.dir);
      logger.info(`[${definition.name}] Found lib.rs at: ${libRsPath}`);

      const backupPath = `${libRsPath}.backup`;
      await $`cp ${libRsPath} ${backupPath}`;
      logger.info(`[${definition.name}] Backed up lib.rs`);

      programContexts.push({
        ...definition,
        libRsPath,
        backupPath,
        isRestored: false,
      });
    }

    // Setup signal handlers to ensure cleanup on interruption
    const restoreAllLibs = async () => {
      for (const context of programContexts) {
        if (!context.isRestored && existsSync(context.backupPath)) {
          await $`mv ${context.backupPath} ${context.libRsPath}`;
          logger.info(`[${context.name}] Restored lib.rs`);
          context.isRestored = true;
        }
      }
    };

    const signalHandler = async (signal: string) => {
      logger.info(`\nReceived ${signal}, cleaning up...`);
      await restoreAllLibs();
      process.exit(128 + (signal === "SIGINT" ? 2 : 15));
    };

    // Register signal handlers
    process.on("SIGINT", () => signalHandler("SIGINT")); // Ctrl+C
    process.on("SIGTERM", () => signalHandler("SIGTERM")); // Kill
    process.on("SIGHUP", () => signalHandler("SIGHUP")); // Terminal closed

    try {
      // Update declare_id in lib.rs for each program
      for (const context of programContexts) {
        const programId = await resolveProgramId(
          projectRoot,
          context.kpArg,
          context.configKeypairPath,
          context.name
        );
        logger.info(`[${context.name}] Program ID: ${programId}`);

        const libContent = await Bun.file(context.libRsPath).text();
        const updatedContent = libContent.replace(
          /declare_id!\("([^"]+)"\)/,
          `declare_id!("${programId}")`
        );

        await Bun.write(context.libRsPath, updatedContent);
        logger.info(`[${context.name}] Updated declare_id in lib.rs`);
      }

      // Build program with cargo-build-sbf
      logger.info("Running cargo-build-sbf...");
      const solanaDir = join(projectRoot, "solana");
      await $`cargo-build-sbf`.cwd(solanaDir);

      logger.success("Program build completed!");
    } finally {
      // Always restore lib.rs
      await restoreAllLibs();

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
  programDir: ProgramDir
): Promise<string> {
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
  programKpPath: string,
  programName: string
): Promise<string> {
  let kpPath = programKpArg;

  if (kpPath === "protocol") {
    kpPath = join(projectRoot, "solana", programKpPath) as ProgramKpArg;
    logger.info(`[${programName}] Using protocol keypair: ${kpPath}`);
  } else {
    logger.info(`[${programName}] Using custom keypair: ${kpPath}`);
  }

  const signer = await getKeypairSignerFromPath(kpPath);
  return signer.address;
}
