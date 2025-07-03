import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { toBytes, toHex } from "viem";

import type { Bridge } from "../../target/types/bridge";
import { getConstantValue } from "../utils/constants";
import { confirmTransaction } from "../utils/confirm-tx";
import { deserializeMessage } from "../utils/deserializer";

// The message hash from a previously proven message
const MESSAGE_HASH =
  "0x5a1e91ae8594a7e58ae2aa213954d7733a5e90b276a37d62800ec00a97e7e66d";

const NEW_ACCOUNT_SECRET_KEY =
  "0cd60f7db0ca726a07da10e35323042a5b05facc00b781e57b06a59eaf2e2197769b26af0c3e3d129796876e465c21b479aae47bba4e9c964bb556d8d7cf93b2";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Bridge as Program<Bridge>;

  console.log(`Program ID: ${program.programId.toBase58()}`);
  console.log(`Signer: ${provider.wallet.publicKey.toBase58()}`);

  const newAccount = anchor.web3.Keypair.fromSecretKey(
    Buffer.from(NEW_ACCOUNT_SECRET_KEY, "hex")
  );

  // Find the message PDA using the message hash (from prove-message)
  const [messagePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(getConstantValue("incomingMessageSeed")),
      toBytes(MESSAGE_HASH),
    ],
    program.programId
  );

  // Fetch the message to get the sender for the bridge CPI authority
  const message = await program.account.incomingMessage.fetch(messagePda);

  // Find the bridge CPI authority PDA. Not always needed, but simpler to always compute it here.
  // It is only really needed if the relayed message needs to CPI into a program that requires
  // the bridge CPI authority as a signer.
  const [bridgeCpiAuthorityPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(getConstantValue("bridgeCpiAuthoritySeed")),
      Buffer.from(message.sender),
    ],
    program.programId
  );

  console.log(`Message PDA: ${messagePda.toBase58()}`);
  console.log(`Bridge CPI Authority PDA: ${bridgeCpiAuthorityPda.toBase58()}`);
  console.log(`Message executed: ${message.executed}`);
  console.log(`Message sender: ${toHex(Buffer.from(message.sender))}`);

  if (message.executed) {
    console.log("Message has already been executed!");
    return;
  }

  const messageData = Buffer.from(message.data);
  const deserializedMessage = deserializeMessage(messageData);

  const requiredAccounts = {
    payer: provider.wallet.publicKey,
    message: messagePda,
  };

  let remainingAccounts: {
    pubkey: anchor.web3.PublicKey;
    isWritable: boolean;
    isSigner: boolean;
  }[];
  const signers: Array<anchor.web3.Signer> = [];

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
      ...ixs.flatMap((i) => i.accounts),
      ...ixs.map((i) => ({
        pubkey: i.programId,
        isWritable: false,
        isSigner: false,
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
      console.log(`  To: ${solTransfer.to.toBase58()}`);
      console.log(`  Amount: ${solTransfer.amount}`);

      const [solVaultPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from(getConstantValue("solVaultSeed")),
          Buffer.from(solTransfer.remoteToken),
        ],
        program.programId
      );

      remainingAccounts = [
        {
          pubkey: solVaultPda,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: solTransfer.to,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: SystemProgram.programId,
          isWritable: false,
          isSigner: false,
        },
      ];
    } else if (deserializedMessage.transfer.type === "Spl") {
      console.log("SPL transfer detected");
      const splTransfer = deserializedMessage.transfer;

      console.log(`SPL transfer:`);
      console.log(`  RemoteToken: 0x${toHex(splTransfer.remoteToken)}`);
      console.log(`  LocalToken: ${splTransfer.localToken.toBase58()}`);
      console.log(`  To: ${splTransfer.to.toBase58()}`);
      console.log(`  Amount: ${splTransfer.amount}`);

      const [tokenVaultPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from(getConstantValue("tokenVaultSeed")),
          splTransfer.localToken.toBuffer(),
          Buffer.from(splTransfer.remoteToken),
        ],
        program.programId
      );

      const mint = await program.provider.connection.getAccountInfo(
        splTransfer.localToken
      );

      if (!mint) {
        throw new Error("Mint not found");
      }

      remainingAccounts = [
        {
          pubkey: splTransfer.localToken,
          isWritable: false,
          isSigner: false,
        },
        {
          pubkey: tokenVaultPda,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: splTransfer.to,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: mint.owner,
          isWritable: false,
          isSigner: false,
        },
      ];
    } else if (deserializedMessage.transfer.type === "WrappedToken") {
      const wrappedTransfer = deserializedMessage.transfer;

      console.log(`WrappedToken transfer:`);
      console.log(`  Local Token: ${wrappedTransfer.localToken.toBase58()}`);
      console.log(`  To: ${wrappedTransfer.to.toBase58()}`);
      console.log(`  Amount: ${wrappedTransfer.amount}`);

      remainingAccounts = [
        {
          pubkey: wrappedTransfer.localToken,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: wrappedTransfer.to,
          isWritable: true,
          isSigner: false,
        },
        {
          pubkey: TOKEN_2022_PROGRAM_ID,
          isWritable: false,
          isSigner: false,
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
      ...ixs.flatMap((i) => i.accounts),
      ...ixs.map((i) => ({
        pubkey: i.programId,
        isWritable: false,
        isSigner: false,
      }))
    );
  } else {
    throw new Error("Unexpected message type detected");
  }

  // Set the isSigner flag to false for the bridge CPI authority account (if it exists)
  remainingAccounts = remainingAccounts.map((acct) => {
    if (acct.pubkey.toBase58() === bridgeCpiAuthorityPda.toBase58()) {
      return {
        ...acct,
        isSigner: false,
      };
    }
    return acct;
  });

  remainingAccounts.forEach((acct, i) => {
    console.log(`Account ${i + 1}:`);
    console.log(`  Pubkey: ${acct.pubkey}`);
    console.log(`  IsWritable: ${acct.isWritable}`);
    console.log(`  IsSigner: ${acct.isSigner}`);
  });

  const tx = await program.methods
    .relayMessage()
    .accountsStrict(requiredAccounts)
    .remainingAccounts(remainingAccounts)
    .signers(signers)
    .rpc();

  console.log("Submitted transaction:", tx);

  await confirmTransaction(provider.connection, tx);
}

main().catch((e) => {
  console.error(e);
  console.log(e.getLogs());
});
