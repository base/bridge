import {
  getProgramDerivedAddress,
  type Address as SolanaAddress,
} from "@solana/kit";
import { getIdlConstant } from "./bridge-idl.constants";

export async function outgoingMessagePubkey(
  bridgeProgram: SolanaAddress,
  salt?: Uint8Array
) {
  const bytes = new Uint8Array(32);
  const s = salt ?? crypto.getRandomValues(bytes);

  const [pubkey] = await getProgramDerivedAddress({
    programAddress: bridgeProgram,
    seeds: [
      Buffer.from(getIdlConstant("OUTGOING_MESSAGE_SEED")),
      Buffer.from(s),
    ],
  });

  return { salt: s, pubkey };
}
