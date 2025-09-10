import { z } from "zod";
import {
  createSignerFromKeyPair,
  generateKeyPair,
  address,
  createSolanaRpc,
  devnet,
} from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  getMintSize,
  getInitializeMint2Instruction,
  TOKEN_PROGRAM_ADDRESS,
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
  decimals: z
    .string()
    .transform((val) => parseInt(val))
    .refine((val) => !isNaN(val) && val >= 0, {
      message: "Decimals must be a positive number",
    })
    .default(9),
  mintAuthority: z
    .union([z.literal("payer"), z.string().brand<"mintAuthority">()])
    .default("payer"),
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
});

type CreateMintArgs = z.infer<typeof argsSchema>;
type PayerKp = z.infer<typeof argsSchema.shape.payerKp>;

export async function handleCreateMint(args: CreateMintArgs): Promise<void> {
  try {
    logger.info("--- Create Mint script --- ");

    const config = CONSTANTS[args.cluster][args.release];

    const rpcUrl = devnet(`https://${config.rpcUrl}`);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    // Resolve payer keypair
    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    // Generate new mint keypair
    const mintKeypair = await generateKeyPair();
    const mint = await createSignerFromKeyPair(mintKeypair);
    logger.info(`Mint: ${mint.address}`);

    // Resolve mint authority address
    const mintAuthorityAddress =
      args.mintAuthority === "payer"
        ? payer.address
        : address(args.mintAuthority);
    logger.info(`Mint authority: ${mintAuthorityAddress}`);
    logger.info(`Decimals: ${args.decimals}`);

    // Get rent exemption amount
    const space = getMintSize();
    const lamports = await rpc
      .getMinimumBalanceForRentExemption(BigInt(space))
      .send();

    // Create instructions
    const instructions = [
      getCreateAccountInstruction({
        payer: payer,
        newAccount: mint,
        lamports,
        space,
        programAddress: TOKEN_PROGRAM_ADDRESS,
      }),
      getInitializeMint2Instruction({
        mint: mint.address,
        decimals: args.decimals,
        mintAuthority: mintAuthorityAddress,
      }),
    ];

    // Send transaction
    logger.info("Sending transaction...");
    const signature = await buildAndSendTransaction(
      rpcUrl,
      instructions,
      payer
    );

    logger.success("SPL token mint created");
    logger.info(`Mint address: ${mint.address}`);
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );
  } catch (error) {
    logger.error("Failed to create mint:", error);
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
