import { z } from "zod";
import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";

import { logger } from "@internal/logger";
import { findGitRoot } from "@internal/utils";
import { getKeypairSignerFromPath, CONSTANTS } from "@internal/sol";

export const argsSchema = z.object({
  cluster: z
    .enum(["devnet"], {
      message: "Cluster must be either 'devnet'",
    })
    .default("devnet"),
  release: z
    .enum(["alpha", "prod"], {
      message: "Release must be either 'alpha' or 'prod'",
    })
    .default("prod"),
  program: z
    .enum(["bridge", "base-relayer"], {
      message: "Program must be either 'bridge' or 'base-relayer'",
    })
    .default("bridge"),
  programKp: z
    .union([z.literal("protocol"), z.string().brand<"programKp">()])
    .default("protocol"),
});

type BuildArgs = z.infer<typeof argsSchema>;
type ProgramName = z.infer<typeof argsSchema.shape.program>;
type ProgramKp = z.infer<typeof argsSchema.shape.programKp>;

export async function handleBuild(args: BuildArgs): Promise<void> {
  try {
    logger.info("--- Build script ---");

    // Get config for cluster and release
    const config = CONSTANTS[args.cluster][args.release];

    // Get project root
    const projectRoot = await findGitRoot();
    logger.info(`Project root: ${projectRoot}`);

    // Derive features from cluster and release (only for bridge)
    const features =
      args.program === "bridge" ? `${args.cluster},${args.release}` : undefined;
    if (features) {
      logger.info(`Using features: ${features}`);
    }

    // Find lib.rs
    const libRsPath = await findLibRs(projectRoot, args.program);
    logger.info(`Found lib.rs at: ${libRsPath}`);

    // Get program ID from keypair
    const programKeyPairRel =
      args.program === "bridge"
        ? config.bridgeKeyPair
        : config.baseRelayerKeyPair;
    const programId = await resolveProgramId(
      projectRoot,
      args.programKp,
      programKeyPairRel
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
      if (features) {
        await $`cargo-build-sbf --features ${features} -- -p ${packageName}`.cwd(
          solanaDir
        );
      } else {
        await $`cargo-build-sbf -- -p ${packageName}`.cwd(solanaDir);
      }

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
  program: ProgramName
): Promise<string> {
  const programDir = program === "bridge" ? "bridge" : "base_relayer";
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
  programKp: ProgramKp,
  bridgeKeyPair: string
): Promise<string> {
  let keypairPath = programKp;

  if (keypairPath === "protocol") {
    keypairPath = join(projectRoot, "solana", bridgeKeyPair) as ProgramKp;
    logger.info(`Using protocol keypair: ${keypairPath}`);
  } else {
    logger.info(`Using custom keypair: ${keypairPath}`);
  }

  const signer = await getKeypairSignerFromPath(keypairPath);
  return signer.address;
}
