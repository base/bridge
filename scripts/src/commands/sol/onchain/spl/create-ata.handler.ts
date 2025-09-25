import { z } from "zod";
import { address, createSolanaRpc, devnet } from "@solana/kit";
import {
  fetchMaybeToken,
  getCreateAssociatedTokenIdempotentInstruction,
  findAssociatedTokenPda,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchMaybeMint,
} from "@solana-program/token";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
} from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS } from "@internal/constants";

export const argsSchema = z.object({
  deployEnv: z
    .enum(DEPLOY_ENVS, {
      message:
        "Deploy environment must be either 'development-alpha' or 'development-prod'",
    })
    .default("development-alpha"),
  mint: z.string().nonempty("Mint address cannot be empty"),
  owner: z
    .union([z.literal("payer"), z.string().brand<"owner">()])
    .default("payer"),
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = z.infer<typeof argsSchema.shape.payerKp>;

export async function handleCreateAta(args: Args): Promise<void> {
  try {
    logger.info("--- Create ATA script ---");

    const config = CONFIGS[args.deployEnv];

    const rpcUrl = devnet(`https://${config.solana.rpcUrl}`);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    // Resolve payer keypair
    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    // Resolve mint address
    const mintAddress = address(args.mint);
    logger.info(`Mint: ${mintAddress}`);
    const maybeMint = await fetchMaybeMint(rpc, mintAddress);
    if (!maybeMint.exists) {
      throw new Error("Mint not found");
    }

    // Resolve owner address
    const ownerAddress =
      args.owner === "payer" ? payer.address : address(args.owner);
    logger.info(`Owner: ${ownerAddress}`);

    const [ata] = await findAssociatedTokenPda(
      {
        owner: ownerAddress,
        tokenProgram: maybeMint.programAddress,
        mint: mintAddress,
      },
      {
        programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
      }
    );
    const maybeAta = await fetchMaybeToken(rpc, ata);
    if (maybeAta.exists) {
      logger.info(`ATA already exists: ${maybeAta.address}`);
      logger.success("ATA already exists!");
      return;
    }

    logger.info(`ATA to create: ${maybeAta.address}`);

    // Create ATA instruction
    const instruction = getCreateAssociatedTokenIdempotentInstruction({
      payer,
      ata: maybeAta.address,
      mint: mintAddress,
      owner: ownerAddress,
      tokenProgram: maybeMint.programAddress,
    });

    // Send transaction
    logger.info("Sending transaction...");
    const signature = await buildAndSendTransaction(
      args.deployEnv,
      [instruction],
      payer
    );

    logger.success("ATA created!");
    logger.info(`ATA address: ${maybeAta.address}`);
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );
  } catch (error) {
    logger.error("Failed to create ATA:", error);
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
