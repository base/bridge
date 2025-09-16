import {
  address,
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";

import {
  fetchCfg,
  getInitializeInstruction,
} from "../../clients/ts/generated/base_relayer";
import { getRelayerIdlConstant } from "../utils/base-relayer-idl-constants";
import { CONSTANTS } from "../constants";
import { buildAndSendTransaction, getPayer, getRpc } from "./utils/transaction";
import { getTarget } from "../utils/argv";

async function main() {
  const target = getTarget();
  const constants = CONSTANTS[target];
  const rpc = getRpc(target);
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
  const eip1559Config = {
    target: 5_000_000,
    denominator: 2,
    windowDurationSeconds: 1,
    minimumBaseFee: 1,
  };
  const gasConfig = {
    minGasLimitPerMessage: 100_000,
    maxGasLimitPerMessage: 5_000_000,
    gasCostScaler: 1_000_000,
    gasCostScalerDp: 1_000_000,
    gasFeeReceiver: payer.address,
  };

  // Build the instruction.
  console.log("🛠️  Building instruction...");
  const ix = getInitializeInstruction(
    {
      // Accounts
      payer: payer,
      cfg: cfgAddress,
      guardian,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,

      // Arguments
      newGuardian: address(guardian.address),
      eip1559Config,
      gasConfig,
    },
    { programAddress: constants.baseRelayerProgram }
  );

  // Send the transaction.
  console.log("🚀 Sending transaction...");
  await buildAndSendTransaction(target, [ix]);
  console.log("✅ Done!");

  console.log("Confirming configuration...");
  const cfgData = await fetchCfg(rpc, cfgAddress);

  // EIP1559 confirmation
  if (cfgData.data.guardian !== guardian.address) {
    throw new Error("Guardian mismatch!");
  }
  if (cfgData.data.eip1559.config.target !== BigInt(eip1559Config.target)) {
    throw new Error("EIP-1559 target mismatch!");
  }
  if (
    cfgData.data.eip1559.config.denominator !==
    BigInt(eip1559Config.denominator)
  ) {
    throw new Error("EIP-1559 denominator mismatch!");
  }
  if (
    cfgData.data.eip1559.config.windowDurationSeconds !==
    BigInt(eip1559Config.windowDurationSeconds)
  ) {
    throw new Error("EIP-1559 windowDurationSeconds mismatch!");
  }
  if (
    cfgData.data.eip1559.config.minimumBaseFee !==
    BigInt(eip1559Config.minimumBaseFee)
  ) {
    throw new Error("EIP-1559 minimumBaseFee mismatch!");
  }

  // Gas config confirmation
  if (
    cfgData.data.gasConfig.minGasLimitPerMessage !==
    BigInt(gasConfig.minGasLimitPerMessage)
  ) {
    throw new Error("Gas config minGasLimitPerMessage mismatch!");
  }
  if (
    cfgData.data.gasConfig.maxGasLimitPerMessage !==
    BigInt(gasConfig.maxGasLimitPerMessage)
  ) {
    throw new Error("Gas config maxGasLimitPerMessage mismatch!");
  }
  if (
    cfgData.data.gasConfig.gasCostScaler !== BigInt(gasConfig.gasCostScaler)
  ) {
    throw new Error("Gas config gasCostScaler mismatch!");
  }
  if (
    cfgData.data.gasConfig.gasCostScalerDp !== BigInt(gasConfig.gasCostScalerDp)
  ) {
    throw new Error("Gas config gasCostScalerDp mismatch!");
  }
  if (cfgData.data.gasConfig.gasFeeReceiver !== gasConfig.gasFeeReceiver) {
    throw new Error("Gas config gasFeeReceiver mismatch!");
  }
}

main().catch((e) => {
  console.error("❌ Initialization failed:", e);
  process.exit(1);
});
