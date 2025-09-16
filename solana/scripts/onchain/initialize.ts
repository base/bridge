import {
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";

import {
  fetchBridge,
  getInitializeInstruction,
} from "../../clients/ts/generated/bridge";
import { getIdlConstant } from "../utils/idl-constants";
import { CONSTANTS } from "../constants";
import { buildAndSendTransaction, getPayer, getRpc } from "./utils/transaction";
import { getTarget } from "../utils/argv";
import { toBytes, toHex } from "viem";

async function main() {
  const target = getTarget();
  const constants = CONSTANTS[target];
  const rpc = getRpc(target);
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
  const eip1559Config = {
    target: 5_000_000,
    denominator: 2,
    windowDurationSeconds: 1,
    minimumBaseFee: 1,
  };
  const gasConfig = {
    gasPerCall: 125_000,
    gasCostScaler: 1_000_000,
    gasCostScalerDp: 1_000_000,
    gasFeeReceiver: payer.address,
  };
  const protocolConfig = {
    blockIntervalRequirement: 300,
  };
  const bufferConfig = {
    maxCallBufferSize: 8 * 1024,
  };
  const baseOracleConfig = {
    threshold: 2,
    signerCount: 2,
    signers: [
      toBytes(constants.solanaEvmLocalKey),
      toBytes(constants.solanaEvmKeychainKey),
      ...Array.from(
        { length: 14 },
        () => new Uint8Array(toBytes(constants.solanaEvmLocalKey).length)
      ),
    ],
  };
  const partnerOracleConfig = {
    requiredThreshold: 3,
  };

  // Build the instruction.
  console.log("🛠️  Building instruction...");
  const ix = getInitializeInstruction(
    {
      // Accounts
      payer: payer,
      bridge: bridgeAddress,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,

      // Arguments
      guardian,
      eip1559Config,
      gasConfig,
      protocolConfig,
      bufferConfig,
      baseOracleConfig,
      partnerOracleConfig,
    },
    { programAddress: constants.solanaBridge }
  );

  // Send the transaction.
  console.log("🚀 Sending transaction...");
  await buildAndSendTransaction(target, [ix]);
  console.log("✅ Done!");

  console.log("Confirming bridge configuration...");
  const bridgeData = await fetchBridge(rpc, bridgeAddress);

  // EIP1559 confirmation
  if (bridgeData.data.guardian !== guardian.address) {
    throw new Error("Guardian mismatch!");
  }
  if (bridgeData.data.eip1559.config.target !== BigInt(eip1559Config.target)) {
    throw new Error("EIP-1559 target mismatch!");
  }
  if (
    bridgeData.data.eip1559.config.denominator !==
    BigInt(eip1559Config.denominator)
  ) {
    throw new Error("EIP-1559 denominator mismatch!");
  }
  if (
    bridgeData.data.eip1559.config.windowDurationSeconds !==
    BigInt(eip1559Config.windowDurationSeconds)
  ) {
    throw new Error("EIP-1559 windowDurationSeconds mismatch!");
  }
  if (
    bridgeData.data.eip1559.config.minimumBaseFee !==
    BigInt(eip1559Config.minimumBaseFee)
  ) {
    throw new Error("EIP-1559 minimumBaseFee mismatch!");
  }

  // Gas config confirmation
  if (bridgeData.data.gasConfig.gasPerCall !== BigInt(gasConfig.gasPerCall)) {
    throw new Error("Gas config gasPerCall mismatch!");
  }
  if (
    bridgeData.data.gasConfig.gasCostScaler !== BigInt(gasConfig.gasCostScaler)
  ) {
    throw new Error("Gas config gasCostScaler mismatch!");
  }
  if (
    bridgeData.data.gasConfig.gasCostScalerDp !==
    BigInt(gasConfig.gasCostScalerDp)
  ) {
    throw new Error("Gas config gasCostScalerDp mismatch!");
  }
  if (bridgeData.data.gasConfig.gasFeeReceiver !== gasConfig.gasFeeReceiver) {
    throw new Error("Gas config gasFeeReceiver mismatch!");
  }

  // Protocol config confirmation
  if (
    bridgeData.data.protocolConfig.blockIntervalRequirement !==
    BigInt(protocolConfig.blockIntervalRequirement)
  ) {
    throw new Error("Protocol config blockIntervalRequirement mismatch!");
  }

  // Buffer config confirmation
  if (
    bridgeData.data.bufferConfig.maxCallBufferSize !==
    BigInt(bufferConfig.maxCallBufferSize)
  ) {
    throw new Error("Buffer config maxCallBufferSize mismatch!");
  }

  // Base Oracle config confirmation
  if (
    bridgeData.data.baseOracleConfig.threshold !== baseOracleConfig.threshold
  ) {
    throw new Error("Base oracle config threshold mismatch!");
  }
  if (
    bridgeData.data.baseOracleConfig.signerCount !==
    baseOracleConfig.signerCount
  ) {
    throw new Error("Base oracle config signerCount mismatch!");
  }
  if (
    bridgeData.data.baseOracleConfig.signers.length !==
    baseOracleConfig.signers.length
  ) {
    throw new Error("Base oracle config signer array length mismatch!");
  }
  for (let i = 0; i < baseOracleConfig.signers.length; i++) {
    const onchain = bridgeData.data.baseOracleConfig.signers[i];
    const expected = baseOracleConfig.signers[i];
    if (onchain === undefined || expected === undefined) {
      throw new Error(`Base oracle config signer missing! Index: ${i}`);
    }
    if (toHex(new Uint8Array(onchain)) !== toHex(expected as Uint8Array)) {
      throw new Error(`Base oracle config signer mismatch! Index: ${i}`);
    }
  }

  // Partner oracle config confirmation
  if (
    bridgeData.data.partnerOracleConfig.requiredThreshold !==
    partnerOracleConfig.requiredThreshold
  ) {
    throw new Error("Partner oracle config threshold mismatch!");
  }
}

main().catch((e) => {
  console.error("❌ Initialization failed:", e);
  process.exit(1);
});
