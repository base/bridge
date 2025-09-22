import { z } from "zod";
import {
  createSignerFromKeyPair,
  generateKeyPair,
  getProgramDerivedAddress,
  getU8Codec,
  createSolanaRpc,
  devnet,
  type Instruction,
} from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { keccak256, toBytes } from "viem";

import {
  fetchBridge,
  getWrapTokenInstruction,
  type WrapTokenInstructionDataArgs,
} from "../../../../../../../clients/ts/src/bridge";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  getIdlConstant,
  CONSTANTS,
  relayMessageToBase,
  monitorMessageExecution,
} from "@internal/sol";
import { buildPayForRelayInstruction } from "@internal/sol/base-relayer";

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
    z.literal("constant"),
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

type WrapTokenArgs = z.infer<typeof argsSchema>;
type PayerKp = z.infer<typeof argsSchema.shape.payerKp>;

export async function handleWrapToken(args: WrapTokenArgs): Promise<void> {
  try {
    logger.info("--- Wrap token script ---");

    // Get config for cluster and release
    const config = CONSTANTS[args.cluster][args.release];

    const rpcUrl = devnet(`https://${config.rpcUrl}`);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    // Resolve payer keypair
    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    // Resolve remote token address
    const remoteToken =
      args.remoteToken === "constant" ? config.erc20 : args.remoteToken;
    logger.info(`Remote token: ${remoteToken}`);

    // Instruction arguments
    const instructionArgs: WrapTokenInstructionDataArgs = {
      decimals: args.decimals,
      name: args.name,
      symbol: args.symbol,
      remoteToken: toBytes(remoteToken),
      scalerExponent: args.scalerExponent,
    };

    // Calculate metadata hash
    const metadataHash = keccak256(
      Buffer.concat([
        Buffer.from(instructionArgs.name),
        Buffer.from(instructionArgs.symbol),
        Buffer.from(instructionArgs.remoteToken),
        Buffer.from(getU8Codec().encode(instructionArgs.scalerExponent)),
      ])
    );

    // Derive mint address
    const [mintAddress] = await getProgramDerivedAddress({
      programAddress: config.solanaBridge,
      seeds: [
        Buffer.from(getIdlConstant("WRAPPED_TOKEN_SEED")),
        Buffer.from([instructionArgs.decimals]),
        toBytes(metadataHash),
      ],
    });
    logger.info(`Mint: ${mintAddress}`);

    // Derive bridge account address
    const [bridgeAddress] = await getProgramDerivedAddress({
      programAddress: config.solanaBridge,
      seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
    });
    logger.info(`Bridge account: ${bridgeAddress}`);

    // Fetch bridge state
    const bridge = await fetchBridge(rpc, bridgeAddress);

    // Generate outgoing message keypair
    const outgoingMessageKeypair = await generateKeyPair();
    const outgoingMessageKeypairSigner = await createSignerFromKeyPair(
      outgoingMessageKeypair
    );
    logger.info(`Outgoing message: ${outgoingMessageKeypairSigner.address}`);

    // Build wrap token instruction
    const ixs: Instruction[] = [
      getWrapTokenInstruction(
        {
          // Accounts
          payer,
          gasFeeReceiver: bridge.data.gasConfig.gasFeeReceiver,
          mint: mintAddress,
          bridge: bridgeAddress,
          outgoingMessage: outgoingMessageKeypairSigner,
          tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
          systemProgram: SYSTEM_PROGRAM_ADDRESS,

          // Arguments
          ...instructionArgs,
        },
        { programAddress: config.solanaBridge }
      ),
    ];

    if (args.payForRelay) {
      ixs.push(
        await buildPayForRelayInstruction(
          args.cluster,
          args.release,
          outgoingMessageKeypairSigner.address,
          payer
        )
      );
    }

    logger.info("Sending transaction...");
    const signature = await buildAndSendTransaction(rpcUrl, ixs, payer);
    logger.success("Token wrap completed!");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );

    if (args.payForRelay) {
      await monitorMessageExecution(
        args.cluster,
        args.release,
        outgoingMessageKeypairSigner.address
      );
    } else {
      await relayMessageToBase(
        args.cluster,
        args.release,
        outgoingMessageKeypairSigner.address
      );
    }
  } catch (error) {
    logger.error("Token wrap failed:", error);
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
