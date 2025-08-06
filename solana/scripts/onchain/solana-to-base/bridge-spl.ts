import {
  createSignerFromKeyPair,
  generateKeyPair,
  getBase58Encoder,
  getProgramDerivedAddress,
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { toBytes } from "viem";

import {
  fetchBridge,
  getBridgeSplInstruction,
} from "../../../clients/ts/generated";
import { CONSTANTS } from "../../constants";
import { getTarget } from "../../utils/argv";
import { getIdlConstant } from "../../utils/idl-constants";
import {
  buildAndSendTransaction,
  getPayer,
  getRpc,
} from "../utils/transaction";

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

  const remoteToken = toBytes(constants.wSpl);
  const mintBytes = getBase58Encoder().encode(constants.spl);

  const [bridgeAddress] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
  });

  const bridge = await fetchBridge(rpc, bridgeAddress);

  const [tokenVaultAddress] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [
      Buffer.from(getIdlConstant("TOKEN_VAULT_SEED")),
      mintBytes,
      Buffer.from(remoteToken),
    ],
  });

  const outgoingMessageKeypair = await generateKeyPair();
  const outgoingMessageSigner = await createSignerFromKeyPair(
    outgoingMessageKeypair
  );

  console.log(`🔗 Bridge: ${bridgeAddress}`);
  console.log(`🔗 Token Vault: ${tokenVaultAddress}`);
  console.log(`🔗 From Token Account: ${constants.splAta}`);
  console.log(`🔗 Outgoing Message: ${outgoingMessageSigner.address}`);

  console.log("🛠️  Building instruction...");
  const ix = getBridgeSplInstruction(
    {
      // Accounts
      payer,
      from: payer,
      gasFeeReceiver: bridge.data.gasCostConfig.gasFeeReceiver,
      mint: constants.spl,
      fromTokenAccount: constants.splAta,
      tokenVault: tokenVaultAddress,
      bridge: bridgeAddress,
      outgoingMessage: outgoingMessageSigner,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,

      // Arguments
      gasLimit: 1_000_000n,
      to: toBytes(constants.recipient),
      remoteToken,
      amount: 1n,
      call: null,
    },
    { programAddress: constants.solanaBridge }
  );

  console.log("🚀 Sending transaction...");
  await buildAndSendTransaction(target, [ix]);
  console.log("✅ Done!");
}

main().catch((e) => {
  console.error("❌ Bridge SPL failed:", e);
  process.exit(1);
});
