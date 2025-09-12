import { Endian, getProgramDerivedAddress, getU64Encoder } from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { createPublicClient, http, toBytes, type Hash } from "viem";
import { baseSepolia } from "viem/chains";
import { decodeEventLog } from "viem/utils";

import {
  fetchBridge,
  getProveMessageInstruction,
} from "../../../clients/ts/generated/bridge";
import { CONSTANTS } from "../../constants";
import { getTarget } from "../../utils/argv";
import { getIdlConstant } from "../../utils/idl-constants";
import {
  buildAndSendTransaction,
  getPayer,
  getRpc,
} from "../utils/transaction";
import { BRIDGE_ABI } from "../../abi/bridge.abi";
import { relayMessage } from "./relay-message";

const TRANSACTION_HASH =
  "0x08b0ba2e26d3e566e7811bf47ea94dc227da2dd9e8a3fe7679ed601e9ff3d412";

async function generateProof(
  transactionHash: Hash,
  bridgeBaseBlockNumber: bigint,
  baseBridgeAddress: string
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
          `Transaction not finaized yet: ${bridgeBaseBlockNumber} < ${log.blockNumber}`
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

  console.log(
    `Found ${messageRegisteredEvents.length} MessageRegistered event(s)`
  );

  if (messageRegisteredEvents.length !== 1) {
    throw new Error("Unexpected number of MessageRegistered events detected");
  }

  const event = messageRegisteredEvents[0]!;

  console.log("📋 Message Details:");
  console.log(`  Hash: ${event.messageHash}`);
  console.log(`  MMR Root: ${event.mmrRoot}`);
  console.log(`  Nonce: ${event.message.nonce}`);
  console.log(`  Sender: ${event.message.sender}`);
  console.log(`  Data: ${event.message.data}`);

  const rawProof = await publicClient.readContract({
    address: baseBridgeAddress as `0x${string}`,
    abi: BRIDGE_ABI,
    functionName: "generateProof",
    args: [event.message.nonce],
    blockNumber: bridgeBaseBlockNumber,
  });

  console.log(`📊 Proof generated at block ${bridgeBaseBlockNumber}`);
  console.log(`  Leaf index: ${event.message.nonce}`);

  return {
    event,
    rawProof,
  };
}

async function main() {
  const target = getTarget();
  const constants = CONSTANTS[target];
  const payer = await getPayer();
  const rpc = getRpc(target);

  console.log("=".repeat(40));
  console.log(`Target: ${target}`);
  console.log(`RPC URL: ${constants.rpcUrl}`);
  console.log(`Bridge: ${constants.solanaBridge}`);
  console.log(`Payer: ${payer.address}`);
  console.log("=".repeat(40));
  console.log("");

  const [bridgeAddress] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
  });

  const bridge = await fetchBridge(rpc, bridgeAddress);
  const baseBlockNumber = bridge.data.baseBlockNumber;
  console.log(`🔗 Base Block Number: ${baseBlockNumber}`);

  const [outputRootAddress] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [
      Buffer.from(getIdlConstant("OUTPUT_ROOT_SEED")),
      getU64Encoder({ endian: Endian.Little }).encode(baseBlockNumber),
    ],
  });

  const { event, rawProof } = await generateProof(
    TRANSACTION_HASH,
    baseBlockNumber,
    constants.baseBridge
  );

  const [messageAddress] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [
      Buffer.from(getIdlConstant("INCOMING_MESSAGE_SEED")),
      toBytes(event.messageHash),
    ],
  });

  console.log(`🔗 Bridge: ${bridgeAddress}`);
  console.log(`📦 Base Block Number: ${baseBlockNumber}`);
  console.log(`🔗 Output Root: ${outputRootAddress}`);
  console.log(`🔗 Message: ${messageAddress}`);
  console.log(`🔗 Nonce: ${event.message.nonce}`);
  console.log(`🔗 Sender: ${event.message.sender}`);
  console.log(`🔗 Message Hash: ${event.messageHash}`);

  console.log("🛠️  Building instruction...");
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
      proof: rawProof.map((e) => toBytes(e)),
      messageHash: toBytes(event.messageHash),
    },
    { programAddress: constants.solanaBridge }
  );

  console.log("🚀 Sending transaction...");
  await buildAndSendTransaction(target, [ix]);

  console.log("Message proved, now relaying...");

  await relayMessage(event.messageHash);
  console.log("Done!");
}

main().catch((e) => {
  console.error("❌ Prove message failed:", e);
  process.exit(1);
});
