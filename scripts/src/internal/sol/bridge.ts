import { getProgramDerivedAddress, type Address } from "@solana/kit";
import { getIdlConstant } from "./bridge-idl.constants";

export async function outgoingMessagePubkey(
  solanaBridge: Address,
  salt?: Uint8Array
) {
  const bytes = new Uint8Array(32);
  const s = salt ?? crypto.getRandomValues(bytes);

  const [pubkey] = await getProgramDerivedAddress({
    programAddress: solanaBridge,
    seeds: [
      Buffer.from(getIdlConstant("OUTGOING_MESSAGE_SEED")),
      Buffer.from(s),
    ],
  });

  return { salt: s, pubkey };
}
