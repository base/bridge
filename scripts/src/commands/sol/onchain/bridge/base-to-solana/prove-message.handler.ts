import { z } from "zod";
import {
  Endian,
  getProgramDerivedAddress,
  getU64Encoder,
  createSolanaRpc,
  devnet,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import {
  createPublicClient,
  http,
  toBytes,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";
import { decodeEventLog } from "viem/utils";

import {
  fetchBridge,
  getProveMessageInstruction,
} from "../../../../../../../clients/ts/src/bridge";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  getIdlConstant,
} from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS } from "@internal/constants";
import { BRIDGE_ABI } from "@internal/base/abi";

export const argsSchema = z.object({
  deployEnv: z
    .enum(DEPLOY_ENVS, {
      message:
        "Deploy environment must be either 'development-alpha' or 'development-prod'",
    })
    .default("development-alpha"),
  transactionHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, {
      message:
        "Invalid transaction hash format (must be 0x followed by 64 hex characters)",
    })
    .brand<"transactionHash">(),
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

export async function handleProveMessage(args: Args) {
  try {
    logger.info("--- Prove message script ---");

    const config = CONFIGS[args.deployEnv];
    const rpcUrl = devnet(`https://${config.solana.rpcUrl}`);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    const [bridgeAddress] = await getProgramDerivedAddress({
      programAddress: config.solana.bridgeProgram,
      seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
    });
    logger.info(`Bridge: ${bridgeAddress}`);

    const bridge = await fetchBridge(rpc, bridgeAddress);
    const baseBlockNumber = bridge.data.baseBlockNumber;
    logger.info(`Base Block Number: ${baseBlockNumber}`);

    const [outputRootAddress] = await getProgramDerivedAddress({
      programAddress: config.solana.bridgeProgram,
      seeds: [
        Buffer.from(getIdlConstant("OUTPUT_ROOT_SEED")),
        getU64Encoder({ endian: Endian.Little }).encode(baseBlockNumber),
      ],
    });
    logger.info(`Output Root: ${outputRootAddress}`);

    const { event, rawProof } = await generateProof(
      args.transactionHash as Hash,
      baseBlockNumber,
      config.base.bridgeContract
    );

    const [messageAddress] = await getProgramDerivedAddress({
      programAddress: config.solana.bridgeProgram,
      seeds: [
        Buffer.from(getIdlConstant("INCOMING_MESSAGE_SEED")),
        toBytes(event.messageHash),
      ],
    });
    logger.info(`Message: ${messageAddress}`);
    logger.info(`Nonce: ${event.message.nonce}`);
    logger.info(`Sender: ${event.message.sender}`);
    logger.info(`Message Hash: ${event.messageHash}`);

    // Build prove message instruction
    logger.info("Building instruction...");
    const ix = getProveMessageInstruction(
      {
        // Accounts
        payer,
        outputRoot: outputRootAddress,
        message: messageAddress,
        bridge: bridgeAddress,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,

        // Arguments
        nonce: event.message.nonce,
        sender: toBytes(event.message.sender),
        data: toBytes(event.message.data),
        proof: rawProof.map((e: string) => toBytes(e)),
        messageHash: toBytes(event.messageHash),
      },
      { programAddress: config.solana.bridgeProgram }
    );

    logger.info("Sending transaction...");
    const signature = await buildAndSendTransaction(
      args.deployEnv,
      [ix],
      payer
    );
    logger.success("Message proof completed");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );

    // Return message hash for potential relay
    return event.messageHash;
  } catch (error) {
    logger.error("Failed to prove message:", error);
    throw error;
  }
}

async function generateProof(
  transactionHash: Hash,
  bridgeBaseBlockNumber: bigint,
  baseBridgeAddress: Address
) {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const txReceipt = await publicClient.getTransactionReceipt({
    hash: transactionHash,
  });

  // Extract and decode MessageRegistered events
  const messageRegisteredEvents = txReceipt.logs
    .map((log) => {
      if (bridgeBaseBlockNumber < log.blockNumber) {
        throw new Error(
          `Transaction not finalized yet: ${bridgeBaseBlockNumber} < ${log.blockNumber}`
        );
      }

      try {
        const decodedLog = decodeEventLog({
          abi: BRIDGE_ABI,
          data: log.data,
          topics: log.topics,
        });

        return decodedLog.eventName === "MessageRegistered"
          ? {
              messageHash: decodedLog.args.messageHash,
              mmrRoot: decodedLog.args.mmrRoot,
              message: decodedLog.args.message,
            }
          : null;
      } catch (error) {
        return null;
      }
    })
    .filter((event) => event !== null);

  logger.info(
    `Found ${messageRegisteredEvents.length} MessageRegistered event(s)`
  );

  if (messageRegisteredEvents.length !== 1) {
    throw new Error("Unexpected number of MessageRegistered events detected");
  }

  const event = messageRegisteredEvents[0]!;

  logger.info("Message Details:");
  logger.info(`  Hash: ${event.messageHash}`);
  logger.info(`  MMR Root: ${event.mmrRoot}`);
  logger.info(`  Nonce: ${event.message.nonce}`);
  logger.info(`  Sender: ${event.message.sender}`);
  logger.info(`  Data: ${event.message.data}`);

  const rawProof = await publicClient.readContract({
    address: baseBridgeAddress,
    abi: BRIDGE_ABI,
    functionName: "generateProof",
    args: [event.message.nonce],
    blockNumber: bridgeBaseBlockNumber,
  });

  logger.info(`Proof generated at block ${bridgeBaseBlockNumber}`);
  logger.info(`  Leaf index: ${event.message.nonce}`);

  return {
    event,
    rawProof,
  };
}

async function resolvePayerKeypair(payerKpArg: PayerKpArg) {
  if (payerKpArg === "config") {
    logger.info("Using Solana CLI config for payer keypair");
    return await getSolanaCliConfigKeypairSigner();
  }

  logger.info(`Using custom payer keypair: ${payerKpArg}`);
  return await getKeypairSignerFromPath(payerKpArg);
}
