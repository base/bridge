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

import { logger } from "@internal/logger";

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

  const { salt, pubkey: messageToRelay } = await mtrPubkey(
    solConfig.baseRelayer
  );
  logger.info(`Message To Relay: ${messageToRelay}`);

  return getPayForRelayInstruction(
    {
      // Accounts
      payer,
      cfg: cfgAddress,
      gasFeeReceiver: cfg.data.gasConfig.gasFeeReceiver,
      messageToRelay,
      mtrSalt: salt,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,

      // Arguments
      outgoingMessage: outgoingMessage,
      gasLimit: 200_000n,
    },
    { programAddress: solConfig.baseRelayer }
  );
}

export async function mtrPubkey(baseRelayer: Address, salt?: Uint8Array) {
  const bytes = new Uint8Array(32);
  const s = salt ?? crypto.getRandomValues(bytes);

  const [pubkey] = await getProgramDerivedAddress({
    programAddress: baseRelayer,
    seeds: [Buffer.from(getRelayerIdlConstant("MTR_SEED")), Buffer.from(s)],
  });

  return { salt: s, pubkey };
}
