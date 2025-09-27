import { z } from "zod";
import { $ } from "bun";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { getBase58Codec } from "@solana/kit";

import { logger } from "@internal/logger";
import { getKeypairSignerFromPath } from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS } from "@internal/constants";

export const argsSchema = z.object({
  deployEnv: z
    .enum(DEPLOY_ENVS, {
      message:
        "Deploy environment must be either 'development-alpha' or 'development-prod'",
    })
    .default("development-alpha"),
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
  programKp: z.string().brand<"programKp">(),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

const CHAINLINK_MCM_PROGRAM_ID = "5vNJx78mz7KVMjhuipyr9jKBKcMrKYGdjGkgE4LUmjKk";

export async function handleDeploy(args: Args): Promise<void> {
  try {
    logger.info("--- MCM Deploy script ---");

    // Configuration
    const config = CONFIGS[args.deployEnv];
    logger.info(`Deploy environment: ${args.deployEnv}`);
    logger.info(`RPC URL: ${config.solana.cluster}`);

    // Resolve keypairs
    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    const programKp = await getKeypairSignerFromPath(args.programKp);
    const newProgramId = programKp.address;
    logger.info(`New program ID: ${newProgramId}`);

    const dumpPath = "/tmp/mcm.so";

    // Step 1: Dump the original MCM program
    logger.info(
      `Dumping MCM program ${CHAINLINK_MCM_PROGRAM_ID} to ${dumpPath}...`
    );
    await $`solana program dump ${CHAINLINK_MCM_PROGRAM_ID} ${dumpPath}`;

    if (!existsSync(dumpPath)) {
      throw new Error(`Failed to dump program to ${dumpPath}`);
    }

    logger.info("Program dumped successfully");

    // Step 2: Patch the program binary
    logger.info(
      `Patching program binary: replacing ${CHAINLINK_MCM_PROGRAM_ID} with ${newProgramId}...`
    );
    await patchProgramBinary(dumpPath, CHAINLINK_MCM_PROGRAM_ID, newProgramId);

    // Step 3: Deploy the patched program
    logger.info("Deploying patched MCM program...");
    await $`solana program deploy --url ${config.solana.cluster} --keypair ${await resolvePayerKeypairPath(args.payerKp)} --program-id ${args.programKp} ${dumpPath}`;

    logger.success("MCM program deployment completed!");
    logger.info(`Program ID: ${newProgramId}`);
    logger.info(
      `Explorer: https://explorer.solana.com/address/${newProgramId}?cluster=devnet`
    );
  } catch (error) {
    logger.error("MCM deployment failed:", error);
    throw error;
  }
}

async function resolvePayerKeypair(payerKpArg: PayerKpArg) {
  if (payerKpArg === "config") {
    logger.info("Using Solana CLI config for payer keypair");
    const homeDir = homedir();
    const configPath = join(homeDir, ".config/solana/id.json");
    return await getKeypairSignerFromPath(configPath);
  }

  logger.info(`Using custom payer keypair: ${payerKpArg}`);
  return await getKeypairSignerFromPath(payerKpArg);
}

async function resolvePayerKeypairPath(
  payerKpArg: PayerKpArg
): Promise<string> {
  if (payerKpArg === "config") {
    const homeDir = homedir();
    return join(homeDir, ".config/solana/id.json");
  }
  return payerKpArg;
}

async function patchProgramBinary(
  binaryPath: string,
  originalProgramId: string,
  newProgramId: string
): Promise<void> {
  try {
    // Read the binary file
    const binaryData = readFileSync(binaryPath);

    // Convert program IDs to bytes
    const base58Codec = getBase58Codec();
    const originalBytes = base58Codec.encode(originalProgramId);
    const newBytes = base58Codec.encode(newProgramId);

    if (originalBytes.length !== newBytes.length) {
      throw new Error("Program ID lengths must be equal for patching");
    }

    // Find and replace all occurrences
    let modified = false;
    const newBinaryData = Buffer.from(binaryData);

    for (let i = 0; i <= newBinaryData.length - originalBytes.length; i++) {
      let match = true;
      for (let j = 0; j < originalBytes.length; j++) {
        if (newBinaryData[i + j] !== originalBytes[j]) {
          match = false;
          break;
        }
      }

      if (match) {
        logger.info(`Found program ID reference at offset ${i}, replacing...`);
        for (let j = 0; j < newBytes.length; j++) {
          newBinaryData[i + j] = newBytes[j]!;
        }
        modified = true;
        i += originalBytes.length - 1; // Skip past this replacement
      }
    }

    if (!modified) {
      logger.warn(
        `Warning: No occurrences of ${originalProgramId} found in binary`
      );
    } else {
      logger.info("Program ID patching completed");
    }

    // Write the modified binary back
    writeFileSync(binaryPath, newBinaryData);
  } catch (error) {
    logger.error("Failed to patch program binary:", error);
    throw error;
  }
}
