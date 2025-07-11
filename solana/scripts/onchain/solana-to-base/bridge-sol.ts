import {
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { toBytes } from "viem";

import { getBridgeSolInstruction } from "../../../clients/ts/generated";
import { CONSTANTS } from "../../constants";
import { getTarget } from "../../utils/argv";
import { getIdlConstant } from "../../utils/idl-constants";
import { buildAndSendTransaction, getPayer } from "../utils/transaction";

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

  const remoteToken = toBytes(constants.wSol);

  const [bridgeAddress] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
  });

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

  console.log(`🔗 Bridge: ${bridgeAddress}`);
  console.log(`🔗 Sol Vault: ${solVaultAddress}`);
  console.log(`🔗 Outgoing Message: ${outgoingMessageSigner.address}`);

  console.log("🛠️  Building instruction...");
  const ix = getBridgeSolInstruction(
    {
      // Accounts
      payer,
      from: payer,
      gasFeeReceiver: getIdlConstant("GAS_FEE_RECEIVER"),
      solVault: solVaultAddress,
      bridge: bridgeAddress,
      outgoingMessage: outgoingMessageSigner,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,

      // Arguments
      gasLimit: 1_000_000n,
      to: toBytes(constants.recipient),
      remoteToken,
      amount: BigInt(0.001 * 1e9),
      call: null,
    },
    { programAddress: constants.solanaBridge }
  );

  console.log("🚀 Sending transaction...");
  await buildAndSendTransaction(target, [ix]);
  console.log("✅ Done!");
}

main().catch((e) => {
  console.error("❌ Bridge SOL failed:", e);
  process.exit(1);
});
