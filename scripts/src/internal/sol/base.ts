import { sleep } from "bun";
import {
  createSolanaRpc,
  devnet,
  getBase58Codec,
  getBase58Encoder,
  type Address as SolAddress,
} from "@solana/kit";
import {
  toHex,
  keccak256,
  encodeAbiParameters,
  padHex,
  type Hex,
  createWalletClient,
  http,
  createPublicClient,
  type Address as EvmAddress,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { fetchOutgoingMessage, type Call } from "@base/bridge/bridge";

import { BRIDGE_ABI, BRIDGE_VALIDATOR_ABI } from "../base/abi";
import { logger } from "../logger";
import { CONFIGS, type DeployEnv } from "../constants";

// See MessageType enum in MessageLib.sol
const MessageType = {
  Call: 0,
  Transfer: 1,
  TransferAndCall: 2,
} as const;

export async function relayMessageToBase(
  deployEnv: DeployEnv,
  outgoingMessagePubkey: SolAddress
) {
  logger.info("Relaying message to Base...");
  const config = CONFIGS[deployEnv];
  const solRpc = createSolanaRpc(config.solana.rpcUrl);

  const outgoing = await fetchOutgoingMessage(solRpc, outgoingMessagePubkey);

  // Compute inner message hash as Base contracts do
  const { innerHash, outerHash, evmMessage } = buildEvmMessage(outgoing);
  logger.info(`Computed inner hash: ${innerHash}`);
  logger.info(`Computed outer hash: ${outerHash}`);

  const publicClient = createPublicClient({
    chain: config.base.chain,
    transport: http(),
  }) as PublicClient;

  const walletClient = createWalletClient({
    account: privateKeyToAccount(process.env.EVM_PRIVATE_KEY as Hex),
    chain: config.base.chain,
    transport: http(),
  });

  // Resolve BridgeValidator address from Bridge
  const validatorAddress = await publicClient.readContract({
    address: config.base.bridgeContract,
    abi: BRIDGE_ABI,
    functionName: "BRIDGE_VALIDATOR",
  });
  logger.info(`Validator address: ${validatorAddress}`);

  // Wait for validator approval of this exact message hash
  await waitForApproval(publicClient, validatorAddress, outerHash);

  // Optional: assert Bridge.getMessageHash(message) equals expected hash
  const sanity = await publicClient.readContract({
    address: config.base.bridgeContract,
    abi: BRIDGE_ABI,
    functionName: "getMessageHash",
    args: [evmMessage],
  });

  if (sanitizeHex(sanity) !== sanitizeHex(outerHash)) {
    throw new Error(
      `Sanity check failed: getMessageHash != expected. got=${sanity}, expected=${outerHash}`
    );
  }

  // Execute the message on Base
  logger.info("Executing Bridge.relayMessages([...]) on Base...");
  const tx = await walletClient.writeContract({
    address: config.base.bridgeContract,
    abi: BRIDGE_ABI,
    functionName: "relayMessages",
    args: [[evmMessage]],
  });
  logger.success(
    `Message executed on Base: ${config.base.chain.blockExplorers.default.url}/tx/${tx}`
  );
}

export async function monitorMessageExecution(
  deployEnv: DeployEnv,
  outgoingMessagePubkey: SolAddress
) {
  logger.info("Monitoring message execution...");

  const config = CONFIGS[deployEnv];
  const solRpc = createSolanaRpc(config.solana.rpcUrl);

  const publicClient = createPublicClient({
    chain: config.base.chain,
    transport: http(),
  }) as PublicClient;

  const outgoing = await fetchOutgoingMessage(solRpc, outgoingMessagePubkey);
  const { innerHash, outerHash } = buildEvmMessage(outgoing);
  logger.info(`Computed inner hash: ${innerHash}`);
  logger.info(`Computed outer hash: ${outerHash}`);

  while (true) {
    logger.debug(`Waiting for automatic relay of message ${outerHash}...`);

    const isSuccessful = await publicClient.readContract({
      address: config.base.bridgeContract,
      abi: BRIDGE_ABI,
      functionName: "successes",
      args: [outerHash],
    });

    if (isSuccessful) {
      logger.success("Message relayed successfully.");
      return;
    }

    await sleep(10_000);
  }
}

function buildEvmMessage(
  outgoing: Awaited<ReturnType<typeof fetchOutgoingMessage>>
) {
  const nonce = BigInt(outgoing.data.nonce);
  const senderBytes32 = bytes32FromPubkey(outgoing.data.sender);
  const { ty, data } = buildIncomingPayload(outgoing);

  const innerHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint8" }, { type: "bytes" }],
      [senderBytes32, ty, data]
    )
  );

  const pubkey = getBase58Codec().encode(outgoing.address);

  const outerHash = keccak256(
    encodeAbiParameters(
      [{ type: "uint64" }, { type: "bytes32" }, { type: "bytes32" }],
      [nonce, `0x${pubkey.toHex()}`, innerHash]
    )
  );

  const evmMessage = {
    outgoingMessagePubkey: bytes32FromPubkey(outgoing.address),
    gasLimit: 100_000n,
    nonce,
    sender: senderBytes32,
    ty,
    data,
  };

  return { innerHash, outerHash, evmMessage };
}

function bytes32FromPubkey(pubkey: SolAddress): Hex {
  const bytes = getBase58Encoder().encode(pubkey);

  // toHex requires a mutable Uint8Array
  let hex = toHex(new Uint8Array(bytes));
  if (hex.length !== 66) {
    // left pad to 32 bytes if needed
    hex = padHex(hex, { size: 32 });
  }

  return hex;
}

function buildIncomingPayload(
  outgoing: Awaited<ReturnType<typeof fetchOutgoingMessage>>
) {
  const msg = outgoing.data.message;

  // Call
  if (msg.__kind === "Call") {
    const call = msg.fields[0];
    const ty = MessageType.Call;
    const data = encodeCallData(call);
    return { ty, data };
  }

  // Transfer (with optional call)
  if (msg.__kind === "Transfer") {
    const transfer = msg.fields[0];

    const transferTuple = {
      localToken: `0x${toHex(new Uint8Array(transfer.remoteToken)).slice(2)}`,
      remoteToken: bytes32FromPubkey(transfer.localToken),
      to: padHex(`0x${toHex(new Uint8Array(transfer.to)).slice(2)}`, {
        size: 32,
        // Bytes32 `to` expects the EVM address in the first 20 bytes.
        // Right-pad zeros so casting `bytes20(to)` yields the intended address.
        dir: "right",
      }),
      remoteAmount: BigInt(transfer.amount),
    } as const;

    const encodedTransfer = encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "localToken", type: "address" },
            { name: "remoteToken", type: "bytes32" },
            { name: "to", type: "bytes32" },
            { name: "remoteAmount", type: "uint64" },
          ],
        },
      ],
      [transferTuple]
    );

    if (transfer.call.__option === "None") {
      const ty = MessageType.Transfer;
      return { ty, data: encodedTransfer, transferTuple };
    }

    const ty = MessageType.TransferAndCall;
    const call = transfer.call.value;
    const callTuple = callTupleObject(call);
    const data = encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "localToken", type: "address" },
            { name: "remoteToken", type: "bytes32" },
            { name: "to", type: "bytes32" },
            { name: "remoteAmount", type: "uint64" },
          ],
        },
        {
          type: "tuple",
          components: [
            { name: "ty", type: "uint8" },
            { name: "to", type: "address" },
            { name: "value", type: "uint128" },
            { name: "data", type: "bytes" },
          ],
        },
      ],
      [transferTuple, callTuple]
    );

    return { ty, data, transferTuple, callTuple };
  }

  throw new Error("Unsupported outgoing message type");
}

function encodeCallData(call: Call): Hex {
  const evmTo = toHex(new Uint8Array(call.to));

  const encoded = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "ty", type: "uint8" },
          { name: "to", type: "address" },
          { name: "value", type: "uint128" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    [
      {
        ty: Number(call.ty),
        to: evmTo,
        value: BigInt(call.value),
        data: toHex(new Uint8Array(call.data)),
      },
    ]
  );
  return encoded;
}

function callTupleObject(call: Call) {
  const evmTo = toHex(new Uint8Array(call.to));

  return {
    ty: Number(call.ty),
    to: evmTo,
    value: BigInt(call.value),
    data: toHex(new Uint8Array(call.data)),
  };
}

async function waitForApproval(
  publicClient: PublicClient,
  validator: EvmAddress,
  messageHash: Hex,
  timeoutMs = 10 * 60 * 1000,
  intervalMs = 5_000
) {
  const start = Date.now();
  while (true) {
    logger.debug(`Waiting for approval of message hash: ${messageHash}`);

    const approved = await publicClient.readContract({
      address: validator,
      abi: BRIDGE_VALIDATOR_ABI,
      functionName: "validMessages",
      args: [messageHash],
    });

    if (approved) {
      logger.success("Message approved by BridgeValidator.");
      return;
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for BridgeValidator approval");
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function sanitizeHex(h: string): string {
  return h.toLowerCase();
}
