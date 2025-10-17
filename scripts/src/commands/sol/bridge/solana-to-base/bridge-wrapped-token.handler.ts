import { z } from "zod";
import {
  getProgramDerivedAddress,
  devnet,
  address,
  createSolanaRpc,
  type Account,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchMaybeToken,
  fetchMaybeMint,
  type Mint,
} from "@solana-program/token";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { toBytes, isAddress as isEvmAddress } from "viem";

import {
  fetchBridge,
  getBridgeWrappedTokenInstruction,
} from "@base/bridge/bridge";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  getIdlConstant,
  type Rpc,
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
        "Deploy environment must be either 'testnet-alpha' or 'testnet-prod'",
    })
    .default("testnet-alpha"),
  mint: z.union([
    z.literal("constants-wErc20"),
    z.literal("constants-wEth"),
    z.string().brand<"solanaAddress">(),
  ]),
  fromTokenAccount: z.union([
    z.literal("payer"),
    z.literal("config"),
    z.string().brand<"solanaAddress">(),
  ]),
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
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
  payForRelay: z.boolean().default(true),
});

type Args = z.infer<typeof argsSchema>;
type FromTokenAccountArg = Args["fromTokenAccount"];
type PayerKpArg = Args["payerKp"];

export async function handleBridgeWrappedToken(args: Args): Promise<void> {
  try {
    logger.info("--- Bridge Wrapped Token script ---");

    const config = CONFIGS[args.deployEnv];
    const rpcUrl = devnet(config.solana.rpcUrl);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    const mintAddress =
      args.mint === "constants-wErc20"
        ? config.solana.wErc20
        : args.mint === "constants-wEth"
          ? config.solana.wEth
          : address(args.mint);
    logger.info(`Mint: ${mintAddress}`);

    const maybeMint = await fetchMaybeMint(rpc, mintAddress);
    if (!maybeMint.exists) {
      throw new Error("Mint not found");
    }

    const [bridgeAccountAddress] = await getProgramDerivedAddress({
      programAddress: config.solana.bridgeProgram,
      seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
    });
    logger.info(`Bridge account: ${bridgeAccountAddress}`);

    // Calculate scaled amount (amount * 10^decimals)
    const scaledAmount = BigInt(
      Math.floor(args.amount * Math.pow(10, maybeMint.data.decimals))
    );
    logger.info(`Amount: ${args.amount}`);
    logger.info(`Decimals: ${maybeMint.data.decimals}`);
    logger.info(`Scaled amount: ${scaledAmount}`);

    const { salt, pubkey: outgoingMessage } = await outgoingMessagePubkey(
      config.solana.bridgeProgram
    );
    logger.info(`Outgoing message: ${outgoingMessage}`);

    // Fetch bridge state
    const bridge = await fetchBridge(rpc, bridgeAccountAddress);

    // Resolve from token account
    const fromTokenAccountAddress = await resolveFromTokenAccount(
      args.fromTokenAccount,
      rpc,
      payer.address,
      maybeMint
    );
    logger.info(`From Token Account: ${fromTokenAccountAddress}`);

    const tokenProgram = maybeMint.programAddress;
    logger.info(`Token Program: ${tokenProgram}`);

    const ixs: Instruction[] = [
      getBridgeWrappedTokenInstruction(
        {
          // Accounts
          payer,
          from: payer,
          gasFeeReceiver: bridge.data.gasConfig.gasFeeReceiver,
          mint: mintAddress,
          fromTokenAccount: fromTokenAccountAddress,
          bridge: bridgeAccountAddress,
          outgoingMessage,
          tokenProgram,
          systemProgram: SYSTEM_PROGRAM_ADDRESS,

          // Arguments
          outgoingMessageSalt: salt,
          to: toBytes(args.to),
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
    const signature = await buildAndSendTransaction(
      { type: "deploy-env", value: args.deployEnv },
      ixs,
      payer
    );
    logger.success("Bridge Wrapped Token operation completed!");
    logger.success(`Signature: ${signature}`);

    if (args.payForRelay) {
      await monitorMessageExecution(args.deployEnv, outgoingMessage);
    } else {
      await relayMessageToBase(args.deployEnv, outgoingMessage);
    }
  } catch (error) {
    logger.error("Bridge Wrapped Token operation failed:", error);
    throw error;
  }
}

async function resolveFromTokenAccount(
  fromTokenAccountArg: FromTokenAccountArg,
  rpc: Rpc,
  payerAddress: Address,
  mint: Account<Mint>
) {
  if (fromTokenAccountArg !== "payer" && fromTokenAccountArg !== "config") {
    const customAddress = address(fromTokenAccountArg);
    const maybeToken = await fetchMaybeToken(rpc, customAddress);
    if (!maybeToken.exists) {
      throw new Error("Token account does not exist");
    }

    return maybeToken.address;
  }

  const owner =
    fromTokenAccountArg === "payer"
      ? payerAddress
      : (await getSolanaCliConfigKeypairSigner()).address;

  const [ataAddress] = await findAssociatedTokenPda(
    {
      owner,
      tokenProgram: mint.programAddress,
      mint: mint.address,
    },
    {
      programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    }
  );

  const maybeAta = await fetchMaybeToken(rpc, ataAddress);
  if (!maybeAta.exists) {
    throw new Error("ATA does not exist");
  }

  return maybeAta.address;
}

async function resolvePayerKeypair(payerKpArg: PayerKpArg) {
  if (payerKpArg === "config") {
    logger.info("Using Solana CLI config for payer keypair");
    return await getSolanaCliConfigKeypairSigner();
  }

  logger.info(`Using custom payer keypair: ${payerKpArg}`);
  return await getKeypairSignerFromPath(payerKpArg);
}
