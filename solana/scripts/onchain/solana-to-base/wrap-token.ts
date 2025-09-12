import {
  createSignerFromKeyPair,
  generateKeyPair,
  getBase58Codec,
  getProgramDerivedAddress,
  getU8Codec,
} from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { keccak256, toBytes } from "viem";

import {
  fetchBridge,
  getWrapTokenInstruction,
  type WrapTokenInstructionDataArgs,
} from "../../../clients/ts/generated/bridge";
import { CONSTANTS } from "../../constants";
import { getBooleanFlag, getTarget } from "../../utils/argv";
import { getIdlConstant } from "../../utils/idl-constants";
import {
  buildAndSendTransaction,
  getPayer,
  getRpc,
} from "../utils/transaction";
import { waitAndExecuteOnBase } from "../../utils";
import { getRelayIx } from "../utils";

const AUTO_EXECUTE = getBooleanFlag("auto-execute", true);

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

  // Instruction arguments
  const args: WrapTokenInstructionDataArgs = {
    decimals: 6,
    name: "Wrapped ETH",
    symbol: "wETH",
    remoteToken: toBytes(constants.erc20),
    scalerExponent: 9,
  };

  // Calculate metadata hash
  const metadataHash = keccak256(
    Buffer.concat([
      Buffer.from(args.name),
      Buffer.from(args.symbol),
      Buffer.from(args.remoteToken),
      Buffer.from(getU8Codec().encode(args.scalerExponent)),
    ])
  );

  // Derive PDAs
  const [mintAddress] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [
      Buffer.from(getIdlConstant("WRAPPED_TOKEN_SEED")),
      Buffer.from([args.decimals]),
      toBytes(metadataHash),
    ],
  });

  const [bridgeAddress] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
  });

  const bridge = await fetchBridge(rpc, bridgeAddress);

  const outgoingMessageKeypair = await generateKeyPair();
  const outgoingMessageSigner = await createSignerFromKeyPair(
    outgoingMessageKeypair
  );

  console.log(`🔗 Bridge: ${bridgeAddress}`);
  console.log(`🔗 Mint: ${mintAddress}`);
  console.log(
    `🔗 Mint (bytes32): ${getBase58Codec().encode(mintAddress).toHex()}`
  );
  console.log(`🔗 Outgoing Message: ${outgoingMessageSigner.address}`);

  const relayIx = await getRelayIx(outgoingMessageSigner.address, payer);

  console.log("🛠️  Building instruction...");
  const ix = getWrapTokenInstruction(
    {
      // Accounts
      payer,
      gasFeeReceiver: bridge.data.gasConfig.gasFeeReceiver,
      mint: mintAddress,
      bridge: bridgeAddress,
      outgoingMessage: outgoingMessageSigner,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,

      // Arguments
      ...args,
    },
    { programAddress: constants.solanaBridge }
  );

  console.log("🚀 Sending transaction...");
  if (AUTO_EXECUTE) {
    await buildAndSendTransaction(target, [relayIx, ix]);
  } else {
    await buildAndSendTransaction(target, [ix]);
  }
  console.log("✅ Transaction sent!");

  await waitAndExecuteOnBase(outgoingMessageSigner.address);
  console.log("✅ Executed on Base!");
}

main().catch((e) => {
  console.error("❌ Wrap token failed:", e);
  process.exit(1);
});
