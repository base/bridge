import { z } from "zod";
import {
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
  devnet,
  type Instruction,
  createSolanaRpc,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { toBytes } from "viem";

import {
  fetchBridge,
  getBridgeSolInstruction,
} from "../../../../../../../clients/ts/src/bridge";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  getIdlConstant,
  CONSTANTS,
  relayMessageToBase,
  monitorMessageExecution,
} from "@internal/sol";
import { buildPayForRelayInstruction } from "@internal/sol/base-relayer";
import { outgoingMessagePubkey } from "@internal/sol/bridge";

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
  payForRelay: z.boolean().default(true),
});

type BridgeSolArgs = z.infer<typeof argsSchema>;
type PayerKp = BridgeSolArgs["payerKp"];

export async function handleBridgeSol(args: BridgeSolArgs): Promise<void> {
  try {
    logger.info("--- Bridge SOL script ---");

    const config = CONSTANTS[args.cluster][args.release];
    const rpcUrl = devnet(`https://${config.rpcUrl}`);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    const [bridgeAccountAddress] = await getProgramDerivedAddress({
      programAddress: config.solanaBridge,
      seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
    });
    logger.info(`Bridge account: ${bridgeAccountAddress}`);

    const bridge = await fetchBridge(rpc, bridgeAccountAddress);

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

    const { salt, pubkey: outgoingMessage } = await outgoingMessagePubkey(
      config.solanaBridge
    );
    logger.info(`Outgoing message: ${outgoingMessage}`);

    const ixs: Instruction[] = [
      getBridgeSolInstruction(
        {
          // Accounts
          payer,
          from: payer,
          gasFeeReceiver: bridge.data.gasConfig.gasFeeReceiver,
          solVault: solVaultAddress,
          bridge: bridgeAccountAddress,
          outgoingMessage,
          systemProgram: SYSTEM_PROGRAM_ADDRESS,

          // Arguments
          outgoingMessageSalt: salt,
          to: toBytes(args.to),
          remoteToken,
          amount: scaledAmount,
          call: null,
        },
        { programAddress: config.solanaBridge }
      ),
    ];

    if (args.payForRelay) {
      ixs.push(
        await buildPayForRelayInstruction(
          args.cluster,
          args.release,
          outgoingMessage,
          payer
        )
      );
    }

    logger.info("Sending transaction...");
    const signature = await buildAndSendTransaction(rpcUrl, ixs, payer);
    logger.success("Bridge SOL operation completed!");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );

    if (args.payForRelay) {
      await monitorMessageExecution(
        args.cluster,
        args.release,
        outgoingMessage
      );
    } else {
      await relayMessageToBase(args.cluster, args.release, outgoingMessage);
    }
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
