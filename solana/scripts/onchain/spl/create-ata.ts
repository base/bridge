import {
  getCreateAssociatedTokenIdempotentInstruction,
  findAssociatedTokenPda,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";

import { CONSTANTS } from "../../constants";
import {
  buildAndSendTransaction,
  getPayer,
  getRpc,
} from "../utils/transaction";
import { getTarget } from "../../utils/argv";

async function main() {
  const target = getTarget();
  const constants = CONSTANTS[target];

  const rpc = getRpc(target);
  const payer = await getPayer(constants.deployerKeyPairFile);

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

  const [ata] = await findAssociatedTokenPda(
    {
      owner: payer.address,
      tokenProgram,
      mint,
    },
    {
      programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    }
  );

  console.log(`🔗 Mint: ${mint}`);
  console.log(`🔗 ATA: ${ata}`);

  const ix = getCreateAssociatedTokenIdempotentInstruction({
    payer,
    ata,
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
