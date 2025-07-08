import { homedir } from "os";
import {
  appendTransactionMessageInstructions,
  createKeyPairFromBytes,
  createSignerFromKeyPair,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  devnet,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type IInstruction,
  type TransactionSigner,
} from "@solana/kit";

import { CONSTANTS } from "../../constants";
import { fileFromPath } from "../../utils/file";

let payer: TransactionSigner;
export async function getPayer(keyPairFile?: string) {
  if (payer) return payer;

  const payerKeyPairFile = await fileFromPath(
    keyPairFile ?? `${homedir()}/.config/solana/id.json`
  );
  const payerKeyPairBytes = new Uint8Array(await payerKeyPairFile.json());
  const payerKeypair = await createKeyPairFromBytes(payerKeyPairBytes);
  payer = await createSignerFromKeyPair(payerKeypair);
  return payer;
}

export function getRpc(target: keyof typeof CONSTANTS) {
  const constants = CONSTANTS[target];
  return createSolanaRpc(devnet(`https://${constants.rpcUrl}`));
}

export async function buildAndSendTransaction(
  target: keyof typeof CONSTANTS,
  instructions: IInstruction[]
) {
  const constants = CONSTANTS[target];

  const rpc = createSolanaRpc(devnet(`https://${constants.rpcUrl}`));
  const rpcSubscriptions = createSolanaRpcSubscriptions(
    devnet(`wss://${constants.rpcUrl}`)
  );

  const sendAndConfirmTx = sendAndConfirmTransactionFactory({
    rpc,
    rpcSubscriptions,
  });

  const payer = await getPayer();
  const blockhash = await rpc.getLatestBlockhash().send();

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(payer.address, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash.value, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx)
  );

  const signedTransaction =
    await signTransactionMessageWithSigners(transactionMessage);

  const signature = getSignatureFromTransaction(signedTransaction);

  await sendAndConfirmTx(signedTransaction, {
    commitment: "confirmed",
  });

  console.log(
    `✅ Transaction confirmed: https://explorer.solana.com/tx/${signature}?cluster=${constants.cluster}`
  );
  return signature;
}
