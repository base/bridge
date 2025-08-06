import {
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
} from "@solana/kit";
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

  // TODO: Use the real guardian.
  const guardian = await createSignerFromKeyPair(await generateKeyPair());

  // Build the instruction.
  console.log("🛠️  Building instruction...");
  const ix = getInitializeInstruction(
    {
      payer: payer,
      bridge: bridgeAddress,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
      guardian,
      eip1559Config: {
        target: 5_000_000,
        denominator: 2,
        windowDurationSeconds: 1,
        minimumBaseFee: 1,
      },
      gasCostConfig: {
        gasCostScaler: 1_000_000,
        gasCostScalerDp: 1_000_000,
        gasFeeReceiver: payer.address,
      },
      gasConfig: {
        extra: 10_000,
        executionPrologue: 20_000,
        execution: 5_000,
        executionEpilogue: 25_000,
        baseTransactionCost: 21_000,
        maxGasLimitPerMessage: 100_000_000,
      },
      protocolConfig: {
        blockIntervalRequirement: 300,
      },
      bufferConfig: {
        maxCallBufferSize: 8 * 1024,
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
  console.error("❌ Initialization failed:", e);
  process.exit(1);
});
