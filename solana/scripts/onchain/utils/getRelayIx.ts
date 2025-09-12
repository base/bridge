import {
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import {
  fetchCfg,
  getPayForRelayInstruction,
} from "../../../clients/ts/generated/base_relayer";
import { getRelayerIdlConstant } from "../../utils/base-relayer-idl-constants";
import { getTarget } from "../../utils";
import { CONSTANTS } from "../../constants";
import { getRpc } from "./transaction";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";

export async function getRelayIx(
  outgoingMessage: Address,
  payer: KeyPairSigner<string>
) {
  const target = getTarget();
  const constants = CONSTANTS[target];
  const rpc = getRpc(target);

  const [cfgAddress] = await getProgramDerivedAddress({
    programAddress: constants.baseRelayerProgram,
    seeds: [Buffer.from(getRelayerIdlConstant("CFG_SEED"))],
  });

  const cfg = await fetchCfg(rpc, cfgAddress);

  const mtrKeypair = await generateKeyPair();
  const mtrSigner = await createSignerFromKeyPair(mtrKeypair);

  console.log(`🔗 Message To Relay: ${mtrSigner.address}`);

  return getPayForRelayInstruction(
    {
      // Accounts
      payer,
      cfg: cfgAddress,
      gasFeeReceiver: cfg.data.gasConfig.gasFeeReceiver,
      messageToRelay: mtrSigner,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,

      // Arguments
      outgoingMessage: outgoingMessage,
      gasLimit: BigInt(200_000),
    },
    { programAddress: constants.baseRelayerProgram }
  );
}
