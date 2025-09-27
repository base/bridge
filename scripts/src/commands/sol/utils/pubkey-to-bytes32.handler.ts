import { z } from "zod";
import { getBase58Codec } from "@solana/kit";

import { logger } from "@internal/logger";

export const argsSchema = z.object({
  pubkey: z.string().min(1, "Pubkey is required"),
});

type PubkeyToBytes32Args = z.infer<typeof argsSchema>;

export async function handlePubkeyToBytes32(
  args: PubkeyToBytes32Args
): Promise<void> {
  try {
    logger.info("--- Pubkey to bytes32 script ---");
    const bytes32 = getBase58Codec().encode(args.pubkey).toHex();
    logger.success(`0x${bytes32}`);
  } catch (error) {
    logger.error("Failed to convert pubkey to bytes32:", error);
    throw error;
  }
}
