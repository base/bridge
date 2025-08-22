import {
  createSolanaRpc,
  devnet,
  getBase58Encoder,
  type Address as SolAddress,
} from "@solana/kit";
import { toHex, keccak256, encodeAbiParameters, padHex, type Hex } from "viem";

import { BRIDGE_ABI, BRIDGE_VALIDATOR_ABI } from "../abi";

import { CONSTANTS } from "../constants";
import { getTarget } from "./argv";
import { fetchOutgoingMessage, type Call } from "../../clients/ts/generated";
import {
  getPublicClient,
  writeContractTx,
  getDefaultChainFromEnv,
} from "../onchain/utils/evmTransaction";

// See MessageType enum in MessageLib.sol
const MessageType = {
  Call: 0,
  Transfer: 1,
  TransferAndCall: 2,
} as const;

export async function waitAndExecuteOnBase(outgoingMessagePubkey: SolAddress) {
  console.log("🔄 Waiting for oracle to prevalidate...");

  const target = getTarget();
  const constants = CONSTANTS[target];

  // Solana: fetch OutgoingMessage
  const solRpc = createSolanaRpc(devnet(`https://${constants.rpcUrl}`));
  const outgoing = await fetchOutgoingMessage(solRpc, outgoingMessagePubkey);

  // Build Base IncomingMessage fields from Solana OutgoingMessage
  const nonce = BigInt(outgoing.data.nonce);
  const senderBytes32 = bytes32FromPubkey(outgoing.data.sender);

  const { ty, data } = buildIncomingPayload(outgoing);

  // Compute inner message hash as Base contracts do
  const innerHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint8" }, { type: "bytes" }],
      [senderBytes32, ty, data]
    )
  );

  // Compute expected final hash using the nonce from the OutgoingMessage
  const expectedMessageHash = keccak256(
    encodeAbiParameters(
      [{ type: "uint64" }, { type: "bytes32" }],
      [nonce, innerHash]
    )
  );

  // EVM: resolve chain, clients, and contract addresses
  const chain = getDefaultChainFromEnv();
  const publicClient = getPublicClient({ chain });

  const bridgeAddress = constants.baseBridge as `0x${string}`;

  // Resolve BridgeValidator address from Bridge
  const validatorAddress = (await publicClient.readContract({
    address: bridgeAddress,
    abi: BRIDGE_ABI,
    functionName: "BRIDGE_VALIDATOR",
  })) as `0x${string}`;

  console.log(`Computed inner hash: ${innerHash}`);
  console.log(`Expected message hash: ${expectedMessageHash}`);

  // Wait for validator approval of this exact message hash
  await waitForApproval({
    publicClient,
    validator: validatorAddress,
    messageHash: expectedMessageHash,
  });

  // Optional: assert Bridge.getMessageHash(message) equals expected hash
  const evmMessage = {
    nonce,
    sender: senderBytes32,
    ty,
    data,
  } as const;

  const sanity = (await publicClient.readContract({
    address: bridgeAddress,
    abi: BRIDGE_ABI,
    functionName: "getMessageHash",
    args: [evmMessage],
  })) as Hex;

  if (sanitizeHex(sanity) !== sanitizeHex(expectedMessageHash)) {
    throw new Error(
      `Sanity check failed: getMessageHash != expected. got=${sanity}, expected=${expectedMessageHash}`
    );
  }

  // Execute the message on Base
  console.log("Executing Bridge.relayMessages([...]) on Base...");
  await writeContractTx(
    {
      address: bridgeAddress,
      abi: BRIDGE_ABI,
      functionName: "relayMessages",
      args: [[evmMessage] as never],
    },
    { chain }
  );

  console.log("✅ Message executed on Base.");
}

function bytes32FromPubkey(pubkey: SolAddress): Hex {
  const bytes = getBase58Encoder().encode(pubkey);
  // toHex requires a mutable Uint8Array
  let hex = toHex(new Uint8Array(bytes));
  if (hex.length !== 66) {
    // left pad to 32 bytes if needed
    hex = padHex(hex, { size: 32 });
  }
  return hex as Hex;
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
      localToken:
        `0x${toHex(new Uint8Array(transfer.remoteToken)).slice(2)}` as Hex,
      remoteToken: bytes32FromPubkey(transfer.localToken as SolAddress),
      to: padHex(`0x${toHex(new Uint8Array(transfer.to)).slice(2)}`, {
        size: 32,
        // Bytes32 `to` expects the EVM address in the first 20 bytes.
        // Right-pad zeros so casting `bytes20(to)` yields the intended address.
        dir: "right",
      }) as Hex,
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
  } as const;
}

async function waitForApproval({
  publicClient,
  validator,
  messageHash,
  timeoutMs = 10 * 60 * 1000,
  intervalMs = 5_000,
}: {
  publicClient: ReturnType<typeof getPublicClient>;
  validator: `0x${string}`;
  messageHash: Hex;
  timeoutMs?: number;
  intervalMs?: number;
}) {
  const start = Date.now();
  while (true) {
    const approved = (await publicClient.readContract({
      address: validator,
      abi: BRIDGE_VALIDATOR_ABI,
      functionName: "validMessages",
      args: [messageHash],
    })) as boolean;

    if (approved) {
      console.log("✅ Message approved by BridgeValidator.");
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
