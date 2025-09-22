import {
  createSignerFromKeyPair,
  createSolanaRpc,
  devnet,
  generateKeyPair,
  getProgramDerivedAddress,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";

import {
  getPayForRelayInstruction,
  fetchCfg,
} from "../../../../clients/ts/src/base-relayer";

import { CONSTANTS } from "./constants";
import { getRelayerIdlConstant } from "./base-relayer-idl.constants";

type Cluster = keyof typeof CONSTANTS;
type Release = keyof (typeof CONSTANTS)[Cluster];

export async function buildPayForRelayInstruction(
  cluster: Cluster,
  release: Release,
  outgoingMessage: Address,
  payer: KeyPairSigner<string>
) {
  const solConfig = CONSTANTS[cluster][release];
  const solRpc = createSolanaRpc(devnet(`https://${solConfig.rpcUrl}`));

  const [cfgAddress] = await getProgramDerivedAddress({
    programAddress: solConfig.baseRelayer,
    seeds: [Buffer.from(getRelayerIdlConstant("CFG_SEED"))],
  });

  const cfg = await fetchCfg(solRpc, cfgAddress);

  const mtrKeypair = await generateKeyPair();
  const mtrSigner = await createSignerFromKeyPair(mtrKeypair);

  console.log(`Message To Relay: ${mtrSigner.address}`);

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
    { programAddress: solConfig.baseRelayer }
  );
}
