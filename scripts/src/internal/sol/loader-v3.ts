/**
 * BPF Loader Upgradeable v3 Utilities
 *
 * Helper functions for working with Solana's BPF Loader Upgradeable program.
 * Used to derive program data addresses and interact with upgradeable programs.
 */

import {
  getProgramDerivedAddress,
  address as solanaAddress,
  getAddressEncoder,
  type Address,
} from "@solana/kit";

/**
 * The BPF Loader Upgradeable program address.
 * This is the program that manages upgradeable Solana programs.
 */
export const BPF_UPGRADEABLE_LOADER_ADDRESS = solanaAddress(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);

/**
 * Derives the Program Data Account (PDA) address for an upgradeable program.
 *
 * For upgradeable programs, the program address itself doesn't contain the upgrade authority.
 * Instead, there's a separate Program Data Account that stores:
 * - The upgrade authority public key
 * - The program's executable data
 * - Other metadata
 *
 * This PDA is derived using the BPF Loader Upgradeable program and the program's address as a seed.
 *
 * @param programAddress - The address of the upgradeable program
 * @returns A Promise that resolves to the Program Data Account address
 *
 * @example
 * ```typescript
 * const bridgeProgramId = solanaAddress("BRG...");
 * const programDataAddress = await getProgramDataAddress(bridgeProgramId);
 * console.log(`Program data: ${programDataAddress}`);
 * ```
 */
export async function getProgramDataAddress(
  programAddress: Address
): Promise<Address> {
  const [programDataAddress] = await getProgramDerivedAddress({
    programAddress: BPF_UPGRADEABLE_LOADER_ADDRESS,
    seeds: [getAddressEncoder().encode(programAddress)],
  });

  return programDataAddress;
}
