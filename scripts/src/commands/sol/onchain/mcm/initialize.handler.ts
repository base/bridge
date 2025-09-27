import { z } from "zod";
import { devnet } from "@solana/kit";
import { isHash, toBytes, type Hex } from "viem";
import { getInitializeInstruction } from "@xenoliss/mcm-sol-client";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
} from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS } from "@internal/constants";
import {
  multisigConfigPda,
  rootMetadataPda,
  expiringRootAndOpCountPda,
} from "@internal/sol/mcm";
import { programDataPda } from "@internal/sol/loader-v3";

// Schema validation
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
  chainId: z
    .string()
    .transform((val) => parseInt(val))
    .refine((val) => !isNaN(val) && val > 0, {
      message: "Chain ID must be a positive integer",
    }),
  multisigId: z
    .string()
    .refine((val) => isHash(val), {
      message: "Multisig ID must be a 32-byte hex string",
    })
    .transform((val) => val as Hex),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

// Main handler
export async function handleInitialize(args: Args): Promise<void> {
  try {
    logger.info("--- MCM Initialize script ---");

    // Configuration
    const config = CONFIGS[args.deployEnv];
    const rpcUrl = devnet(`https://${config.solana.rpcUrl}`);
    logger.info(`RPC URL: ${rpcUrl}`);

    // Resolve keypairs
    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    logger.info(`Chain ID: ${args.chainId}`);
    logger.info(`Multisig ID: "${args.multisigId}" (padded to 32 bytes)`);

    // Derive PDAs
    const [multisigConfig] = await multisigConfigPda(
      args.deployEnv,
      args.multisigId
    );
    const [rootMetadata] = await rootMetadataPda(
      args.deployEnv,
      args.multisigId
    );
    const [expiringRootAndOpCount] = await expiringRootAndOpCountPda(
      args.deployEnv,
      args.multisigId
    );
    const [programData] = await programDataPda(config.solana.mcmProgram);

    logger.info(`Multisig Config PDA: ${multisigConfig}`);
    logger.info(`Root Metadata PDA: ${rootMetadata}`);
    logger.info(`Expiring Root PDA: ${expiringRootAndOpCount}`);
    logger.info(`Program Data PDA: ${programData}`);

    // Create initialize instruction
    const initializeIx = getInitializeInstruction(
      {
        // Accounts
        multisigConfig,
        authority: payer,
        program: config.solana.mcmProgram,
        programData,
        rootMetadata,
        expiringRootAndOpCount,

        // Arguments
        chainId: args.chainId,
        multisigId: toBytes(args.multisigId),
      },
      { programAddress: config.solana.mcmProgram }
    );

    // Send transaction
    logger.info("Sending initialize transaction...");
    const signature = await buildAndSendTransaction(
      args.deployEnv,
      [initializeIx],
      payer
    );

    logger.success("MCM multisig initialized successfully!");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );
    logger.info(`Multisig Config: ${multisigConfig}`);
    logger.info(`Owner: ${payer.address}`);
  } catch (error) {
    logger.error("MCM initialization failed:", error);
    throw error;
  }
}

async function resolvePayerKeypair(payerKpArg: PayerKpArg) {
  if (payerKpArg === "config") {
    logger.info("Using Solana CLI config for payer keypair");
    return await getSolanaCliConfigKeypairSigner();
  }

  logger.info(`Using custom payer keypair: ${payerKpArg}`);
  return await getKeypairSignerFromPath(payerKpArg);
}
