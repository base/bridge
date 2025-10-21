import { z } from "zod";
import {
  address as solanaAddress,
  isAddress as isSolanaAddress,
} from "@solana/kit";

import { logger } from "@internal/logger";
import { solVaultPubkey } from "@internal/sol";

export const argsSchema = z.object({
  bridgeProgram: z
    .string()
    .refine((value) => isSolanaAddress(value), {
      message: "Value must be a valid Solana address",
    })
    .transform((value) => solanaAddress(value)),
});

type Args = z.infer<typeof argsSchema>;

export async function handleSolVault(args: Args): Promise<void> {
  try {
    logger.info("--- SOL Vault PDA Lookup ---");

    logger.info(`Bridge Program: ${args.bridgeProgram}`);

    const vaultPubkey = await solVaultPubkey(args.bridgeProgram);

    logger.success(`SOL Vault PDA: ${vaultPubkey}`);
  } catch (error) {
    logger.error("SOL Vault lookup failed:", error);
    throw error;
  }
}
