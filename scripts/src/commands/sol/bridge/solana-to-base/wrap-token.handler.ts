import { z } from "zod";
import {
  getProgramDerivedAddress,
  getU8Codec,
  createSolanaRpc,
  devnet,
  type Instruction,
  getU64Encoder,
  Endian,
} from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { keccak256, toBytes } from "viem";

import {
  fetchBridge,
  getWrapTokenInstruction,
  type WrapTokenInstructionDataArgs,
} from "@base/bridge/bridge";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  getIdlConstant,
  buildPayForRelayInstruction,
  outgoingMessagePubkey,
  relayMessageToBase,
  monitorMessageExecution,
} from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS, ETH } from "@internal/constants";

export const argsSchema = z.object({
  deployEnv: z
    .enum(DEPLOY_ENVS, {
      message:
        "Deploy environment must be either 'testnet-alpha' or 'testnet-prod'",
    })
    .default("testnet-alpha"),
  decimals: z
    .string()
    .transform((val) => parseInt(val))
    .refine((val) => !isNaN(val) && val >= 0, {
      message: "Decimals must be a positive number",
    })
    .default(6),
  name: z
    .string()
    .nonempty("Token name cannot be empty")
    .default("Wrapped ERC20"),
  symbol: z.string().nonempty("Token symbol cannot be empty").default("wERC20"),
  remoteToken: z.union([
    z.literal("constant-erc20"),
    z.literal("constant-eth"),
    z
      .string()
      .startsWith("0x", "Address must start with 0x")
      .brand<"remoteToken">(),
  ]),
  scalerExponent: z
    .string()
    .transform((val) => parseInt(val))
    .refine((val) => !isNaN(val) && val >= 0, {
      message: "Scaler exponent must be a positive number",
    })
    .default(9),
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
  payForRelay: z.boolean().default(true),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

export async function handleWrapToken(args: Args): Promise<void> {
  try {
    logger.info("--- Wrap token script ---");

    const config = CONFIGS[args.deployEnv];
    const rpcUrl = devnet(config.solana.rpcUrl);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    const remoteToken =
      args.remoteToken === "constant-erc20"
        ? config.base.erc20
        : args.remoteToken === "constant-eth"
          ? ETH
          : args.remoteToken;
    logger.info(`Remote token: ${remoteToken}`);

    const { salt, pubkey: outgoingMessage } = await outgoingMessagePubkey(
      config.solana.bridgeProgram
    );
    logger.info(`Outgoing message: ${outgoingMessage}`);

    // Instruction arguments
    const instructionArgs: WrapTokenInstructionDataArgs = {
      outgoingMessageSalt: salt,
      decimals: args.decimals,
      name: args.name,
      symbol: args.symbol,
      remoteToken: toBytes(remoteToken),
      scalerExponent: args.scalerExponent,
    };

    const nameLengthLeBytes = getU64Encoder({ endian: Endian.Little }).encode(
      instructionArgs.name.length
    );

    const symbolLengthLeBytes = getU64Encoder({ endian: Endian.Little }).encode(
      instructionArgs.symbol.length
    );

    // Calculate metadata hash
    const metadataHash = keccak256(
      Buffer.concat([
        Buffer.from(nameLengthLeBytes),
        Buffer.from(instructionArgs.name),
        Buffer.from(symbolLengthLeBytes),
        Buffer.from(instructionArgs.symbol),
        Buffer.from(instructionArgs.remoteToken),
        Buffer.from(getU8Codec().encode(instructionArgs.scalerExponent)),
      ])
    );

    const [mintAddress] = await getProgramDerivedAddress({
      programAddress: config.solana.bridgeProgram,
      seeds: [
        Buffer.from(getIdlConstant("WRAPPED_TOKEN_SEED")),
        Buffer.from([instructionArgs.decimals]),
        toBytes(metadataHash),
      ],
    });
    logger.info(`Mint: ${mintAddress}`);

    const [bridgeAddress] = await getProgramDerivedAddress({
      programAddress: config.solana.bridgeProgram,
      seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
    });
    logger.info(`Bridge account: ${bridgeAddress}`);

    // Fetch bridge state
    const bridge = await fetchBridge(rpc, bridgeAddress);

    // Build wrap token instruction
    const ixs: Instruction[] = [
      getWrapTokenInstruction(
        {
          // Accounts
          payer,
          gasFeeReceiver: bridge.data.gasConfig.gasFeeReceiver,
          mint: mintAddress,
          bridge: bridgeAddress,
          outgoingMessage,
          tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
          systemProgram: SYSTEM_PROGRAM_ADDRESS,

          // Arguments
          ...instructionArgs,
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
    logger.success("Token wrap completed!");
    logger.success(`Signature: ${signature}`);

    if (args.payForRelay) {
      await monitorMessageExecution(args.deployEnv, outgoingMessage);
    } else {
      await relayMessageToBase(args.deployEnv, outgoingMessage);
    }
  } catch (error) {
    logger.error("Token wrap failed:", error);
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
