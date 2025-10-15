import { z } from "zod";
import { isAddress as isEvmAddress, type Address as EvmAddress } from "viem";
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
  remoteToken: z
    .string()
    .refine((value) => isEvmAddress(value), {
      message: "Invalid Base/Ethereum address format",
    })
    .transform((value) => value as EvmAddress),
});

type Args = z.infer<typeof argsSchema>;

export async function handleSolVault(args: Args): Promise<void> {
  try {
    logger.info("--- SOL Vault PDA Lookup ---");

    logger.info(`Bridge Program: ${args.bridgeProgram}`);
    logger.info(`Remote token: ${args.remoteToken}`);

    const vaultPubkey = await solVaultPubkey(
      args.bridgeProgram,
      args.remoteToken
    );

    logger.success(`SOL Vault PDA: ${vaultPubkey}`);
  } catch (error) {
    logger.error("SOL Vault lookup failed:", error);
    throw error;
  }
}
