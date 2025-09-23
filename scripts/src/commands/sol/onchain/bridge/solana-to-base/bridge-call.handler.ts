import { z } from "zod";
import {
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
  createSolanaRpc,
  devnet,
  type Instruction,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { toBytes } from "viem";

import {
  CallType,
  fetchBridge,
  getBridgeCallInstruction,
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
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
  to: z.union([
    z.literal("counter"),
    z.string().startsWith("0x", "Address must start with 0x").brand<"to">(),
  ]),
  value: z
    .string()
    .transform((val) => parseFloat(val))
    .refine((val) => !isNaN(val) && val >= 0, {
      message: "Value must be a non-negative number",
    })
    .default(0),
  data: z
    .union([
      z.literal("increment"),
      z.literal("incrementPayable"),
      z.string().startsWith("0x", "Data must start with 0x").brand<"data">(),
    ])
    .default("increment"),
  payForRelay: z.boolean().default(true),
});

type BridgeCallArgs = z.infer<typeof argsSchema>;
type PayerKp = z.infer<typeof argsSchema.shape.payerKp>;

export async function handleBridgeCall(args: BridgeCallArgs): Promise<void> {
  try {
    logger.info("--- Bridge call script ---");

    // Get config for cluster and release
    const config = CONSTANTS[args.cluster][args.release];

    const rpcUrl = devnet(`https://${config.rpcUrl}`);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    // Resolve payer keypair
    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    // Resolve target contract address and call data
    const targetAddress = args.to === "counter" ? config.counter : args.to;
    logger.info(`Target: ${targetAddress}`);
    const callData =
      args.data === "increment"
        ? "0xd09de08a"
        : args.data === "incrementPayable"
          ? "0x8cf81e0b"
          : args.data;
    logger.info(`Data: ${callData}`);

    // Derive bridge account address
    const [bridgeAddress] = await getProgramDerivedAddress({
      programAddress: config.solanaBridge,
      seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
    });
    logger.info(`Bridge account: ${bridgeAddress}`);

    // Fetch bridge state
    const bridge = await fetchBridge(rpc, bridgeAddress);

    // Generate outgoing message keypair
    const { salt, pubkey: outgoingMessage } = await outgoingMessagePubkey(
      config.solanaBridge
    );

    logger.info(`Outgoing message: ${outgoingMessage}`);

    // Build bridge call instruction
    const ixs: Instruction[] = [
      getBridgeCallInstruction(
        {
          // Accounts
          payer,
          from: payer,
          gasFeeReceiver: bridge.data.gasConfig.gasFeeReceiver,
          bridge: bridgeAddress,
          outgoingMessage,
          systemProgram: SYSTEM_PROGRAM_ADDRESS,

          // Arguments
          outgoingMessageSalt: salt,
          call: {
            ty: CallType.Call,
            to: toBytes(targetAddress),
            value: BigInt(Math.floor(args.value * 1e18)), // Convert ETH to wei
            data: Buffer.from(callData.slice(2), "hex"), // Remove 0x prefix
          },
        },
        { programAddress: config.solanaBridge }
      ),
    ];

    // Send transaction
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
    logger.success("Bridge call completed!");
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
    logger.error("Bridge call failed:", error);
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
