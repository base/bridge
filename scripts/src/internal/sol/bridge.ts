import { getProgramDerivedAddress, type Address } from "@solana/kit";
import { getIdlConstant } from "./bridge-idl.constants";

export async function outgoingMessagePubkey(
  solanaridge: Address,
  salt?: Uint8Array
) {
  const bytes = new Uint8Array(32);
  const s = salt ?? crypto.getRandomValues(bytes);

  const [pubkey] = await getProgramDerivedAddress({
    programAddress: solanaridge,
    seeds: [Buffer.from(getIdlConstant("OUTGOING_MESSAGE_SEED"))],
  });

  return { salt: s, pubkey };
}
