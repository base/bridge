import { z } from "zod";
import {
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
} from "@base/bridge/bridge";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  getIdlConstant,
  relayMessageToBase,
  monitorMessageExecution,
  buildPayForRelayInstruction,
  outgoingMessagePubkey,
} from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS } from "@internal/constants";

export const argsSchema = z.object({
  deployEnv: z
    .enum(DEPLOY_ENVS, {
      message:
        "Deploy environment must be either 'testnet-alpha' or 'testnet-prod'",
    })
    .default("testnet-alpha"),
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

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

export async function handleBridgeCall(args: Args): Promise<void> {
  try {
    logger.info("--- Bridge call script ---");

    const config = CONFIGS[args.deployEnv];
    const rpcUrl = devnet(config.solana.rpcUrl);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    const targetAddress =
      args.to === "counter" ? config.base.counterContract : args.to;
    logger.info(`Target: ${targetAddress}`);
    const callData =
      args.data === "increment"
        ? "0xd09de08a"
        : args.data === "incrementPayable"
          ? "0x8cf81e0b"
          : args.data;
    logger.info(`Data: ${callData}`);

    const [bridgeAddress] = await getProgramDerivedAddress({
      programAddress: config.solana.bridgeProgram,
      seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
    });
    logger.info(`Bridge account: ${bridgeAddress}`);

    // Fetch bridge state
    const bridge = await fetchBridge(rpc, bridgeAddress);

    const { salt, pubkey: outgoingMessage } = await outgoingMessagePubkey(
      config.solana.bridgeProgram
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
        { programAddress: config.solana.bridgeProgram }
      ),
    ];

    if (args.payForRelay) {
      ixs.push(
        await buildPayForRelayInstruction(
          args.deployEnv,
          outgoingMessage,
          payer
        )
      );
    }

    logger.info("Sending transaction...");
    const signature = await buildAndSendTransaction(
      { type: "deploy-env", value: args.deployEnv },
      ixs,
      payer
    );
    logger.success("Bridge call completed!");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );

    if (args.payForRelay) {
      await monitorMessageExecution(args.deployEnv, outgoingMessage);
    } else {
      await relayMessageToBase(args.deployEnv, outgoingMessage);
    }
  } catch (error) {
    logger.error("Bridge call failed:", error);
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
