import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchMaybeToken,
  findAssociatedTokenPda,
} from "@solana-program/token-2022";

import type { Address, createSolanaRpc } from "@solana/kit";

type RpcType = ReturnType<typeof createSolanaRpc>;

export async function maybeGetAta(rpc: RpcType, owner: Address, mint: Address) {
  const mintAcc = await rpc
    .getAccountInfo(mint, {
      encoding: "jsonParsed",
    })
    .send();
  if (!mintAcc.value) {
    throw new Error("Mint not found");
  }

  const tokenProgram = mintAcc.value?.owner;
  const [ata] = await findAssociatedTokenPda(
    {
      owner,
      tokenProgram,
      mint,
    },
    {
      programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    }
  );

  return await fetchMaybeToken(rpc, ata);
}
