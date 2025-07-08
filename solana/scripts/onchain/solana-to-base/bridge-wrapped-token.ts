import {
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
} from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { toBytes } from "viem";

import { getBridgeWrappedTokenInstruction } from "../../../clients/ts/generated";
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

  const [bridgeAddress] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
  });

  const outgoingMessageKeypair = await generateKeyPair();
  const outgoingMessageSigner = await createSignerFromKeyPair(
    outgoingMessageKeypair
  );

  console.log(`🔗 Bridge: ${bridgeAddress}`);
  console.log(`🔗 From Token Account: ${constants.wErc20Ata}`);
  console.log(`🔗 Outgoing Message: ${outgoingMessageSigner.address}`);

  console.log("🛠️  Building instruction...");
  const ix = getBridgeWrappedTokenInstruction(
    {
      // Accounts
      payer,
      from: payer,
      gasFeeReceiver: getIdlConstant("GAS_FEE_RECEIVER"),
      mint: constants.wErc20,
      fromTokenAccount: constants.wErc20Ata,
      bridge: bridgeAddress,
      outgoingMessage: outgoingMessageSigner,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,

      // Arguments
      gasLimit: 1_000_000n,
      to: toBytes(constants.recipient),
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
  console.error("❌ Bridge wrapped token failed:", e);
  process.exit(1);
});
