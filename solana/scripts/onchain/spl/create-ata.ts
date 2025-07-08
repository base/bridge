import {
  TOKEN_PROGRAM_ADDRESS,
  getCreateAssociatedTokenIdempotentInstruction,
  findAssociatedTokenPda,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";

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

  const [ata] = await findAssociatedTokenPda(
    {
      owner: payer.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      mint: constants.spl,
    },
    {
      programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    }
  );

  console.log(`🔗 Mint: ${constants.spl}`);
  console.log(`🔗 ATA: ${ata}`);

  const ix = getCreateAssociatedTokenIdempotentInstruction({
    payer,
    ata,
    mint: constants.spl,
    owner: payer.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
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
