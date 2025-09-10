import { z } from "zod";
import { address, devnet, createSolanaRpc, type Account } from "@solana/kit";
import {
  getMintToInstruction,
  fetchMaybeMint,
  type Mint,
  findAssociatedTokenPda,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchMaybeToken,
} from "@solana-program/token";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  type Rpc,
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
  to: z
    .union([z.literal("config"), z.string().brand<"to">()])
    .default("config"),
  amount: z
    .string()
    .transform((val) => parseFloat(val))
    .refine((val) => !isNaN(val) && val > 0, {
      message: "Amount must be a positive number",
    })
    .default(100),
  mintAuthorityKp: z
    .union([z.literal("config"), z.string().brand<"mintAuthorityKp">()])
    .default("config"),
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
});

type MintArgs = z.infer<typeof argsSchema>;
type To = z.infer<typeof argsSchema.shape.to>;
type PayerKp = z.infer<typeof argsSchema.shape.payerKp>;
type MintAuthorityKp = z.infer<typeof argsSchema.shape.mintAuthorityKp>;

export async function handleMint(args: MintArgs): Promise<void> {
  try {
    logger.info("--- Mint script ---");

    const config = CONSTANTS[args.cluster][args.release];

    const rpcUrl = devnet(`https://${config.rpcUrl}`);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    // Resolve mint address
    const mintAddress = address(args.mint);
    logger.info(`Mint: ${mintAddress}`);

    const maybeMint = await fetchMaybeMint(rpc, mintAddress);
    if (!maybeMint.exists) {
      throw new Error("Mint not found");
    }
    const mint = maybeMint.data;

    // Resolve recipient address
    const recipientAddress = await resolveRecipient(args.to, rpc, maybeMint);
    logger.info(`Recipient: ${recipientAddress}`);

    // Calculate scaled amount (amount * 10^decimals)
    const scaledAmount = BigInt(
      Math.floor(args.amount * Math.pow(10, mint.decimals))
    );
    logger.info(`Amount: ${args.amount}`);
    logger.info(`Decimals: ${mint.decimals}`);
    logger.info(`Scaled amount: ${scaledAmount}`);

    // Resolve mint authority keypair
    const mintAuthority = await resolveMintAuthorityKeypair(
      args.mintAuthorityKp
    );
    logger.info(`Mint authority: ${mintAuthority.address}`);

    // Resolve payer keypair
    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    const mintToInstruction = getMintToInstruction({
      mint: mintAddress,
      token: recipientAddress,
      mintAuthority: mintAuthority,
      amount: scaledAmount,
    });

    // Send transaction
    logger.info("Sending mint transaction...");
    const signature = await buildAndSendTransaction(
      rpcUrl,
      [mintToInstruction],
      payer
    );

    logger.success(`Tokens minted successfully! Transaction: ${signature}`);
  } catch (error) {
    logger.error("Failed to mint tokens:", error);
    throw error;
  }
}

async function resolveRecipient(to: To, rpc: Rpc, mint: Account<Mint>) {
  if (to !== "config") {
    return address(to);
  }

  const configSigner = await getSolanaCliConfigKeypairSigner();

  const [ata] = await findAssociatedTokenPda(
    {
      owner: configSigner.address,
      tokenProgram: mint.programAddress,
      mint: mint.address,
    },
    {
      programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    }
  );

  const maybeAta = await fetchMaybeToken(rpc, ata);
  if (!maybeAta.exists) {
    throw new Error("ATA does not exist");
  }

  return maybeAta.address;
}

async function resolveMintAuthorityKeypair(mintAuthorityKp: MintAuthorityKp) {
  if (mintAuthorityKp === "config") {
    logger.info("Using Solana CLI config for mint authority keypair");
    return await getSolanaCliConfigKeypairSigner();
  }

  logger.info(`Using custom mint authority keypair: ${mintAuthorityKp}`);
  return await getKeypairSignerFromPath(mintAuthorityKp);
}

async function resolvePayerKeypair(payerKp: PayerKp) {
  if (payerKp === "config") {
    logger.info("Using Solana CLI config for payer keypair");
    return await getSolanaCliConfigKeypairSigner();
  }

  logger.info(`Using custom payer keypair: ${payerKp}`);
  return await getKeypairSignerFromPath(payerKp);
}
