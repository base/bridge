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
  CONSTANTS,
} from "@internal/sol";

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
  mint: z.string().nonempty("Mint address cannot be empty"),
  owner: z
    .union([z.literal("payer"), z.string().brand<"owner">()])
    .default("payer"),
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
});

type CreateAtaArgs = z.infer<typeof argsSchema>;
type PayerKp = z.infer<typeof argsSchema.shape.payerKp>;

export async function handleCreateAta(args: CreateAtaArgs): Promise<void> {
  try {
    logger.info("--- Create ATA script ---");

    const config = CONSTANTS[args.cluster][args.release];

    const rpcUrl = devnet(`https://${config.rpcUrl}`);
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
      rpcUrl,
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

async function resolvePayerKeypair(payerKp: PayerKp) {
  if (payerKp === "config") {
    logger.info("Using Solana CLI config for payer keypair");
    return await getSolanaCliConfigKeypairSigner();
  }

  logger.info(`Using custom payer keypair: ${payerKp}`);
  return await getKeypairSignerFromPath(payerKp);
}
