import {
  AccountRole,
  createKeyPairFromBytes,
  createSignerFromKeyPair,
  getBase58Codec,
  getProgramDerivedAddress,
  type Address,
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
  type Ix,
} from "../../../clients/ts/generated";
import { CONSTANTS } from "../../constants";
import { getTarget } from "../../utils/argv";
import { getIdlConstant } from "../../utils/idl-constants";
import {
  buildAndSendTransaction,
  getPayer,
  getRpc,
} from "../utils/transaction";

const NEW_ACCOUNT_SECRET_KEY =
  "0x0cd60f7db0ca726a07da10e35323042a5b05facc00b781e57b06a59eaf2e2197769b26af0c3e3d129796876e465c21b479aae47bba4e9c964bb556d8d7cf93b2";

export async function relayMessage(messageHash: string) {
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
      toBytes(messageHash),
    ],
  });

  // Fetch the message to get the sender for the bridge CPI authority
  const incomingMessage = await fetchIncomingMessage(rpc, messagePda);

  // Find the bridge CPI authority PDA. Not always needed, but simpler to always compute it here.
  // It is only really needed if the relayed message needs to CPI into a program that requires
  // the bridge CPI authority as a signer.
  const [bridgeCpiAuthorityPda] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [
      Buffer.from(getIdlConstant("BRIDGE_CPI_AUTHORITY_SEED")),
      Buffer.from(incomingMessage.data.sender),
    ],
  });

  console.log(`Message PDA: ${messagePda}`);
  console.log(`Bridge CPI Authority PDA: ${bridgeCpiAuthorityPda}`);
  console.log(`Message executed: ${incomingMessage.data.executed}`);
  console.log(
    `Message sender: ${toHex(Buffer.from(incomingMessage.data.sender))}`
  );

  if (incomingMessage.data.executed) {
    console.log("Message has already been executed!");
    return;
  }

  const message = incomingMessage.data.message;

  let remainingAccounts: Array<IAccountMeta> = [];
  const signers: Array<TransactionPartialSigner> = [];

  if (message.__kind === "Call") {
    console.log(`Call message with ${message.fields.length} instructions`);

    const ixs = message.fields[0];
    if (ixs.length === 0) {
      throw new Error("Zero instructions in call message");
    }

    // Include both the accounts and program IDs for each instruction
    remainingAccounts = [
      ...(await getIxAccounts(ixs)),
      ...ixs.map((i) => ({
        address: i.programId,
        role: AccountRole.READONLY,
      })),
    ];

    signers.push(newAccount);
  } else if (message.__kind === "Transfer") {
    console.log(`Transfer message with ${message.ixs.length} instructions`);

    if (message.transfer.__kind === "Sol") {
      console.log("SOL transfer detected");
      const solTransfer = message.transfer;

      const { remoteToken, to, amount } = solTransfer.fields[0];

      console.log(`SOL transfer:`);
      console.log(`  Remote token: 0x${remoteToken.toHex()}`);
      console.log(`  To: ${to}`);
      console.log(`  Amount: ${amount}`);

      const [solVaultPda] = await getProgramDerivedAddress({
        programAddress: constants.solanaBridge,
        seeds: [
          Buffer.from(getIdlConstant("SOL_VAULT_SEED")),
          Buffer.from(remoteToken),
        ],
      });

      remainingAccounts = [
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
    } else if (message.transfer.__kind === "Spl") {
      console.log("SPL transfer detected");
      const splTransfer = message.transfer;

      const { remoteToken, localToken, to, amount } = splTransfer.fields[0];

      console.log(`SPL transfer:`);
      console.log(`  RemoteToken: 0x${remoteToken.toHex()}`);
      console.log(`  LocalToken: ${localToken}`);
      console.log(`  To: ${to}`);
      console.log(`  Amount: ${amount}`);

      const [tokenVaultPda] = await getProgramDerivedAddress({
        programAddress: constants.solanaBridge,
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

      remainingAccounts = [
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
    } else if (message.transfer.__kind === "WrappedToken") {
      const wrappedTransfer = message.transfer;

      const { localToken, to, amount } = wrappedTransfer.fields[0];

      console.log(`WrappedToken transfer:`);
      console.log(`  Local Token: ${localToken}`);
      console.log(`  To: ${to}`);
      console.log(`  Amount: ${amount}`);

      remainingAccounts = [
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
      // signers.push(newAccount);
    } else {
      throw new Error("Unexpected transfer type detected");
    }

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

  const [bridgeAddress] = await getProgramDerivedAddress({
    programAddress: constants.solanaBridge,
    seeds: [Buffer.from(getIdlConstant("BRIDGE_SEED"))],
  });

  console.log("🛠️  Building instruction...");
  const ix = getRelayMessageInstruction(
    {
      payer,
      message: messagePda,
      bridge: bridgeAddress,
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

async function getIxAccounts(ixs: Ix[]) {
  const allIxsAccounts = [];
  for (const ix of ixs) {
    const ixAccounts = await Promise.all(
      ix.accounts.map(async (acc: any) => {
        let address: Address;
        if (acc.pubkeyOrPda.__kind === "Pubkey") {
          address = acc.pubkeyOrPda.fields[0];
        } else {
          [address] = await getProgramDerivedAddress({
            programAddress: acc.pubkeyOrPda.programId,
            seeds: acc.pubkeyOrPda.seeds,
          });
        }

        return {
          address,
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
