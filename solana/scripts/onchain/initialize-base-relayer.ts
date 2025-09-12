import {
  address,
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";

import { getInitializeInstruction } from "../../clients/ts/generated/base_relayer";
import { getRelayerIdlConstant } from "../utils/base-relayer-idl-constants";
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
  console.log(`Base Relayer Program: ${constants.baseRelayerProgram}`);
  console.log(`Payer: ${payer.address}`);
  console.log("=".repeat(40));
  console.log("");

  // Derive the bridge PDA.
  const [cfgAddress] = await getProgramDerivedAddress({
    programAddress: constants.baseRelayerProgram,
    seeds: [Buffer.from(getRelayerIdlConstant("CFG_SEED"))],
  });

  // TODO: Use the real guardian.
  const guardian = await createSignerFromKeyPair(await generateKeyPair());

  // Build the instruction.
  console.log("🛠️  Building instruction...");
  const ix = getInitializeInstruction(
    {
      payer: payer,
      cfg: cfgAddress,
      guardian,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
      newGuardian: address(guardian.address),
      eip1559Config: {
        target: 5_000_000,
        denominator: 2,
        windowDurationSeconds: 1,
        minimumBaseFee: 1,
      },
      gasConfig: {
        minGasLimitPerMessage: 100_000,
        maxGasLimitPerMessage: 5_000_000,
        gasCostScaler: 1_000_000,
        gasCostScalerDp: 1_000_000,
        gasFeeReceiver: payer.address,
      },
    },
    { programAddress: constants.baseRelayerProgram }
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
