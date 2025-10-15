import {
  createSolanaRpc,
  devnet,
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

import { CONFIGS, type DeployEnv } from "../constants";
import { getRelayerIdlConstant } from "./base-relayer-idl.constants";

export async function buildPayForRelayInstruction(
  env: DeployEnv,
  outgoingMessage: Address,
  payer: KeyPairSigner<string>
) {
  const config = CONFIGS[env];
  const solRpc = createSolanaRpc(devnet(config.solana.rpcUrl));

  const [cfgAddress] = await getProgramDerivedAddress({
    programAddress: config.solana.baseRelayerProgram,
    seeds: [Buffer.from(getRelayerIdlConstant("CFG_SEED"))],
  });

  const cfg = await fetchCfg(solRpc, cfgAddress);

  const { salt, pubkey: messageToRelay } = await mtrPubkey(
    config.solana.baseRelayerProgram
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
    { programAddress: config.solana.baseRelayerProgram }
  );
}

export async function mtrPubkey(
  baseRelayerProgram: Address,
  salt?: Uint8Array
) {
  const bytes = new Uint8Array(32);
  const s = salt ?? crypto.getRandomValues(bytes);

  const [pubkey] = await getProgramDerivedAddress({
    programAddress: baseRelayerProgram,
    seeds: [Buffer.from(getRelayerIdlConstant("MTR_SEED")), Buffer.from(s)],
  });

  return { salt: s, pubkey };
}
