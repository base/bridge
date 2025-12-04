import { z } from "zod";
import {
  getProgramDerivedAddress,
  type Instruction,
  createSolanaRpc,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import {
  toBytes,
  isAddress as isEvmAddress,
  encodeAbiParameters,
  encodeFunctionData,
} from "viem";

import {
  CallType,
  fetchBridge,
  getBridgeSolInstruction,
} from "@base/bridge/bridge";

import { logger } from "@internal/logger";
import { FLYWHEEL_ABI } from "@internal/base/abi";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  getIdlConstant,
  relayMessageToBase,
  monitorMessageExecution,
  buildPayForRelayInstruction,
  outgoingMessagePubkey,
  solVaultPubkey,
} from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS } from "@internal/constants";

export const argsSchema = z.object({
  deployEnv: z
    .enum(DEPLOY_ENVS, {
      message:
        "Deploy environment must be 'testnet-alpha', 'testnet-prod', or 'mainnet'",
    })
    .default("testnet-prod"),
  to: z
    .string()
    .refine((value) => isEvmAddress(value), {
      message: "Invalid Base/Ethereum address format",
    })
    .brand<"baseAddress">(),
  amount: z
    .string()
    .transform((val) => parseFloat(val))
    .refine((val) => !isNaN(val) && val > 0, {
      message: "Amount must be a positive number",
    }),
  builderCode: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, {
      message:
        "Builder code must be a valid bytes32 (0x followed by 64 hex characters)",
    })
    .brand<"builderCode">(),
  feeBps: z
    .string()
    .transform((val) => parseInt(val))
    .refine((val) => !isNaN(val) && val >= 0 && val <= 10000, {
      message: "Fee BPS must be a number between 0 and 10000",
    }),
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
  payForRelay: z.boolean().default(true),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

export async function handleBridgeSolWithBc(args: Args): Promise<void> {
  try {
    logger.info("--- Bridge SOL with Builder Code script ---");

    const config = CONFIGS[args.deployEnv];
    const rpc = createSolanaRpc(config.solana.rpcUrl);
    logger.info(`RPC URL: ${config.solana.rpcUrl}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    const [bridgeAccountAddress] = await getProgramDerivedAddress({
      programAddress: config.solana.bridgeProgram,
      seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
    });
    logger.info(`Bridge account: ${bridgeAccountAddress}`);

    const bridge = await fetchBridge(rpc, bridgeAccountAddress);

    const solVaultAddress = await solVaultPubkey(config.solana.bridgeProgram);
    logger.info(`Sol Vault: ${solVaultAddress}`);

    // Calculate scaled amount (amount * 10^decimals)
    const scaledAmount = BigInt(Math.floor(args.amount * Math.pow(10, 9)));
    logger.info(`Amount: ${args.amount}`);
    logger.info(`Scaled amount: ${scaledAmount}`);

    const { salt, pubkey: outgoingMessage } = await outgoingMessagePubkey(
      config.solana.bridgeProgram
    );
    logger.info(`Outgoing message: ${outgoingMessage}`);

    // Builder Code logic
    logger.info(`User address (for hookData): ${args.to}`);
    logger.info(`Builder code: ${args.builderCode}`);
    logger.info(`Fee BPS: ${args.feeBps}`);

    // 1. Build hookData = abi.encode(user, code, feeBps)
    const hookData = encodeAbiParameters(
      [
        { type: "address", name: "user" },
        { type: "bytes32", name: "code" },
        { type: "uint16", name: "feeBps" },
      ],
      [args.to as `0x${string}`, args.builderCode as `0x${string}`, args.feeBps]
    );
    logger.info(`Hook data: ${hookData}`);

    // 2. Build call data for Flywheel.send(campaign, token, hookData)
    const wSolAddress = config.base.wSol;
    logger.info(`wSOL address: ${wSolAddress}`);
    logger.info(`Flywheel address: ${config.base.flywheelContract}`);
    logger.info(`Bridge campaign address: ${config.base.flywheelCampaign}`);

    const flywheelCallData = encodeFunctionData({
      abi: FLYWHEEL_ABI,
      functionName: "send",
      args: [config.base.flywheelCampaign, wSolAddress, hookData],
    });
    logger.info(`Flywheel call data: ${flywheelCallData}`);

    // 3. Build the bridge instruction with call to Flywheel
    const ixs: Instruction[] = [
      getBridgeSolInstruction(
        {
          // Accounts
          payer,
          from: payer,
          gasFeeReceiver: bridge.data.gasConfig.gasFeeReceiver,
          solVault: solVaultAddress,
          bridge: bridgeAccountAddress,
          outgoingMessage,
          systemProgram: SYSTEM_PROGRAM_ADDRESS,

          // Arguments
          outgoingMessageSalt: salt,
          to: toBytes(config.base.flywheelCampaign), // Send to campaign, not user
          amount: scaledAmount,
          call: {
            ty: CallType.Call,
            to: toBytes(config.base.flywheelContract),
            value: 0n,
            data: Buffer.from(flywheelCallData.slice(2), "hex"),
          },
        },
        { programAddress: config.solana.bridgeProgram }
      ),
    ];

    if (args.payForRelay) {
      ixs.push(
        await buildPayForRelayInstruction(
          args.deployEnv,
          outgoingMessage,
          payer
        )
      );
    }

    logger.info("Sending transaction...");
    const signature = await buildAndSendTransaction(
      { type: "deploy-env", value: args.deployEnv },
      ixs,
      payer
    );
    logger.success("Bridge SOL with Builder Code operation completed!");
    logger.success(`Signature: ${signature}`);

    if (args.payForRelay) {
      await monitorMessageExecution(args.deployEnv, outgoingMessage);
    } else {
      await relayMessageToBase(args.deployEnv, outgoingMessage);
    }
  } catch (error) {
    logger.error("Bridge SOL with Builder Code operation failed:", error);
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
