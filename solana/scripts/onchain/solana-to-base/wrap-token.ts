import {
  createSignerFromKeyPair,
  generateKeyPair,
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
} from "../../../clients/ts/generated";
import { CONSTANTS } from "../../constants";
import { getTarget } from "../../utils/argv";
import { getIdlConstant } from "../../utils/idl-constants";
import {
  buildAndSendTransaction,
  getPayer,
  getRpc,
} from "../utils/transaction";

async function main() {
  const target = getTarget();
  const constants = CONSTANTS[target];
  const payer = await getPayer(constants.deployerKeyPairFile);
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
    name: "Wrapped ERC20",
    symbol: "wERC20",
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
  console.log(`🔗 Outgoing Message: ${outgoingMessageSigner.address}`);

  console.log("🛠️  Building instruction...");
  const ix = getWrapTokenInstruction(
    {
      // Accounts
      payer,
      gasFeeReceiver: bridge.data.gasCostConfig.gasFeeReceiver,
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
  await buildAndSendTransaction(target, [ix], payer);
  console.log("✅ Done!");
}

main().catch((e) => {
  console.error("❌ Wrap token failed:", e);
  process.exit(1);
});
