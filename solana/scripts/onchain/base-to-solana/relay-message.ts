import {
  AccountRole,
  createKeyPairFromBytes,
  createSignerFromKeyPair,
  getProgramDerivedAddress,
  type IAccountMeta,
  type IInstruction,
  type TransactionPartialSigner,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { toBytes, toHex } from "viem";

import {
  fetchIncomingMessage,
  getRelayMessageInstruction,
} from "../../../clients/ts/generated";
import { CONSTANTS } from "../../constants";
import { getTarget } from "../../utils/argv";
import { getIdlConstant } from "../../utils/idl-constants";
import {
  buildAndSendTransaction,
  getPayer,
  getRpc,
} from "../utils/transaction";
import { deserializeMessage } from "../utils/deserializer";

const MESSAGE_HASH =
  "0x5a1e91ae8594a7e58ae2aa213954d7733a5e90b276a37d62800ec00a97e7e66d";

const NEW_ACCOUNT_SECRET_KEY =
  "0x0cd60f7db0ca726a07da10e35323042a5b05facc00b781e57b06a59eaf2e2197769b26af0c3e3d129796876e465c21b479aae47bba4e9c964bb556d8d7cf93b2";

async function main() {
  const target = getTarget();
  const constants = CONSTANTS[target];
  const payer = await getPayer();
  const rpc = getRpc(target);

  console.log("=".repeat(40));
  console.log(`Target: ${target}`);
  console.log(`RPC URL: ${constants.rpcUrl}`);
  console.log(`Bridge: ${constants.solanaBridge}`);
  console.log(`Payer: ${payer.address}`);
  console.log("=".repeat(40));
  console.log("");

  const newAccountKeyPair = await createKeyPairFromBytes(
    toBytes(NEW_ACCOUNT_SECRET_KEY)
  );
  const newAccount = await createSignerFromKeyPair(newAccountKeyPair);

  // Find the message PDA using the message hash (from prove-message)
  const [messagePda] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [
      Buffer.from(getIdlConstant("INCOMING_MESSAGE_SEED")),
      toBytes(MESSAGE_HASH),
    ],
  });

  // Fetch the message to get the sender for the bridge CPI authority
  const message = await fetchIncomingMessage(rpc, messagePda);

  // Find the bridge CPI authority PDA. Not always needed, but simpler to always compute it here.
  // It is only really needed if the relayed message needs to CPI into a program that requires
  // the bridge CPI authority as a signer.
  const [bridgeCpiAuthorityPda] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [
      Buffer.from(getIdlConstant("BRIDGE_CPI_AUTHORITY_SEED")),
      Buffer.from(message.data.sender),
    ],
  });

  console.log(`Message PDA: ${messagePda}`);
  console.log(`Bridge CPI Authority PDA: ${bridgeCpiAuthorityPda}`);
  console.log(`Message executed: ${message.data.executed}`);
  console.log(`Message sender: ${toHex(Buffer.from(message.data.sender))}`);

  //   if (message.data.executed) {
  //     console.log("Message has already been executed!");
  //     return;
  //   }

  const messageData = Buffer.from(message.data.data);
  const deserializedMessage = await deserializeMessage(messageData);

  let remainingAccounts: Array<IAccountMeta> = [];
  const signers: Array<TransactionPartialSigner> = [];

  if (deserializedMessage.type === "Call") {
    console.log(
      `Call message with ${deserializedMessage.ixs.length} instructions`
    );

    const { ixs } = deserializedMessage;
    if (ixs.length === 0) {
      throw new Error("Zero instructions in call message");
    }

    // Include both the accounts and program IDs for each instruction
    remainingAccounts = [
      ...ixs.flatMap((i) =>
        i.accounts.map((acc) => ({
          address: acc.address,
          role: acc.isWritable
            ? acc.isSigner
              ? AccountRole.WRITABLE_SIGNER
              : AccountRole.WRITABLE
            : acc.isSigner
              ? AccountRole.READONLY_SIGNER
              : AccountRole.READONLY,
        }))
      ),
      ...ixs.map((i) => ({
        address: i.programAddress,
        role: AccountRole.READONLY,
      })),
    ];
    signers.push(newAccount);
  } else if (deserializedMessage.type === "Transfer") {
    console.log(
      `Transfer message with ${deserializedMessage.ixs.length} instructions`
    );

    if (deserializedMessage.transfer.type === "Sol") {
      console.log("SOL transfer detected");
      const solTransfer = deserializedMessage.transfer;

      console.log(`SOL transfer:`);
      console.log(`  Remote token: 0x${toHex(solTransfer.remoteToken)}`);
      console.log(`  To: ${solTransfer.to}`);
      console.log(`  Amount: ${solTransfer.amount}`);

      const [solVaultPda] = await getProgramDerivedAddress({
        programAddress: constants.solanaBridge,
        seeds: [
          Buffer.from(getIdlConstant("SOL_VAULT_SEED")),
          Buffer.from(solTransfer.remoteToken),
        ],
      });

      remainingAccounts = [
        {
          address: solVaultPda,
          role: AccountRole.WRITABLE,
        },
        {
          address: solTransfer.to,
          role: AccountRole.WRITABLE,
        },
        {
          address: SYSTEM_PROGRAM_ADDRESS,
          role: AccountRole.READONLY,
        },
      ];
    } else if (deserializedMessage.transfer.type === "Spl") {
      console.log("SPL transfer detected");
      const splTransfer = deserializedMessage.transfer;

      console.log(`SPL transfer:`);
      console.log(`  RemoteToken: 0x${toHex(splTransfer.remoteToken)}`);
      console.log(`  LocalToken: ${splTransfer.localToken}`);
      console.log(`  To: ${splTransfer.to}`);
      console.log(`  Amount: ${splTransfer.amount}`);

      const [tokenVaultPda] = await getProgramDerivedAddress({
        programAddress: constants.solanaBridge,
        seeds: [
          Buffer.from(getIdlConstant("TOKEN_VAULT_SEED")),
          splTransfer.localToken,
          Buffer.from(splTransfer.remoteToken),
        ],
      });

      const mint = await rpc.getAccountInfo(splTransfer.localToken).send();
      if (!mint.value) {
        throw new Error("Mint not found");
      }

      remainingAccounts = [
        {
          address: splTransfer.localToken,
          role: AccountRole.READONLY,
        },
        {
          address: tokenVaultPda,
          role: AccountRole.WRITABLE,
        },
        {
          address: splTransfer.to,
          role: AccountRole.WRITABLE,
        },
        {
          address: mint.value!.owner,
          role: AccountRole.READONLY,
        },
      ];
    } else if (deserializedMessage.transfer.type === "WrappedToken") {
      const wrappedTransfer = deserializedMessage.transfer;

      console.log(`WrappedToken transfer:`);
      console.log(`  Local Token: ${wrappedTransfer.localToken}`);
      console.log(`  To: ${wrappedTransfer.to}`);
      console.log(`  Amount: ${wrappedTransfer.amount}`);

      remainingAccounts = [
        {
          address: wrappedTransfer.localToken,
          role: AccountRole.WRITABLE,
        },
        {
          address: TOKEN_2022_PROGRAM_ADDRESS,
          role: AccountRole.READONLY,
        },
      ];
      // signers.push(newAccount);
    } else {
      throw new Error("Unexpected transfer type detected");
    }

    // Process the list of optional instructions
    const { ixs } = deserializedMessage;

    // Include both the accounts and program IDs for each instruction
    remainingAccounts.push(
      ...ixs.flatMap((i) =>
        i.accounts.map((acc) => ({
          address: acc.address,
          role: acc.isWritable
            ? acc.isSigner
              ? AccountRole.WRITABLE_SIGNER
              : AccountRole.WRITABLE
            : acc.isSigner
              ? AccountRole.READONLY_SIGNER
              : AccountRole.READONLY,
        }))
      ),
      ...ixs.map((i) => ({
        address: i.programAddress,
        role: AccountRole.READONLY,
      }))
    );
  } else {
    throw new Error("Unexpected message type detected");
  }

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

  console.log("🛠️  Building instruction...");
  const ix = getRelayMessageInstruction(
    {
      payer,
      message: messagePda,
    },
    { programAddress: constants.solanaBridge }
  );

  const ix_: IInstruction = {
    programAddress: ix.programAddress,
    accounts: [...ix.accounts, ...remainingAccounts],
    data: ix.data,
  };

  console.log("🚀 Sending transaction...");
  await buildAndSendTransaction(target, [ix_]);
  console.log("✅ Done!");
}

main().catch((e) => {
  console.error("❌ Relay message failed:", e);
  process.exit(1);
});
