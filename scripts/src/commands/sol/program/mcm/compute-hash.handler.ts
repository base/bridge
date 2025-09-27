import { z } from "zod";
import { isHash, type Hash, keccak256, pad, concat, toHex } from "viem";

import { logger } from "@internal/logger";

export const argsSchema = z.object({
  root: z
    .string()
    .refine((val) => isHash(val), {
      message: "Root must be a 32-byte hash",
    })
    .transform((val) => val as Hash),
  validUntil: z
    .string()
    .transform((val) => parseInt(val))
    .refine((val) => !isNaN(val) && val > 0, {
      message: "Valid until must be a positive timestamp",
    }),
});

type Args = z.infer<typeof argsSchema>;

export async function handleComputeHash(args: Args): Promise<void> {
  try {
    logger.info("--- MCM Compute Hash script ---");

    logger.info(`Root: ${args.root}`);
    logger.info(
      `Valid until: ${args.validUntil} (${new Date(args.validUntil * 1000).toISOString()})`
    );

    const hashToSign = computeMcmHash(args.root, args.validUntil);

    logger.success(`Hash to sign: ${hashToSign}`);
  } catch (error) {
    logger.error("Hash computation failed:", error);
    throw error;
  }
}

function computeMcmHash(root: Hash, validUntil: number): string {
  const rootBytes = root;
  const validUntilPadded = pad(toHex(validUntil), { size: 32 });

  const data = concat([rootBytes, validUntilPadded]);

  return keccak256(data);
}
