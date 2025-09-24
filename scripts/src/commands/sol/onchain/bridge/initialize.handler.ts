import { z } from "zod";
import {
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
  devnet,
  type Address,
  type KeyPairSigner,
  createSolanaRpc,
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
} from "../../../../../../clients/ts/src/bridge";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  getIdlConstant,
  CONSTANTS,
} from "@internal/sol";

export const argsSchema = z.object({
  cluster: z
    .enum(["devnet"], {
      message: "Cluster must be either 'devnet'",
    })
    .default("devnet"),
  release: z
    .enum(["alpha", "prod"], {
      message: "Release must be either 'alpha' or 'prod'",
    })
    .default("prod"),
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
});

type InitializeArgs = z.infer<typeof argsSchema>;
type PayerKp = z.infer<typeof argsSchema.shape.payerKp>;

export async function handleInitialize(args: InitializeArgs): Promise<void> {
  try {
    logger.info("--- Initialize bridge script ---");

    // Get config for cluster and release
    const config = CONSTANTS[args.cluster][args.release];

    const rpcUrl = devnet(`https://${config.rpcUrl}`);
    logger.info(`RPC URL: ${rpcUrl}`);

    // Resolve payer keypair
    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    // Derive bridge account address
    const [bridgeAccountAddress] = await getProgramDerivedAddress({
      programAddress: config.solanaBridge,
      seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
    });
    logger.info(`Bridge account address: ${bridgeAccountAddress}`);

    // Generate guardian keypair
    // TODO: Use the real guardian.
    const guardian = await createSignerFromKeyPair(await generateKeyPair());
    const eip1559Config = {
      target: 5_000_000n,
      denominator: 2n,
      windowDurationSeconds: 1n,
      minimumBaseFee: 1n,
    };
    const gasConfig = {
      gasPerCall: 125_000n,
      gasCostScaler: 1_000_000n,
      gasCostScalerDp: 1_000_000n,
      gasFeeReceiver: payer.address,
    };
    const protocolConfig = {
      blockIntervalRequirement: 300n,
    };
    const bufferConfig = {
      maxCallBufferSize: 8n * 1024n,
    };
    const baseOracleConfig = {
      threshold: 2,
      signerCount: 2,
      signers: [
        toBytes(config.solanaEvmLocalKey),
        toBytes(config.solanaEvmKeychainKey),
        ...Array.from(
          { length: 14 },
          () => new Uint8Array(toBytes(config.solanaEvmLocalKey).length)
        ),
      ],
    };
    const partnerOracleConfig = {
      requiredThreshold: 3,
    };

    // Build initialize instruction
    const ix = getInitializeInstruction(
      {
        payer: payer,
        bridge: bridgeAccountAddress,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
        guardian,
        eip1559Config,
        gasConfig,
        protocolConfig,
        bufferConfig,
        baseOracleConfig,
        partnerOracleConfig,
      },
      { programAddress: config.solanaBridge }
    );

    // Send transaction
    logger.info("Sending transaction...");
    const signature = await buildAndSendTransaction(rpcUrl, [ix], payer);
    logger.success("Bridge initialization completed!");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );

    await assertInitialized(
      rpcUrl,
      bridgeAccountAddress,
      guardian,
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

async function resolvePayerKeypair(payerKp: PayerKp) {
  if (payerKp === "config") {
    logger.info("Using Solana CLI config for payer keypair");
    return await getSolanaCliConfigKeypairSigner();
  }

  logger.info(`Using custom payer keypair: ${payerKp}`);
  return await getKeypairSignerFromPath(payerKp);
}

async function assertInitialized(
  rpcUrl: string,
  bridgeAccountAddress: Address,
  guardian: KeyPairSigner,
  eip1559Config: Eip1559Config,
  gasConfig: GasConfig,
  protocolConfig: ProtocolConfig,
  bufferConfig: BufferConfig,
  baseOracleConfig: BaseOracleConfig,
  partnerOracleConfig: PartnerOracleConfig
) {
  const rpc = createSolanaRpc(rpcUrl);

  console.log("Confirming bridge configuration...");
  const bridgeData = await fetchBridge(rpc, bridgeAccountAddress);

  // EIP1559 confirmation
  if (bridgeData.data.guardian !== guardian.address) {
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
