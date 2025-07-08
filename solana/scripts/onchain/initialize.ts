import { getProgramDerivedAddress } from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";

import { getInitializeInstruction } from "../../clients/ts/generated";
import { getIdlConstant } from "../utils/idl-constants";
import { CONSTANTS } from "../constants";
import { buildAndSendTransaction, getPayer } from "./utils/transaction";
import { getTarget } from "../utils/argv";

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

  // Derive the bridge PDA.
  const [bridgeAddress] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
  });

  // Build the instruction.
  console.log("🛠️  Building instruction...");
  const ix = getInitializeInstruction(
    {
      payer: payer,
      bridge: bridgeAddress,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
    },
    { programAddress: constants.solanaBridge }
  );

  // Send the transaction.
  console.log("🚀 Sending transaction...");
  await buildAndSendTransaction(target, [ix]);
  console.log("✅ Done!");
}

main().catch((e) => {
  console.error("❌ Initialization failed:", e);
  process.exit(1);
});
