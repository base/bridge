import { z } from "zod";
import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { getBase58Codec } from "@solana/kit";

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
  deployerKp: z
    .union([
      z.literal("protocol"),
      z.literal("config"),
      z.string().brand<"deployerKp">(),
    ])
    .default("protocol"),
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
type DeployerKpArg = z.infer<typeof argsSchema.shape.deployerKp>;
type ProgramKpArg = z.infer<typeof argsSchema.shape.programKp>;

export async function handleDeploy(args: Args): Promise<void> {
  try {
    logger.info("--- Deploy script ---");

    // Get config for cluster and release
    const config = CONFIGS[args.deployEnv];

    // Get project root
    const projectRoot = await findGitRoot();
    logger.info(`Project root: ${projectRoot}`);

    const deployerKpPath = await resolveDeployerKp(
      projectRoot,
      args.deployerKp,
      config.solana.deployerKpPath
    );
    const { address: deployerAddress } =
      await getKeypairSignerFromPath(deployerKpPath);
    logger.info(`Deployer: ${deployerAddress}`);

    const programKpPath = await resolveProgramKp(
      projectRoot,
      args.programKp,
      args.program === "bridge"
        ? config.solana.bridgeKpPath
        : config.solana.baseRelayerKpPath
    );
    const { address: programAddress } =
      await getKeypairSignerFromPath(programKpPath);

    const bytes32 = getBase58Codec().encode(programAddress).toHex();
    logger.info(`Program ID: ${programAddress} (0x${bytes32})`);

    const programBinaryPath = await getProgramBinaryPath(
      projectRoot,
      args.program
    );
    logger.info(`Program binary: ${programBinaryPath}`);

    // Deploy program
    logger.info("Deploying program...");
    await $`solana program deploy --url ${config.solana.cluster} --keypair ${deployerKpPath} --program-id ${programKpPath} ${programBinaryPath}`;

    logger.success("Program deployment completed!");
  } catch (error) {
    logger.error("Failed to deploy program:", error);
    throw error;
  }
}

async function resolveDeployerKp(
  projectRoot: string,
  deployerKpArg: DeployerKpArg,
  deployerKpPath: string
): Promise<string> {
  let kpPath: string;

  if (deployerKpArg === "protocol") {
    kpPath = join(projectRoot, "solana", deployerKpPath);
    logger.info(`Using project deployer keypair: ${kpPath}`);
  } else if (deployerKpArg === "config") {
    const homeDir = homedir();
    kpPath = join(homeDir, ".config/solana/id.json");
    logger.info(`Using Solana CLI config keypair: ${kpPath}`);
  } else {
    kpPath = deployerKpArg;
    logger.info(`Using custom deployer keypair: ${deployerKpArg}`);
  }

  if (!existsSync(kpPath)) {
    throw new Error(`Deployer keypair not found at: ${kpPath}`);
  }

  return kpPath;
}

async function resolveProgramKp(
  projectRoot: string,
  programKpArg: ProgramKpArg,
  programKpPath: string
): Promise<string> {
  let kpPath = programKpArg;

  if (kpPath === "protocol") {
    kpPath = join(projectRoot, "solana", programKpPath) as ProgramKpArg;
    logger.info(`Using protocol program keypair: ${kpPath}`);
  } else {
    logger.info(`Using custom program keypair: ${programKpArg}`);
  }

  if (!existsSync(kpPath)) {
    throw new Error(`Program keypair not found at: ${kpPath}`);
  }

  return kpPath;
}

async function getProgramBinaryPath(
  projectRoot: string,
  programArg: ProgramArg
): Promise<string> {
  const binaryName = programArg === "bridge" ? "bridge.so" : "base_relayer.so";
  const programBinaryPath = join(
    projectRoot,
    `solana/target/deploy/${binaryName}`
  );
  if (!existsSync(programBinaryPath)) {
    throw new Error(`Program binary not found at: ${programBinaryPath}`);
  }
  return programBinaryPath;
}
