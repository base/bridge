import { z } from "zod";
import {
  createSolanaRpc,
  devnet,
  getProgramDerivedAddress,
  type AccountMeta,
  type Address as SolanaAddress,
  AccountRole,
  type Instruction,
  getBase58Codec,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { toBytes, toHex } from "viem";

import {
  fetchIncomingMessage,
  getRelayMessageInstruction,
  type BridgeBaseToSolanaStateIncomingMessageMessage,
  type BridgeBaseToSolanaStateIncomingMessageTransfer,
  type Ix,
} from "../../../../../../../clients/ts/src/bridge";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  CONSTANTS,
  getIdlConstant,
  getKeypairSignerFromPath,
  getSolanaCliConfigKeypairSigner,
  type Rpc,
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
  messageHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, {
      message:
        "Invalid message hash format (must be 0x followed by 64 hex characters)",
    })
    .brand<"messageHash">(),
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
});

type RelayMessageArgs = z.infer<typeof argsSchema>;
type PayerKp = z.infer<typeof argsSchema.shape.payerKp>;

// NOTE: This version does not support relaying messages whose calls have other accounts as signers.
//       We would need to collect the signatures (or the private keys and sign with them) which is not
//       supported by this script.

export async function handleRelayMessage(
  args: RelayMessageArgs
): Promise<void> {
  try {
    logger.info("--- Relay message script ---");

    // Get config for cluster and release
    const config = CONSTANTS[args.cluster][args.release];

    const rpcUrl = devnet(`https://${config.rpcUrl}`);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    // Resolve payer keypair
    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    // Find the message PDA using the message hash (from prove-message)
    const [messagePda] = await getProgramDerivedAddress({
      programAddress: config.solanaBridge,
      seeds: [
        Buffer.from(getIdlConstant("INCOMING_MESSAGE_SEED")),
        toBytes(args.messageHash),
      ],
    });
    logger.info(`Message PDA: ${messagePda}`);

    // Fetch the message to get the sender for the bridge CPI authority
    const incomingMessage = await fetchIncomingMessage(rpc, messagePda);
    logger.info(
      `Message sender: ${toHex(Buffer.from(incomingMessage.data.sender))}`
    );

    if (incomingMessage.data.executed) {
      logger.success("Message has already been executed");
      return;
    }

    // Find the bridge CPI authority PDA. Not always needed, but simpler to always compute it here.
    // It is only really needed if the relayed message needs to CPI into a program that requires
    // the bridge CPI authority as a signer.
    const [bridgeCpiAuthorityPda] = await getProgramDerivedAddress({
      programAddress: config.solanaBridge,
      seeds: [
        Buffer.from(getIdlConstant("BRIDGE_CPI_AUTHORITY_SEED")),
        Buffer.from(incomingMessage.data.sender),
      ],
    });
    logger.info(`Bridge CPI Authority PDA: ${bridgeCpiAuthorityPda}`);

    const message = incomingMessage.data.message;

    let remainingAccounts =
      message.__kind === "Call"
        ? await messageCallAccounts(message)
        : await messageTransferAccounts(rpc, message, config.solanaBridge);

    // Set the role to readonly for the bridge CPI authority account (if it exists)
    remainingAccounts = remainingAccounts.map((acct) => {
      if (acct.address === bridgeCpiAuthorityPda) {
        return {
          ...acct,
          role: AccountRole.READONLY,
        };
      }
      return acct;
    });

    const [bridgeAccountAddress] = await getProgramDerivedAddress({
      programAddress: config.solanaBridge,
      seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
    });
    logger.info(`Bridge account address: ${bridgeAccountAddress}`);

    const relayMessageIx = getRelayMessageInstruction(
      {
        message: messagePda,
        bridge: bridgeAccountAddress,
      },
      { programAddress: config.solanaBridge }
    );

    const relayMessageIxWithRemainingAccounts: Instruction = {
      programAddress: relayMessageIx.programAddress,
      accounts: [...relayMessageIx.accounts, ...remainingAccounts],
      data: relayMessageIx.data,
    };

    logger.info("Sending transaction...");
    const signature = await buildAndSendTransaction(
      rpcUrl,
      [relayMessageIxWithRemainingAccounts],
      payer
    );
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );
  } catch (error) {
    logger.error("Failed to relay message:", error);
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

async function getIxAccounts(ixs: Ix[]) {
  const allIxsAccounts = [];

  for (const ix of ixs) {
    const ixAccounts = await Promise.all(
      ix.accounts.map(async (acc) => {
        return {
          address: acc.pubkey,
          role: acc.isWritable
            ? acc.isSigner
              ? AccountRole.WRITABLE_SIGNER
              : AccountRole.WRITABLE
            : acc.isSigner
              ? AccountRole.READONLY_SIGNER
              : AccountRole.READONLY,
        };
      })
    );

    allIxsAccounts.push(...ixAccounts);
  }

  return allIxsAccounts;
}

type MessageCall = Extract<
  BridgeBaseToSolanaStateIncomingMessageMessage,
  { __kind: "Call" }
>;
async function messageCallAccounts(message: MessageCall) {
  logger.info(`Call message with ${message.fields.length} instructions`);

  const ixs = message.fields[0];
  if (ixs.length === 0) {
    throw new Error("Zero instructions in call message");
  }

  // Include both the accounts and program IDs for each instruction
  return [
    ...(await getIxAccounts(ixs)),
    ...ixs.map((i) => ({
      address: i.programId,
      role: AccountRole.READONLY,
    })),
  ];
}

type MessageTransfer = Extract<
  BridgeBaseToSolanaStateIncomingMessageMessage,
  { __kind: "Transfer" }
>;
async function messageTransferAccounts(
  rpc: Rpc,
  message: MessageTransfer,
  solanaBridge: SolanaAddress
) {
  logger.info(`Transfer message with ${message.ixs.length} instructions`);

  const remainingAccounts: Array<AccountMeta> =
    message.transfer.__kind === "Sol"
      ? await messageTransferSolAccounts(message.transfer, solanaBridge)
      : message.transfer.__kind === "Spl"
        ? await messageTransferSplAccounts(rpc, message.transfer, solanaBridge)
        : await messageTransferWrappedTokenAccounts(message.transfer);

  // Process the list of optional instructions
  const ixs = message.ixs;

  // Include both the accounts and program IDs for each instruction
  remainingAccounts.push(
    ...(await getIxAccounts(ixs)),
    ...ixs.map((i) => ({
      address: i.programId,
      role: AccountRole.READONLY,
    }))
  );

  return remainingAccounts;
}

type MessageTransferSol = Extract<
  BridgeBaseToSolanaStateIncomingMessageTransfer,
  { __kind: "Sol" }
>;
async function messageTransferSolAccounts(
  message: MessageTransferSol,
  solanaBridge: SolanaAddress
) {
  logger.info("SOL transfer detected");

  const { remoteToken, to, amount } = message.fields[0];

  logger.info(`SOL transfer:`);
  logger.info(`  Remote token: 0x${remoteToken.toHex()}`);
  logger.info(`  To: ${to}`);
  logger.info(`  Amount: ${amount}`);

  const [solVaultPda] = await getProgramDerivedAddress({
    programAddress: solanaBridge,
    seeds: [
      Buffer.from(getIdlConstant("SOL_VAULT_SEED")),
      Buffer.from(remoteToken),
    ],
  });
  logger.info(`SOL vault PDA: ${solVaultPda}`);

  return [
    {
      address: solVaultPda,
      role: AccountRole.WRITABLE,
    },
    {
      address: to,
      role: AccountRole.WRITABLE,
    },
    {
      address: SYSTEM_PROGRAM_ADDRESS,
      role: AccountRole.READONLY,
    },
  ];
}

type MessageTransferSpl = Extract<
  BridgeBaseToSolanaStateIncomingMessageTransfer,
  { __kind: "Spl" }
>;
async function messageTransferSplAccounts(
  rpc: Rpc,
  message: MessageTransferSpl,
  solanaBridge: SolanaAddress
) {
  logger.info("SPL transfer detected");

  const { remoteToken, localToken, to, amount } = message.fields[0];

  logger.info(`SPL transfer:`);
  logger.info(`  RemoteToken: 0x${remoteToken.toHex()}`);
  logger.info(`  LocalToken: ${localToken}`);
  logger.info(`  To: ${to}`);
  logger.info(`  Amount: ${amount}`);

  const [tokenVaultPda] = await getProgramDerivedAddress({
    programAddress: solanaBridge,
    seeds: [
      Buffer.from(getIdlConstant("TOKEN_VAULT_SEED")),
      getBase58Codec().encode(localToken),
      Buffer.from(remoteToken),
    ],
  });

  const mint = await rpc.getAccountInfo(localToken).send();
  if (!mint.value) {
    throw new Error("Mint not found");
  }

  return [
    {
      address: localToken,
      role: AccountRole.READONLY,
    },
    {
      address: tokenVaultPda,
      role: AccountRole.WRITABLE,
    },
    {
      address: to,
      role: AccountRole.WRITABLE,
    },
    {
      address: mint.value!.owner,
      role: AccountRole.READONLY,
    },
  ];
}

type MessageTransferWrappedToken = Extract<
  BridgeBaseToSolanaStateIncomingMessageTransfer,
  { __kind: "WrappedToken" }
>;
async function messageTransferWrappedTokenAccounts(
  message: MessageTransferWrappedToken
) {
  logger.info(`WrappedToken transfer detected`);

  const { localToken, to, amount } = message.fields[0];

  logger.info(`WrappedToken transfer:`);
  logger.info(`  Local Token: ${localToken}`);
  logger.info(`  To: ${to}`);
  logger.info(`  Amount: ${amount}`);

  return [
    {
      address: localToken,
      role: AccountRole.WRITABLE,
    },
    {
      address: to,
      role: AccountRole.WRITABLE,
    },
    {
      address: TOKEN_2022_PROGRAM_ADDRESS,
      role: AccountRole.READONLY,
    },
  ];
}
