import {
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { toBytes } from "viem";

import {
  fetchBridge,
  getBridgeSolInstruction,
} from "../../../clients/ts/generated/bridge";
import {
  getPayForRelayInstruction,
  fetchCfg,
} from "../../../clients/ts/generated/base_relayer";
import { CONSTANTS } from "../../constants";
import { getTarget } from "../../utils/argv";
import { getIdlConstant } from "../../utils/idl-constants";
import { getRelayerIdlConstant } from "../../utils/base-relayer-idl-constants";
import {
  buildAndSendTransaction,
  getPayer,
  getRpc,
} from "../utils/transaction";
import { waitAndExecuteOnBase } from "../../utils";

const AUTO_EXECUTE = true;

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

  const remoteToken = toBytes(constants.wSol);

  const [bridgeAddress] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
  });
  const [cfgAddress] = await getProgramDerivedAddress({
    programAddress: constants.baseRelayerProgram,
    seeds: [Buffer.from(getRelayerIdlConstant("CFG_SEED"))],
  });

  const bridge = await fetchBridge(rpc, bridgeAddress);
  const cfg = await fetchCfg(rpc, cfgAddress);

  const [solVaultAddress] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [
      Buffer.from(getIdlConstant("SOL_VAULT_SEED")),
      Buffer.from(remoteToken),
    ],
  });

  const outgoingMessageKeypair = await generateKeyPair();
  const outgoingMessageSigner = await createSignerFromKeyPair(
    outgoingMessageKeypair
  );

  const mtrKeypair = await generateKeyPair();
  const mtrSigner = await createSignerFromKeyPair(mtrKeypair);

  console.log(`🔗 Bridge: ${bridgeAddress}`);
  console.log(`🔗 Sol Vault: ${solVaultAddress}`);
  console.log(`🔗 Outgoing Message: ${outgoingMessageSigner.address}`);
  console.log(`🔗 Message To Relay: ${mtrSigner.address}`);

  console.log("🛠️  Building instruction...");
  const relayIx = getPayForRelayInstruction(
    {
      // Accounts
      payer,
      cfg: cfgAddress,
      gasFeeReceiver: cfg.data.gasConfig.gasFeeReceiver,
      messageToRelay: mtrSigner,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,

      // Arguments
      outgoingMessage: outgoingMessageSigner.address,
      gasLimit: BigInt(200_000),
    },
    { programAddress: constants.baseRelayerProgram }
  );

  const ix = getBridgeSolInstruction(
    {
      // Accounts
      payer,
      from: payer,
      gasFeeReceiver: bridge.data.gasConfig.gasFeeReceiver,
      solVault: solVaultAddress,
      bridge: bridgeAddress,
      outgoingMessage: outgoingMessageSigner,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,

      // Arguments
      to: toBytes(constants.recipient),
      remoteToken,
      amount: BigInt(0.001 * 1e9),
      call: null,
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
  console.error("❌ Bridge SOL failed:", e);
  process.exit(1);
});
