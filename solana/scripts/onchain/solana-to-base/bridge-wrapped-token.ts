import {
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
} from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { toBytes } from "viem";

import {
  fetchBridge,
  getBridgeWrappedTokenInstruction,
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
import { maybeGetAta } from "../utils/ata";

async function main() {
  const target = getTarget();
  const constants = CONSTANTS[target];
  const payer = await getPayer();
  const rpc = getRpc(target);

  const mint = constants.wErc20;

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

  const maybeAta = await maybeGetAta(rpc, payer.address, mint);
  if (!maybeAta.exists) {
    console.error(
      `ATA does not exist, use bun tx:spl:create-ata first and fund it with bun tx:spl:mint`
    );
    return;
  }

  console.log(`🔗 Bridge: ${bridgeAddress}`);
  console.log(`🔗 From Token Account: ${maybeAta.address}`);
  console.log(`🔗 Outgoing Message: ${outgoingMessageSigner.address}`);

  console.log("🛠️  Building instruction...");
  const ix = getBridgeWrappedTokenInstruction(
    {
      // Accounts
      payer,
      from: payer,
      gasFeeReceiver: bridge.data.gasCostConfig.gasFeeReceiver,
      mint,
      fromTokenAccount: maybeAta.address,
      bridge: bridgeAddress,
      outgoingMessage: outgoingMessageSigner,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,

      // Arguments
      to: toBytes(constants.recipient),
      amount: 1n,
      call: null,
    },
    { programAddress: constants.solanaBridge }
  );

  console.log("🚀 Sending transaction...");
  await buildAndSendTransaction(target, [ix]);
  console.log("✅ Transaction sent!");

  await waitAndExecuteOnBase(outgoingMessageSigner.address);
  console.log("✅ Executed on Base!");
}

main().catch((e) => {
  console.error("❌ Bridge wrapped token failed:", e);
  process.exit(1);
});
