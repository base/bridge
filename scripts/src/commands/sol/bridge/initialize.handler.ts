import { z } from "zod";
import {
  getProgramDerivedAddress,
  devnet,
  type Address as SolanaAddress,
  createSolanaRpc,
  address as solanaAddress,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { toBytes, toHex } from "viem";

import {
  fetchBridge,
  getInitializeInstruction,
  type BaseOracleConfig,
  type BufferConfig,
  type Eip1559Config,
  type GasConfig,
  type PartnerOracleConfig,
  type ProtocolConfig,
} from "@base/bridge/bridge";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  getIdlConstant,
  getProgramDataAddress,
} from "@internal/sol";
import {
  bigintSchema,
  integerSchema,
  solanaAddressSchema,
  evmAddressSchema,
} from "@internal/utils/cli";

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
  gasPerCall: bigintSchema,
  gasCostScaler: bigintSchema,
  gasCostScalerDp: bigintSchema,
  gasFeeReceiver: solanaAddressSchema.transform((value) =>
    solanaAddress(value)
  ),
});

const protocolFlatSchema = z.object({
  protocolBlockIntervalRequirement: bigintSchema,
});

const bufferFlatSchema = z.object({
  bufferMaxCallBufferSize: bigintSchema,
});

const baseOracleFlatSchema = z.object({
  baseOracleThreshold: integerSchema(0),
  baseOracleSignerCount: integerSchema(0),
  baseOracleSigners: z
    .string()
    .transform((value) =>
      value
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
    .pipe(
      z
        .array(evmAddressSchema)
        .nonempty({ message: "At least one base oracle signer is required" })
    ),
});

const partnerOracleFlatSchema = z.object({
  partnerOracleRequiredThreshold: integerSchema(1),
});

export const argsSchema = baseArgsSchema
  .extend(eip1559FlatSchema.shape)
  .extend(gasFlatSchema.shape)
  .extend(protocolFlatSchema.shape)
  .extend(bufferFlatSchema.shape)
  .extend(baseOracleFlatSchema.shape)
  .extend(partnerOracleFlatSchema.shape);

export type InitializeArgs = z.infer<typeof argsSchema>;
type PayerKpArg = InitializeArgs["payerKp"];
type GuardianArg = InitializeArgs["guardian"];

export async function handleInitialize(args: InitializeArgs): Promise<void> {
  try {
    logger.info("--- Initialize bridge script ---");

    const rpcUrl = devnet(args.rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);
    logger.info(`Program ID: ${args.programId}`);

    // Resolve payer keypair
    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    const [bridgeAccountAddress] = await getProgramDerivedAddress({
      programAddress: args.programId,
      seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
    });
    logger.info(`Bridge account address: ${bridgeAccountAddress}`);

    const programDataAddress = await getProgramDataAddress(args.programId);
    logger.info(`Program data address: ${programDataAddress}`);

    const guardianAddress = resolveGuardianAddress(args.guardian, payer);

    const eip1559Config: Eip1559Config = {
      target: args.eip1559Target,
      denominator: args.eip1559Denominator,
      windowDurationSeconds: args.eip1559WindowDurationSeconds,
      minimumBaseFee: args.eip1559MinimumBaseFee,
    };

    const gasConfig: GasConfig = {
      gasPerCall: args.gasPerCall,
      gasCostScaler: args.gasCostScaler,
      gasCostScalerDp: args.gasCostScalerDp,
      gasFeeReceiver: args.gasFeeReceiver,
    };

    const protocolConfig: ProtocolConfig = {
      blockIntervalRequirement: args.protocolBlockIntervalRequirement,
    };

    const bufferConfig: BufferConfig = {
      maxCallBufferSize: args.bufferMaxCallBufferSize,
    };

    const baseOracleSigners = args.baseOracleSigners.map((signer) =>
      toBytes(signer)
    );

    if (baseOracleSigners.length !== args.baseOracleSignerCount) {
      throw new Error(
        "Base oracle signer count does not match provided signer array length"
      );
    }

    const maxSignerCount = getIdlConstant("MAX_SIGNER_COUNT");
    if (baseOracleSigners.length > maxSignerCount) {
      throw new Error(
        "Base oracle signer count cannot be greater than max signer count"
      );
    }

    const baseOracleConfig: BaseOracleConfig = {
      threshold: args.baseOracleThreshold,
      signerCount: args.baseOracleSignerCount,
      signers: [
        ...baseOracleSigners,
        ...Array(maxSignerCount - baseOracleSigners.length).fill(
          new Uint8Array(20)
        ),
      ],
    };

    const partnerOracleConfig: PartnerOracleConfig = {
      requiredThreshold: args.partnerOracleRequiredThreshold,
    };

    const ix = getInitializeInstruction(
      {
        // Accounts
        upgradeAuthority: payer,
        payer,
        bridge: bridgeAccountAddress,
        programData: programDataAddress,
        program: args.programId,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,

        // Arguments
        guardian: guardianAddress,
        eip1559Config,
        gasConfig,
        protocolConfig,
        bufferConfig,
        baseOracleConfig,
        partnerOracleConfig,
      },
      { programAddress: args.programId }
    );

    // Send transaction
    logger.info("Sending transaction...");
    const signature = await buildAndSendTransaction(
      { type: "rpc-url", value: args.rpcUrl },
      [ix],
      payer
    );
    logger.success("Bridge initialization completed!");
    logger.success(`Signature: ${signature}`);

    await assertInitialized(
      createSolanaRpc(rpcUrl),
      bridgeAccountAddress,
      guardianAddress,
      eip1559Config,
      gasConfig,
      protocolConfig,
      bufferConfig,
      baseOracleConfig,
      partnerOracleConfig
    );
  } catch (error) {
    logger.error("Bridge initialization failed:", error);
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
  bridgeAccountAddress: SolanaAddress,
  guardian: SolanaAddress,
  eip1559Config: Eip1559Config,
  gasConfig: GasConfig,
  protocolConfig: ProtocolConfig,
  bufferConfig: BufferConfig,
  baseOracleConfig: BaseOracleConfig,
  partnerOracleConfig: PartnerOracleConfig
) {
  console.log("Confirming bridge configuration...");
  const bridgeData = await fetchBridge(rpc, bridgeAccountAddress);

  if (bridgeData.data.guardian !== guardian) {
    throw new Error("Guardian mismatch!");
  }
  if (bridgeData.data.eip1559.config.target !== eip1559Config.target) {
    throw new Error("EIP-1559 target mismatch!");
  }
  if (
    bridgeData.data.eip1559.config.denominator !== eip1559Config.denominator
  ) {
    throw new Error("EIP-1559 denominator mismatch!");
  }
  if (
    bridgeData.data.eip1559.config.windowDurationSeconds !==
    eip1559Config.windowDurationSeconds
  ) {
    throw new Error("EIP-1559 windowDurationSeconds mismatch!");
  }
  if (
    bridgeData.data.eip1559.config.minimumBaseFee !==
    eip1559Config.minimumBaseFee
  ) {
    throw new Error("EIP-1559 minimumBaseFee mismatch!");
  }

  // Gas config confirmation
  if (bridgeData.data.gasConfig.gasPerCall !== gasConfig.gasPerCall) {
    throw new Error("Gas config gasPerCall mismatch!");
  }
  if (bridgeData.data.gasConfig.gasCostScaler !== gasConfig.gasCostScaler) {
    throw new Error("Gas config gasCostScaler mismatch!");
  }
  if (bridgeData.data.gasConfig.gasCostScalerDp !== gasConfig.gasCostScalerDp) {
    throw new Error("Gas config gasCostScalerDp mismatch!");
  }
  if (bridgeData.data.gasConfig.gasFeeReceiver !== gasConfig.gasFeeReceiver) {
    throw new Error("Gas config gasFeeReceiver mismatch!");
  }

  // Protocol config confirmation
  if (
    bridgeData.data.protocolConfig.blockIntervalRequirement !==
    protocolConfig.blockIntervalRequirement
  ) {
    throw new Error("Protocol config blockIntervalRequirement mismatch!");
  }

  // Buffer config confirmation
  if (
    bridgeData.data.bufferConfig.maxCallBufferSize !==
    bufferConfig.maxCallBufferSize
  ) {
    throw new Error("Buffer config maxCallBufferSize mismatch!");
  }

  // Base Oracle config confirmation
  if (
    bridgeData.data.baseOracleConfig.threshold !== baseOracleConfig.threshold
  ) {
    throw new Error("Base oracle config threshold mismatch!");
  }
  if (
    bridgeData.data.baseOracleConfig.signerCount !==
    baseOracleConfig.signerCount
  ) {
    throw new Error("Base oracle config signerCount mismatch!");
  }
  if (
    bridgeData.data.baseOracleConfig.signers.length !==
    baseOracleConfig.signers.length
  ) {
    throw new Error("Base oracle config signer array length mismatch!");
  }
  for (let i = 0; i < baseOracleConfig.signers.length; i++) {
    const onchain = bridgeData.data.baseOracleConfig.signers[i];
    const expected = baseOracleConfig.signers[i];
    if (onchain === undefined || expected === undefined) {
      throw new Error(`Base oracle config signer missing! Index: ${i}`);
    }
    if (toHex(new Uint8Array(onchain)) !== toHex(new Uint8Array(expected))) {
      throw new Error(`Base oracle config signer mismatch! Index: ${i}`);
    }
  }

  // Partner oracle config confirmation
  if (
    bridgeData.data.partnerOracleConfig.requiredThreshold !==
    partnerOracleConfig.requiredThreshold
  ) {
    throw new Error("Partner oracle config threshold mismatch!");
  }

  console.log("Bridge config confirmed!");
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
