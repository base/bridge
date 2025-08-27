import { z } from "zod";
import {
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
  devnet,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { toBytes } from "viem";

import { getInitializeInstruction } from "../../../../../../clients/ts/src";

import { logger } from "../../../../internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  getIdlConstant,
  CONSTANTS,
} from "../../../../internal/sol";

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
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
});

type InitializeArgs = z.infer<typeof argsSchema>;
type PayerKp = z.infer<typeof argsSchema.shape.payerKp>;

export async function handleInitialize(args: InitializeArgs): Promise<void> {
  try {
    logger.info("--- Initialize bridge script ---");

    // Get config for cluster and release
    const config = CONSTANTS[args.cluster][args.release];

    const rpcUrl = devnet(`https://${config.rpcUrl}`);
    logger.info(`RPC URL: ${rpcUrl}`);

    // Resolve payer keypair
    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    // Derive bridge account address
    const [bridgeAccountAddress] = await getProgramDerivedAddress({
      programAddress: config.solanaBridge,
      seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
    });
    logger.info(`Bridge account address: ${bridgeAccountAddress}`);

    // Generate guardian keypair
    const guardian = await createSignerFromKeyPair(await generateKeyPair());
    logger.info(`Guardian: ${guardian.address}`);

    // Build initialize instruction
    const ix = getInitializeInstruction(
      {
        payer: payer,
        bridge: bridgeAccountAddress,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
        guardian,
        eip1559Config: {
          target: 5_000_000,
          denominator: 2,
          windowDurationSeconds: 1,
          minimumBaseFee: 1,
        },
        gasConfig: {
          gasPerCall: 50_000,
          gasCostScaler: 1_000_000,
          gasCostScalerDp: 1_000_000,
          gasFeeReceiver: payer.address,
        },
        protocolConfig: {
          blockIntervalRequirement: 300,
        },
        bufferConfig: {
          maxCallBufferSize: 8 * 1024,
        },
        baseOracleConfig: {
          threshold: 2,
          signerCount: 2,
          signers: [
            toBytes(config.solanaEvmLocalKey),
            toBytes(config.solanaEvmKeychainKey),
            ...Array(14).fill(0),
          ],
        },
        partnerOracleConfig: {
          requiredThreshold: 0,
        },
      },
      { programAddress: config.solanaBridge }
    );

    // Send transaction
    logger.info("Sending transaction...");
    const signature = await buildAndSendTransaction(rpcUrl, [ix], payer);
    logger.success("Bridge initialization completed!");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );
  } catch (error) {
    logger.error("Bridge initialization failed:", error);
    throw error;
  }
}

async function resolvePayerKeypair(payerKp: PayerKp) {
  if (payerKp === "config") {
    logger.info("Using Solana CLI config for payer keypair");
    return await getSolanaCliConfigKeypairSigner();
  }

  logger.info(`Using custom payer keypair: ${payerKp}`);
  return await getKeypairSignerFromPath(payerKp);
}
