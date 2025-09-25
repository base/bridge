import { z } from "zod";
import {
  getProgramDerivedAddress,
  devnet,
  type Address,
  type KeyPairSigner,
  createSolanaRpc,
  address,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";

import {
  fetchCfg,
  getInitializeInstruction,
  type Eip1559Config,
  type GasConfig,
} from "../../../../../../clients/ts/src/base-relayer/generated";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  getRelayerIdlConstant,
} from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS } from "@internal/constants";

export const argsSchema = z.object({
  deployEnv: z
    .enum(DEPLOY_ENVS, {
      message:
        "Deploy environment must be either 'development-alpha' or 'development-prod'",
    })
    .default("development-alpha"),
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
  guardianKp: z
    .union([z.literal("payer"), z.string().brand<"guardianKp">()])
    .default("payer"),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];
type GuardianKpArg = Args["guardianKp"];

export async function handleInitialize(args: Args): Promise<void> {
  try {
    logger.info("--- Initialize base-relayer script ---");

    const config = CONFIGS[args.deployEnv];
    const rpcUrl = devnet(`https://${config.solana.rpcUrl}`);
    logger.info(`RPC URL: ${rpcUrl}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    const [cfgAddress] = await getProgramDerivedAddress({
      programAddress: config.solana.baseRelayerProgram,
      seeds: [Buffer.from(getRelayerIdlConstant("CFG_SEED"))],
    });
    logger.info(`Cfg PDA: ${cfgAddress}`);

    const guardian = await resolveGuardianKeypair(args.guardianKp, payer);

    const eip1559Config = {
      target: 5_000_000n,
      denominator: 2n,
      windowDurationSeconds: 1n,
      minimumBaseFee: 1n,
    } as const;

    const gasConfig = {
      minGasLimitPerMessage: 100_000n,
      maxGasLimitPerMessage: 5_000_000n,
      gasCostScaler: 1_000_000n,
      gasCostScalerDp: 1_000_000n,
      gasFeeReceiver: payer.address,
    } as const;

    const ix = getInitializeInstruction(
      {
        payer,
        cfg: cfgAddress,
        guardian,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
        newGuardian: address(guardian.address),
        eip1559Config,
        gasConfig,
      },
      { programAddress: config.solana.baseRelayerProgram }
    );

    logger.info("Sending transaction...");
    const signature = await buildAndSendTransaction(
      args.deployEnv,
      [ix],
      payer
    );
    logger.success("Base Relayer initialization completed!");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );

    await assertInitialized(
      createSolanaRpc(rpcUrl),
      cfgAddress,
      guardian,
      eip1559Config,
      gasConfig
    );
  } catch (error) {
    logger.error("Base Relayer initialization failed:", error);
    throw error;
  }
}

async function resolvePayerKeypair(payerKpArg: PayerKpArg) {
  if (payerKpArg === "config") {
    logger.info("Using Solana CLI config for payer keypair");
    return await getSolanaCliConfigKeypairSigner();
  }

  logger.info(`Using custom payer keypair: ${payerKpArg}`);
  return await getKeypairSignerFromPath(payerKpArg);
}

async function assertInitialized(
  rpc: ReturnType<typeof createSolanaRpc>,
  cfg: Address,
  guardian: KeyPairSigner,
  eip1559Config: Eip1559Config,
  gasConfig: GasConfig
) {
  logger.info("Confirming base-relayer configuration...");
  const cfgData = await fetchCfg(rpc, cfg);

  if (cfgData.data.guardian !== guardian.address) {
    throw new Error("Guardian mismatch!");
  }
  if (cfgData.data.eip1559.config.target !== eip1559Config.target) {
    throw new Error("EIP-1559 target mismatch!");
  }
  if (cfgData.data.eip1559.config.denominator !== eip1559Config.denominator) {
    throw new Error("EIP-1559 denominator mismatch!");
  }
  if (
    cfgData.data.eip1559.config.windowDurationSeconds !==
    eip1559Config.windowDurationSeconds
  ) {
    throw new Error("EIP-1559 windowDurationSeconds mismatch!");
  }
  if (
    cfgData.data.eip1559.config.minimumBaseFee !== eip1559Config.minimumBaseFee
  ) {
    throw new Error("EIP-1559 minimumBaseFee mismatch!");
  }

  if (
    cfgData.data.gasConfig.minGasLimitPerMessage !==
    gasConfig.minGasLimitPerMessage
  ) {
    throw new Error("Gas config minGasLimitPerMessage mismatch!");
  }
  if (
    cfgData.data.gasConfig.maxGasLimitPerMessage !==
    gasConfig.maxGasLimitPerMessage
  ) {
    throw new Error("Gas config maxGasLimitPerMessage mismatch!");
  }
  if (cfgData.data.gasConfig.gasCostScaler !== gasConfig.gasCostScaler) {
    throw new Error("Gas config gasCostScaler mismatch!");
  }
  if (cfgData.data.gasConfig.gasCostScalerDp !== gasConfig.gasCostScalerDp) {
    throw new Error("Gas config gasCostScalerDp mismatch!");
  }
  if (cfgData.data.gasConfig.gasFeeReceiver !== gasConfig.gasFeeReceiver) {
    throw new Error("Gas config gasFeeReceiver mismatch!");
  }
}

async function resolveGuardianKeypair(
  guardianKpArg: GuardianKpArg,
  payer: KeyPairSigner
) {
  if (guardianKpArg === "payer") {
    logger.info("Using payer as guardian keypair");
    return payer;
  }

  logger.info(`Using custom guardian keypair: ${guardianKpArg}`);
  return await getKeypairSignerFromPath(guardianKpArg);
}
