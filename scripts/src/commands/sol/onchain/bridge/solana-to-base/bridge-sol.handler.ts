import { z } from "zod";
import {
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
  devnet,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { toBytes } from "viem";

import { getBridgeSolInstruction } from "../../../../../../../clients/ts/src";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  getIdlConstant,
  CONSTANTS,
  relayMessageToBase,
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
  to: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, {
      message: "Invalid Base/Ethereum address format",
    })
    .brand<"baseAddress">(),
  amount: z
    .string()
    .transform((val) => parseFloat(val))
    .refine((val) => !isNaN(val) && val > 0, {
      message: "Amount must be a positive number",
    }),
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
});

type BridgeSolArgs = z.infer<typeof argsSchema>;
type PayerKp = BridgeSolArgs["payerKp"];

export async function handleBridgeSol(args: BridgeSolArgs): Promise<void> {
  try {
    logger.info("--- Bridge SOL script ---");

    const config = CONSTANTS[args.cluster][args.release];
    const rpcUrl = devnet(`https://${config.rpcUrl}`);
    logger.info(`RPC URL: ${rpcUrl}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    const [bridgeAccountAddress] = await getProgramDerivedAddress({
      programAddress: config.solanaBridge,
      seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
    });
    logger.info(`Bridge account: ${bridgeAccountAddress}`);

    const remoteToken = toBytes(config.wSol);
    const [solVaultAddress] = await getProgramDerivedAddress({
      programAddress: config.solanaBridge,
      seeds: [
        Buffer.from(getIdlConstant("SOL_VAULT_SEED")),
        Buffer.from(remoteToken),
      ],
    });
    logger.info(`Sol Vault: ${solVaultAddress}`);

    // Calculate scaled amount (amount * 10^decimals)
    const scaledAmount = BigInt(Math.floor(args.amount * Math.pow(10, 9)));
    logger.info(`Amount: ${args.amount}`);
    logger.info(`Scaled amount: ${scaledAmount}`);

    const outgoingMessageKeypair = await generateKeyPair();
    const outgoingMessageKeypairSigner = await createSignerFromKeyPair(
      outgoingMessageKeypair
    );
    logger.info(`Outgoing message: ${outgoingMessageKeypairSigner.address}`);

    const ix = getBridgeSolInstruction(
      {
        payer,
        from: payer,
        gasFeeReceiver: payer.address,
        solVault: solVaultAddress,
        bridge: bridgeAccountAddress,
        outgoingMessage: outgoingMessageKeypairSigner,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
        to: toBytes(args.to),
        remoteToken,
        amount: BigInt(args.amount * 1e9),
        call: null,
      },
      { programAddress: config.solanaBridge }
    );

    logger.info("Sending transaction...");
    const signature = await buildAndSendTransaction(rpcUrl, [ix], payer);
    logger.success("Bridge SOL operation completed!");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );

    // Relay message to Base
    await relayMessageToBase(
      args.cluster,
      args.release,
      outgoingMessageKeypairSigner.address
    );
  } catch (error) {
    logger.error("Bridge SOL operation failed:", error);
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
