import { z } from "zod";

import { logger } from "@internal/logger";
import { getKeypairSignerFromPath } from "@internal/sol";

export const argsSchema = z.object({
  keypairPath: z.string().min(1, "Keypair path is required"),
});

type KeypairToAddressArgs = z.infer<typeof argsSchema>;

export async function handleKeypairToAddress(
  args: KeypairToAddressArgs
): Promise<void> {
  try {
    logger.info("--- Keypair to address script ---");

    const keypair = await getKeypairSignerFromPath(args.keypairPath);

    logger.success(`Address: ${keypair.address}`);
  } catch (error) {
    logger.error("Failed to get address from keypair:", error);
    throw error;
  }
}
