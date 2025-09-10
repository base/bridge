import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  createKeyPairFromBytes,
  createSignerFromKeyPair,
  type KeyPairSigner,
} from "@solana/kit";

let solanaCliConfigKeypairCache: KeyPairSigner | null = null;
export async function getSolanaCliConfigKeypairSigner() {
  if (solanaCliConfigKeypairCache) {
    return solanaCliConfigKeypairCache;
  }

  const homeDir = homedir();
  const keypairPath = join(homeDir, ".config/solana/id.json");
  if (!existsSync(keypairPath)) {
    throw new Error(`Solana CLI config keypair not found at: ${keypairPath}`);
  }

  solanaCliConfigKeypairCache = await getKeypairSignerFromPath(keypairPath);
  return solanaCliConfigKeypairCache;
}

const keypairSignerCache = new Map<string, KeyPairSigner>();
export async function getKeypairSignerFromPath(keypairPath: string) {
  if (keypairSignerCache.has(keypairPath)) {
    return keypairSignerCache.get(keypairPath)!;
  }

  if (!existsSync(keypairPath)) {
    throw new Error(`Keypair not found at: ${keypairPath}`);
  }

  const keypairBytes = new Uint8Array(await Bun.file(keypairPath).json());
  const keypair = await createKeyPairFromBytes(keypairBytes);
  const signer = await createSignerFromKeyPair(keypair);
  keypairSignerCache.set(keypairPath, signer);

  return signer;
}
