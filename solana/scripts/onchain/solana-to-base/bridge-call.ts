import {
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { toBytes } from "viem";

import {
  CallType,
  getBridgeCallInstruction,
} from "../../../clients/ts/generated";
import { CONSTANTS } from "../../constants";
import { getTarget } from "../../utils/argv";
import { getIdlConstant } from "../../utils/idl-constants";
import { buildAndSendTransaction, getPayer } from "../utils/transaction";

const COUNTER_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function main() {
  const target = getTarget();
  const constants = CONSTANTS[target];

  const payer = await getPayer();

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
      gasFeeReceiver: getIdlConstant("GAS_FEE_RECEIVER"),
      bridge: bridgeAddress,
      outgoingMessage: outgoingMessageSigner,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,

      // Arguments
      gasLimit: 1_000_000n,
      call: {
        ty: CallType.Call,
        to: toBytes(COUNTER_ADDRESS),
        value: 0n,
        data: Buffer.from("d09de08a", "hex"),
      },
    },
    { programAddress: constants.solanaBridge }
  );

  // Send the transaction.
  console.log("🚀 Sending transaction...");
  await buildAndSendTransaction(target, [ix]);
  console.log("✅ Done!");
}

main().catch((e) => {
  console.error("❌ Bridge call failed:", e);
  process.exit(1);
});
