import { z } from "zod";
import {
  getProgramDerivedAddress,
  devnet,
  type Address as SolanaAddress,
  type KeyPairSigner,
  createSolanaRpc,
  address as solanaAddress,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";

import {
  fetchCfg,
  getInitializeInstruction,
  type Eip1559Config,
  type GasConfig,
} from "@base/bridge/base-relayer";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  getRelayerIdlConstant,
  getProgramDataAddress,
} from "@internal/sol";
import { bigintSchema, solanaAddressSchema } from "@internal/utils/cli";

const baseArgsSchema = z.object({
  programId: solanaAddressSchema.transform((value) => solanaAddress(value)),
  rpcUrl: z.string().url("RPC URL must be a valid URL"),
  payerKp: z.union([z.literal("config"), z.string().brand<"payerKp">()]),
  guardian: z.union([
    z.literal("payer"),
    solanaAddressSchema.transform((value) => solanaAddress(value)),
  ]),
});

const eip1559FlatSchema = z.object({
  eip1559Target: bigintSchema,
  eip1559Denominator: bigintSchema,
  eip1559WindowDurationSeconds: bigintSchema,
  eip1559MinimumBaseFee: bigintSchema,
});

const gasFlatSchema = z.object({
  minGasLimitPerMessage: bigintSchema,
  maxGasLimitPerMessage: bigintSchema,
  gasCostScaler: bigintSchema,
  gasCostScalerDp: bigintSchema,
  gasFeeReceiver: solanaAddressSchema.transform((value) =>
    solanaAddress(value)
  ),
});

export const argsSchema = baseArgsSchema
  .extend(eip1559FlatSchema.shape)
  .extend(gasFlatSchema.shape);

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];
type GuardianArg = Args["guardian"];

export async function handleInitialize(args: Args): Promise<void> {
  try {
    logger.info("--- Initialize base-relayer script ---");

    logger.info(`RPC URL: ${args.rpcUrl}`);
    logger.info(`Program ID: ${args.programId}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    const [cfgAddress] = await getProgramDerivedAddress({
      programAddress: args.programId,
      seeds: [Buffer.from(getRelayerIdlConstant("CFG_SEED"))],
    });
    logger.info(`Cfg PDA: ${cfgAddress}`);

    const programDataAddress = await getProgramDataAddress(args.programId);
    logger.info(`Program data address: ${programDataAddress}`);

    const guardianAddress = resolveGuardianAddress(args.guardian, payer);
    logger.info(`Guardian: ${guardianAddress}`);

    const eip1559Config: Eip1559Config = {
      target: args.eip1559Target,
      denominator: args.eip1559Denominator,
      windowDurationSeconds: args.eip1559WindowDurationSeconds,
      minimumBaseFee: args.eip1559MinimumBaseFee,
    };

    const gasConfig: GasConfig = {
      minGasLimitPerMessage: args.minGasLimitPerMessage,
      maxGasLimitPerMessage: args.maxGasLimitPerMessage,
      gasCostScaler: args.gasCostScaler,
      gasCostScalerDp: args.gasCostScalerDp,
      gasFeeReceiver: args.gasFeeReceiver,
    };

    const ix = getInitializeInstruction(
      {
        // Accounts
        upgradeAuthority: payer,
        payer,
        cfg: cfgAddress,
        programData: programDataAddress,
        program: args.programId,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,

        // Arguments
        guardian: guardianAddress,
        eip1559Config,
        gasConfig,
      },
      { programAddress: args.programId }
    );

    logger.info("Sending transaction...");
    const signature = await buildAndSendTransaction(
      { type: "rpc-url", value: args.rpcUrl },
      [ix],
      payer
    );
    logger.success("Base Relayer initialization completed!");
    logger.success(`Signature: ${signature}`);

    await assertInitialized(
      createSolanaRpc(args.rpcUrl),
      cfgAddress,
      guardianAddress,
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
  cfg: SolanaAddress,
  guardianAddress: SolanaAddress,
  eip1559Config: Eip1559Config,
  gasConfig: GasConfig
) {
  logger.info("Confirming base-relayer configuration...");
  const cfgData = await fetchCfg(rpc, cfg);

  if (cfgData.data.guardian !== guardianAddress) {
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

  console.log("Base Relayer config confirmed!");
}

function resolveGuardianAddress(
  guardianArg: GuardianArg,
  payer: Awaited<ReturnType<typeof resolvePayerKeypair>>
): SolanaAddress {
  if (guardianArg === "payer") {
    logger.info("Using payer address as guardian");
    return payer.address;
  }

  logger.info(`Using custom guardian address: ${guardianArg}`);
  return guardianArg;
}
