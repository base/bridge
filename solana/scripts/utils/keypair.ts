import { createKeyPairFromBytes, getAddressFromPublicKey } from "@solana/kit";

export async function keyPairToAddress(keyPairFile: Bun.BunFile) {
  const keyPairBytes = new Uint8Array(await keyPairFile.json());
  const keyPair = await createKeyPairFromBytes(keyPairBytes);
  return await getAddressFromPublicKey(keyPair.publicKey);
}
