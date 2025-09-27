import {
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
} from "@solana/kit";
import { SOLANA_LOADER_V3_PROGRAM_PROGRAM_ADDRESS } from "@xenoliss/solana-loader-v3-client";

export async function programDataPda(programId: Address) {
  const programIdBytes = getAddressEncoder().encode(programId);

  return await getProgramDerivedAddress({
    programAddress: SOLANA_LOADER_V3_PROGRAM_PROGRAM_ADDRESS,
    seeds: [programIdBytes],
  });
}
