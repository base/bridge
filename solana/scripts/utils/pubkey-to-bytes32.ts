import { getBase58Codec } from "@solana/kit";
import { CONSTANTS } from "../constants";

const ADDRESS = CONSTANTS["devnet-alpha"].solanaBridge;

function main() {
  const bytes32 = getBase58Codec().encode(ADDRESS).toHex();
  console.log({ bytes32 });
}

main();
