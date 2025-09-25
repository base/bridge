import { z } from "zod";
import {
  getProgramDerivedAddress,
  devnet,
  type Instruction,
  createSolanaRpc,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { toBytes } from "viem";

import {
  fetchBridge,
  getBridgeSolInstruction,
} from "../../../../../../../clients/ts/src/bridge";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  getIdlConstant,
  relayMessageToBase,
  monitorMessageExecution,
  buildPayForRelayInstruction,
  outgoingMessagePubkey,
} from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS } from "@internal/constants";

export const argsSchema = z.object({
  deployEnv: z
    .enum(DEPLOY_ENVS, {
      message:
        "Deploy environment must be either 'development-alpha' or 'development-prod'",
    })
    .default("development-alpha"),
  to: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, {
      message: "Invalid Base/Ethereum address format",
    })
    .brand<"baseAddress">(),
  amount: z
    .string()
    .transform((val) => parseFloat(val))
    .refine((val) => !isNaN(val) && val > 0, {
      message: "Amount must be a positive number",
    }),
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
  payForRelay: z.boolean().default(true),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

export async function handleBridgeSol(args: Args): Promise<void> {
  try {
    logger.info("--- Bridge SOL script ---");

    const config = CONFIGS[args.deployEnv];
    const rpcUrl = devnet(`https://${config.solana.rpcUrl}`);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    const [bridgeAccountAddress] = await getProgramDerivedAddress({
      programAddress: config.solana.bridgeProgram,
      seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
    });
    logger.info(`Bridge account: ${bridgeAccountAddress}`);

    const bridge = await fetchBridge(rpc, bridgeAccountAddress);

    const remoteToken = toBytes(config.base.wSol);
    const [solVaultAddress] = await getProgramDerivedAddress({
      programAddress: config.solana.bridgeProgram,
      seeds: [
        Buffer.from(getIdlConstant("SOL_VAULT_SEED")),
        Buffer.from(remoteToken),
      ],
    });
    logger.info(`Sol Vault: ${solVaultAddress}`);

    // Calculate scaled amount (amount * 10^decimals)
    const scaledAmount = BigInt(Math.floor(args.amount * Math.pow(10, 9)));
    logger.info(`Amount: ${args.amount}`);
    logger.info(`Scaled amount: ${scaledAmount}`);

    const { salt, pubkey: outgoingMessage } = await outgoingMessagePubkey(
      config.solana.bridgeProgram
    );
    logger.info(`Outgoing message: ${outgoingMessage}`);

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
          to: toBytes(args.to),
          remoteToken,
          amount: scaledAmount,
          call: null,
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
    const signature = await buildAndSendTransaction(args.deployEnv, ixs, payer);
    logger.success("Bridge SOL operation completed!");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );

    if (args.payForRelay) {
      await monitorMessageExecution(args.deployEnv, outgoingMessage);
    } else {
      await relayMessageToBase(args.deployEnv, outgoingMessage);
    }
  } catch (error) {
    logger.error("Bridge SOL operation failed:", error);
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
