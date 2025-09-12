import {
  createSignerFromKeyPair,
  generateKeyPair,
  getBase58Encoder,
  getProgramDerivedAddress,
} from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { createPublicClient, http, toBytes } from "viem";
import { baseSepolia } from "viem/chains";

import {
  CallType,
  fetchBridge,
  getBridgeWrappedTokenInstruction,
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
import { waitAndExecuteOnBase } from "../../utils";
import { maybeGetAta } from "../utils/ata";

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

  // Get twin address from Base contract
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  const payerBytes = getBase58Encoder().encode(payer.address);

  const twinAddress = await publicClient.readContract({
    address: constants.baseBridge,
    abi: BRIDGE_ABI,
    functionName: "getPredictedTwinAddress",
    args: [`0x${payerBytes.toHex()}`],
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

  const maybeAta = await maybeGetAta(rpc, payer.address, constants.wEth);
  if (!maybeAta.exists) {
    console.error(
      `ATA does not exist, use bun tx:spl:create-ata first and fund it with bun tx:spl:mint`
    );
    return;
  }

  console.log(`🔗 Twin: ${twinAddress}`);
  console.log(`🔗 Bridge: ${bridgeAddress}`);
  console.log(`🔗 From Token Account: ${maybeAta.address}`);
  console.log(`🔗 Outgoing Message: ${outgoingMessageSigner.address}`);

  console.log("🛠️  Building instruction...");
  const ix = getBridgeWrappedTokenInstruction(
    {
      // Accounts
      payer,
      from: payer,
      gasFeeReceiver: bridge.data.gasConfig.gasFeeReceiver,
      mint: constants.wEth,
      fromTokenAccount: maybeAta.address,
      bridge: bridgeAddress,
      outgoingMessage: outgoingMessageSigner,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,

      // Arguments
      to: toBytes(twinAddress),
      amount: 1n,
      call: {
        ty: CallType.Call,
        to: toBytes(constants.counter),
        value: 1_000_000_000n, // 0.000000001 ETH
        data: Buffer.from(toBytes("0x28c64dd0")), // incrementPayable()
      },
    },
    { programAddress: constants.solanaBridge }
  );

  console.log("🚀 Sending transaction...");
  await buildAndSendTransaction(target, [ix]);
  console.log("✅ Transaction sent!");

  await waitAndExecuteOnBase(outgoingMessageSigner.address);
  console.log("✅ Executed on Base!");
}

main().catch((e) => {
  console.error("❌ Bridge call value failed:", e);
  process.exit(1);
});
