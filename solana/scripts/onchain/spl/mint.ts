import { getMintToInstruction } from "@solana-program/token";

import { CONSTANTS } from "../../constants";
import {
  buildAndSendTransaction,
  getPayer,
  getRpc,
} from "../utils/transaction";
import { getTarget } from "../../utils/argv";
import { maybeGetAta } from "../utils/ata";

async function main() {
  const target = getTarget();
  const constants = CONSTANTS[target];
  const rpc = getRpc(target);

  const owner = await getPayer();
  const payer = await getPayer(constants.deployerKeyPairFile);

  console.log("=".repeat(40));
  console.log(`Target: ${target}`);
  console.log(`RPC URL: ${constants.rpcUrl}`);
  console.log(`Owner: ${owner.address}`);
  console.log(`Payer: ${payer.address}`);
  console.log("=".repeat(40));
  console.log("");

  const mint = constants.spl;
  const maybeAta = await maybeGetAta(rpc, owner.address, mint);
  if (!maybeAta.exists) {
    console.error(`ATA does not exist, use bun tx:spl:create-ata first`);
    return;
  }

  console.log(`🔗 Mint: ${mint}`);
  console.log(`🔗 ATA: ${maybeAta.address}`);
  console.log(`🔗 Mint Authority: ${payer.address}`);

  const ix = getMintToInstruction({
    mint,
    token: maybeAta.address,
    mintAuthority: payer,
    amount: 100n,
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
