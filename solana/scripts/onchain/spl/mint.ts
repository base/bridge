import { getMintToInstruction } from "@solana-program/token";

import { CONSTANTS } from "../../constants";
import { buildAndSendTransaction, getPayer } from "../utils/transaction";
import { getTarget } from "../../utils/argv";

async function main() {
  const target = getTarget();
  const constants = CONSTANTS[target];

  const payer = await getPayer();

  console.log("=".repeat(40));
  console.log(`Target: ${target}`);
  console.log(`RPC URL: ${constants.rpcUrl}`);
  console.log(`Payer: ${payer.address}`);
  console.log("=".repeat(40));
  console.log("");

  console.log(`🔗 Mint: ${constants.spl}`);
  console.log(`🔗 ATA: ${constants.splAta}`);
  console.log(`🔗 Mint Authority: ${payer.address}`);

  const ix = getMintToInstruction({
    mint: constants.spl,
    token: constants.splAta,
    mintAuthority: payer,
    amount: 100n,
  });

  // Send the transaction.
  console.log("🚀 Sending transaction...");
  await buildAndSendTransaction(target, [ix]);
  console.log("✅ Done!");
}

main().catch((e) => {
  console.error("❌ Initialization failed:", e);
  process.exit(1);
});
