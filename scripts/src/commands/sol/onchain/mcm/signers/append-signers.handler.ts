import { z } from "zod";
import { devnet } from "@solana/kit";
import { getAppendSignersInstruction } from "@xenoliss/mcm-sol-client";
import { isAddress, isHash, type Hex, toBytes } from "viem";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
} from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS } from "@internal/constants";
import { multisigConfigPda, multisigConfigSignersPda } from "@internal/sol/mcm";

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
  signers: z
    .string()
    .min(1, "Signers cannot be empty")
    .refine((val) => val.split(",").every((s) => isAddress(s.trim())), {
      message:
        "Signers must be a comma-separated list of valid Ethereum addresses",
    })
    .transform((val) => {
      return val.split(",").map((s) => s.trim() as Hex);
    }),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

export async function handleAppendSigners(args: Args): Promise<void> {
  try {
    logger.info("--- MCM Append Signers script ---");

    const config = CONFIGS[args.deployEnv];
    const rpcUrl = devnet(`https://${config.solana.rpcUrl}`);
    logger.info(`RPC URL: ${rpcUrl}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    logger.info(`Multisig ID: "${args.multisigId}"`);
    logger.info(`Adding ${args.signers.length} signers`);

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

    const appendSignersIx = getAppendSignersInstruction(
      {
        // Accounts
        multisigConfig,
        configSigners,
        authority: payer,

        // Arguments
        multisigId: toBytes(args.multisigId),
        signersBatch: args.signers.map((s) => toBytes(s)),
      },
      { programAddress: config.solana.mcmProgram }
    );

    logger.info("Sending append signers transaction...");
    const signature = await buildAndSendTransaction(
      args.deployEnv,
      [appendSignersIx],
      payer
    );

    logger.success("MCM signers appended successfully!");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );
  } catch (error) {
    logger.error("MCM append signers failed:", error);
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
