import { getCreateAssociatedTokenIdempotentInstruction } from "@solana-program/token";

import { CONSTANTS } from "../../constants";
import {
  buildAndSendTransaction,
  getPayer,
  getRpc,
} from "../utils/transaction";
import { getTarget } from "../../utils/argv";
import { maybeGetAta } from "../utils/ata";
import { getBase58Codec } from "@solana/kit";

async function main() {
  const target = getTarget();
  const constants = CONSTANTS[target];
  const rpc = getRpc(target);
  const payer = await getPayer();

  console.log("=".repeat(40));
  console.log(`Target: ${target}`);
  console.log(`RPC URL: ${constants.rpcUrl}`);
  console.log(`Payer: ${payer.address}`);
  console.log("=".repeat(40));
  console.log("");

  const mint = constants.wErc20;
  const accountInfo = await rpc
    .getAccountInfo(mint, {
      encoding: "jsonParsed",
    })
    .send();
  if (!accountInfo.value) {
    throw new Error("Mint not found");
  }
  const tokenProgram = accountInfo.value.owner;

  const maybeAta = await maybeGetAta(rpc, payer.address, mint);
  const bytes32 = getBase58Codec().encode(maybeAta.address).toHex();
  if (maybeAta.exists) {
    console.log(`🔗 ATA already exists: ${maybeAta.address} (${bytes32})`);
    return;
  }

  console.log(`🔗 Mint: ${mint}`);
  console.log(`🔗 ATA: ${maybeAta.address} (${bytes32})`);

  const ix = getCreateAssociatedTokenIdempotentInstruction({
    payer,
    ata: maybeAta.address,
    mint,
    owner: payer.address,
    tokenProgram,
  });

  // Send the transaction.
  console.log("🚀 Sending transaction...");
  await buildAndSendTransaction(target, [ix], payer);
  console.log("✅ Done!");
}

main().catch((e) => {
  console.error("❌ Initialization failed:", e);
  process.exit(1);
});
