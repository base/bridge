import { z } from "zod";
import {
  createSignerFromKeyPair,
  generateKeyPair,
  getBase58Encoder,
  getProgramDerivedAddress,
  devnet,
  address,
  createSolanaRpc,
  type Account,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchMaybeToken,
  fetchMaybeMint,
  type Mint,
} from "@solana-program/token";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { toBytes } from "viem";

import {
  fetchBridge,
  getBridgeSplInstruction,
} from "../../../../../../../clients/ts/src/bridge";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  getIdlConstant,
  CONSTANTS,
  type Rpc,
  relayMessageToBase,
  monitorMessageExecution,
} from "@internal/sol";
import { buildPayForRelayInstruction } from "@internal/sol/base-relayer";
import { outgoingMessagePubkey } from "@internal/sol/bridge";

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
  mint: z.union([z.literal("constant"), z.string().brand<"solanaAddress">()]),
  remoteToken: z.union([
    z.literal("constant"),
    z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid ERC20 address format")
      .brand<"remoteToken">(),
  ]),
  fromTokenAccount: z.union([
    z.literal("payer"),
    z.literal("config"),
    z.string().brand<"solanaAddress">(),
  ]),
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

type BridgeSplArgs = z.infer<typeof argsSchema>;
type FromTokenAccount = BridgeSplArgs["fromTokenAccount"];
type PayerKp = BridgeSplArgs["payerKp"];

export async function handleBridgeSpl(args: BridgeSplArgs): Promise<void> {
  try {
    logger.info("--- Bridge SPL script ---");

    const config = CONSTANTS[args.cluster][args.release];
    const rpcUrl = devnet(`https://${config.rpcUrl}`);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    // Resolve payer keypair
    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    // Resolve mint address
    const mintAddress =
      args.mint === "constant" ? config.spl : address(args.mint);
    logger.info(`Mint: ${mintAddress}`);

    const maybeMint = await fetchMaybeMint(rpc, mintAddress);
    if (!maybeMint.exists) {
      throw new Error("Mint not found");
    }

    // Derive bridge account address
    const [bridgeAccountAddress] = await getProgramDerivedAddress({
      programAddress: config.solanaBridge,
      seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
    });
    logger.info(`Bridge account: ${bridgeAccountAddress}`);

    // Resolve remote token address
    const remoteTokenAddress =
      args.remoteToken === "constant" ? config.wSpl : args.remoteToken;
    const remoteTokenBytes = toBytes(remoteTokenAddress);
    const mintBytes = getBase58Encoder().encode(mintAddress);

    // Calculate scaled amount (amount * 10^decimals)
    const scaledAmount = BigInt(
      Math.floor(args.amount * Math.pow(10, maybeMint.data.decimals))
    );
    logger.info(`Amount: ${args.amount}`);
    logger.info(`Decimals: ${maybeMint.data.decimals}`);
    logger.info(`Scaled amount: ${scaledAmount}`);

    // Derive token vault address
    const [tokenVaultAddress] = await getProgramDerivedAddress({
      programAddress: config.solanaBridge,
      seeds: [
        Buffer.from(getIdlConstant("TOKEN_VAULT_SEED")),
        mintBytes,
        Buffer.from(remoteTokenBytes),
      ],
    });
    logger.info(`Token Vault: ${tokenVaultAddress}`);

    // Generate outgoing message keypair
    const { salt, pubkey: outgoingMessage } = await outgoingMessagePubkey(
      config.solanaBridge
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

    const ixs: Instruction[] = [
      getBridgeSplInstruction(
        {
          // Accounts
          payer,
          from: payer,
          gasFeeReceiver: bridge.data.gasConfig.gasFeeReceiver,
          mint: mintAddress,
          fromTokenAccount: fromTokenAccountAddress,
          tokenVault: tokenVaultAddress,
          bridge: bridgeAccountAddress,
          outgoingMessage,
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
          systemProgram: SYSTEM_PROGRAM_ADDRESS,

          // Arguments
          outgoingMessageSalt: salt,
          to: toBytes(args.to),
          remoteToken: remoteTokenBytes,
          amount: scaledAmount,
          call: null,
        },
        { programAddress: config.solanaBridge }
      ),
    ];

    if (args.payForRelay) {
      ixs.push(
        await buildPayForRelayInstruction(
          args.cluster,
          args.release,
          outgoingMessage,
          payer
        )
      );
    }

    logger.info("Sending transaction...");
    const signature = await buildAndSendTransaction(rpcUrl, ixs, payer);
    logger.success("Bridge SPL operation completed!");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );

    if (args.payForRelay) {
      await monitorMessageExecution(
        args.cluster,
        args.release,
        outgoingMessage
      );
    } else {
      await relayMessageToBase(args.cluster, args.release, outgoingMessage);
    }
  } catch (error) {
    logger.error("Bridge SPL operation failed:", error);
    throw error;
  }
}

async function resolveFromTokenAccount(
  fromTokenAccount: FromTokenAccount,
  rpc: Rpc,
  payerAddress: Address,
  mint: Account<Mint>
) {
  if (fromTokenAccount !== "payer" && fromTokenAccount !== "config") {
    const customAddress = address(fromTokenAccount);
    const maybeToken = await fetchMaybeToken(rpc, customAddress);
    if (!maybeToken.exists) {
      throw new Error("Token account does not exist");
    }

    return maybeToken.address;
  }

  const owner =
    fromTokenAccount === "payer"
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

async function resolvePayerKeypair(payerKp: PayerKp) {
  if (payerKp === "config") {
    logger.info("Using Solana CLI config for payer keypair");
    return await getSolanaCliConfigKeypairSigner();
  }

  logger.info(`Using custom payer keypair: ${payerKp}`);
  return await getKeypairSignerFromPath(payerKp);
}
