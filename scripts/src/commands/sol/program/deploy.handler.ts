import { z } from "zod";
import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

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

type DeployArgs = z.infer<typeof argsSchema>;
type ProgramName = z.infer<typeof argsSchema.shape.program>;
type DeployerKp = z.infer<typeof argsSchema.shape.deployerKp>;
type ProgramKp = z.infer<typeof argsSchema.shape.programKp>;

export async function handleDeploy(args: DeployArgs): Promise<void> {
  try {
    logger.info("--- Deploy script ---");

    // Get config for cluster and release
    const config = CONSTANTS[args.cluster][args.release];

    // Get project root
    const projectRoot = await findGitRoot();
    logger.info(`Project root: ${projectRoot}`);

    const deployerKeypairPath = await resolveDeployerKeypair(
      projectRoot,
      args.deployerKp,
      config.deployerKeyPair
    );
    const { address: deployerAddress } =
      await getKeypairSignerFromPath(deployerKeypairPath);
    logger.info(`Deployer: ${deployerAddress}`);

    const programKeypairPath = await resolveProgramKeypair(
      projectRoot,
      args.programKp,
      args.program === "bridge"
        ? config.bridgeKeyPair
        : config.baseRelayerKeyPair
    );
    const { address: programAddress } =
      await getKeypairSignerFromPath(programKeypairPath);
    logger.info(`Program ID: ${programAddress}`);

    const programBinaryPath = await getProgramBinaryPath(
      projectRoot,
      args.program
    );
    logger.info(`Program binary: ${programBinaryPath}`);

    // Deploy program
    logger.info("Deploying program...");
    await $`solana program deploy --url ${args.cluster} --keypair ${deployerKeypairPath} --program-id ${programKeypairPath} ${programBinaryPath}`;

    logger.success("Program deployment completed!");
  } catch (error) {
    logger.error("Failed to deploy program:", error);
    throw error;
  }
}

async function resolveDeployerKeypair(
  projectRoot: string,
  deployerKp: DeployerKp,
  deployerKeyPair: string
): Promise<string> {
  let keypairPath: string;

  if (deployerKp === "protocol") {
    keypairPath = join(projectRoot, "solana", deployerKeyPair);
    logger.info(`Using project deployer keypair: ${keypairPath}`);
  } else if (deployerKp === "config") {
    const homeDir = homedir();
    keypairPath = join(homeDir, ".config/solana/id.json");
    logger.info(`Using Solana CLI config keypair: ${keypairPath}`);
  } else {
    keypairPath = deployerKp;
    logger.info(`Using custom deployer keypair: ${deployerKp}`);
  }

  if (!existsSync(keypairPath)) {
    throw new Error(`Deployer keypair not found at: ${keypairPath}`);
  }

  return keypairPath;
}

async function resolveProgramKeypair(
  projectRoot: string,
  programKp: ProgramKp,
  bridgeKeyPair: string
): Promise<string> {
  let keypairPath = programKp;

  if (keypairPath === "protocol") {
    keypairPath = join(projectRoot, "solana", bridgeKeyPair) as ProgramKp;
    logger.info(`Using protocol program keypair: ${keypairPath}`);
  } else {
    logger.info(`Using custom program keypair: ${programKp}`);
  }

  if (!existsSync(keypairPath)) {
    throw new Error(`Program keypair not found at: ${keypairPath}`);
  }

  return keypairPath;
}

async function getProgramBinaryPath(
  projectRoot: string,
  program: ProgramName
): Promise<string> {
  const binaryName = program === "bridge" ? "bridge.so" : "base_relayer.so";
  const programBinaryPath = join(
    projectRoot,
    `solana/target/deploy/${binaryName}`
  );
  if (!existsSync(programBinaryPath)) {
    throw new Error(`Program binary not found at: ${programBinaryPath}`);
  }
  return programBinaryPath;
}
