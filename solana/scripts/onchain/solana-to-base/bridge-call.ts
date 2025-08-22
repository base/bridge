import {
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { toBytes } from "viem";

import {
  CallType,
  fetchBridge,
  getBridgeCallInstruction,
} from "../../../clients/ts/generated";
import { CONSTANTS } from "../../constants";
import { getTarget } from "../../utils/argv";
import { getIdlConstant } from "../../utils/idl-constants";
import {
  buildAndSendTransaction,
  getPayer,
  getRpc,
} from "../utils/transaction";
import { waitAndExecuteOnBase } from "../../utils";

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

  const outgoingMessageKeypair = await generateKeyPair();
  const outgoingMessageSigner = await createSignerFromKeyPair(
    outgoingMessageKeypair
  );

  console.log(`🔗 Bridge: ${bridgeAddress}`);
  console.log(`🔗 Outgoing Message: ${outgoingMessageSigner.address}`);

  console.log("🛠️  Building instruction...");
  const ix = getBridgeCallInstruction(
    {
      // Accounts
      payer,
      from: payer,
      gasFeeReceiver: bridge.data.gasConfig.gasFeeReceiver,
      bridge: bridgeAddress,
      outgoingMessage: outgoingMessageSigner,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,

      // Arguments
      call: {
        ty: CallType.Call,
        to: toBytes(constants.counter),
        value: 0n,
        data: Buffer.from("d09de08a", "hex"), // signature of Counter.sol:increment()
      },
    },
    { programAddress: constants.solanaBridge }
  );

  // Send the transaction.
  console.log("🚀 Sending transaction...");
  await buildAndSendTransaction(target, [ix]);
  console.log("✅ Transaction sent!");

  await waitAndExecuteOnBase(outgoingMessageSigner.address);
  console.log("✅ Executed on Base!");
}

main().catch((e) => {
  console.error("❌ Bridge call failed:", e);
  process.exit(1);
});
