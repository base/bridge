import { createSignerFromKeyPair, generateKeyPair } from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  getMintSize,
  getInitializeMint2Instruction,
  TOKEN_PROGRAM_ADDRESS,
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

  const payer = await getPayer();
  const rpc = getRpc(target);

  console.log("=".repeat(40));
  console.log(`Target: ${target}`);
  console.log(`RPC URL: ${constants.rpcUrl}`);
  console.log(`Payer: ${payer.address}`);
  console.log("=".repeat(40));
  console.log("");

  const mintKeypair = await generateKeyPair();
  const mintSigner = await createSignerFromKeyPair(mintKeypair);

  console.log(`🔗 Mint: ${mintSigner.address}`);

  const space = getMintSize();
  const lamports = await rpc
    .getMinimumBalanceForRentExemption(BigInt(space))
    .send();

  const ixs = [
    getCreateAccountInstruction({
      payer: payer,
      newAccount: mintSigner,
      lamports,
      space,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeMint2Instruction({
      mint: mintSigner.address,
      decimals: 10,
      mintAuthority: payer.address,
    }),
  ];

  // Send the transaction.
  console.log("🚀 Sending transaction...");
  await buildAndSendTransaction(target, ixs);
  console.log("✅ Done!");
}

main().catch((e) => {
  console.error("❌ Initialization failed:", e);
  process.exit(1);
});
