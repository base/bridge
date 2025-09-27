import { z } from "zod";
import { isHash, type Hex } from "viem";

import { logger } from "@internal/logger";
import { DEPLOY_ENVS } from "@internal/constants";
import { multisigSignerPda } from "@internal/sol/mcm";

// Schema validation
export const argsSchema = z.object({
  deployEnv: z
    .enum(DEPLOY_ENVS, {
      message:
        "Deploy environment must be either 'development-alpha' or 'development-prod'",
    })
    .default("development-alpha"),
  multisigId: z
    .string()
    .refine((val) => isHash(val), {
      message: "Multisig ID must be a 32-byte hex string",
    })
    .transform((val) => val as Hex),
});

type Args = z.infer<typeof argsSchema>;

// Main handler
export async function handlePrintAuthority(args: Args): Promise<void> {
  try {
    logger.info("--- Print MCM Authority ---");

    // Configuration
    logger.info(`Environment: ${args.deployEnv}`);
    logger.info(`Multisig ID: ${args.multisigId}`);

    // Get the multisig signer PDA
    const [multisigSignerAddress] = await multisigSignerPda(
      args.deployEnv,
      args.multisigId
    );

    logger.success(`Multisig authority address: ${multisigSignerAddress}`);
  } catch (error) {
    logger.error("Operation failed:", error);
    throw error;
  }
}
