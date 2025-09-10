import { createKeyPairFromPrivateKeyBytes } from "@solana/keys";
import { getAddressFromPublicKey } from "@solana/addresses";

import { logger } from "@internal/logger";

export async function handleGenerateKeypair(): Promise<void> {
  try {
    logger.info("--- Generate keypair script ---");

    const privateKeyBytes = new Uint8Array(32);
    crypto.getRandomValues(privateKeyBytes);

    const { publicKey } =
      await createKeyPairFromPrivateKeyBytes(privateKeyBytes);

    const publicKeyBytes = new Uint8Array(
      await crypto.subtle.exportKey("raw", publicKey)
    );

    const fullKeypairBytes = new Uint8Array([
      ...privateKeyBytes,
      ...publicKeyBytes,
    ]);

    const address = await getAddressFromPublicKey(publicKey);

    logger.success("Keypair generated successfully!");
    console.log({
      keypair: {
        address,
        publicKey: Array.from(publicKeyBytes),
        secretKey: Array.from(fullKeypairBytes),
      },
    });
  } catch (error) {
    logger.error("Failed to generate keypair:", error);
    throw error;
  }
}
