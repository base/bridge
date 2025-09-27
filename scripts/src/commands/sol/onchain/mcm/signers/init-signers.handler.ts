import { z } from "zod";
import { devnet, getProgramDerivedAddress } from "@solana/kit";
import { getInitSignersInstruction } from "@xenoliss/mcm-sol-client";
import { isHash, toBytes, type Hex } from "viem";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
} from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS } from "@internal/constants";
import {
  multisigConfigPda,
  CONFIG_SIGNERS_SEED,
  multisigConfigSignersPda,
} from "@internal/sol/mcm";

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
  multisigId: z
    .string()
    .refine((val) => isHash(val), {
      message: "Multisig ID must be a 32-byte hex string",
    })
    .transform((val) => val as Hex),
  totalSigners: z
    .string()
    .transform((val) => parseInt(val))
    .refine((val) => !isNaN(val) && val > 0 && val <= 180, {
      message: "Total signers must be between 1 and 180",
    }),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

export async function handleInitSigners(args: Args): Promise<void> {
  try {
    logger.info("--- MCM Init Signers script ---");

    const config = CONFIGS[args.deployEnv];
    const rpcUrl = devnet(`https://${config.solana.rpcUrl}`);
    logger.info(`RPC URL: ${rpcUrl}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    logger.info(`Multisig ID: "${args.multisigId}"`);
    logger.info(`Total signers: ${args.totalSigners}`);

    const [multisigConfig] = await multisigConfigPda(
      args.deployEnv,
      args.multisigId
    );
    const [configSigners] = await multisigConfigSignersPda(
      args.deployEnv,
      args.multisigId
    );

    logger.info(`Multisig Config PDA: ${multisigConfig}`);
    logger.info(`Config Signers PDA: ${configSigners}`);

    const initSignersIx = getInitSignersInstruction(
      {
        // Accounts
        multisigConfig,
        configSigners,
        authority: payer,

        // Arguments
        multisigId: toBytes(args.multisigId),
        totalSigners: args.totalSigners,
      },
      { programAddress: config.solana.mcmProgram }
    );

    logger.info("Sending init signers transaction...");
    const signature = await buildAndSendTransaction(
      args.deployEnv,
      [initSignersIx],
      payer
    );

    logger.success("MCM signers storage initialized successfully!");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );
    logger.info(`Config Signers: ${configSigners}`);
  } catch (error) {
    logger.error("MCM init signers failed:", error);
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
