import {
  appendTransactionMessageInstructions,
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
  type ClusterUrl,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";

export async function buildAndSendTransaction(
  rpcUrl: ClusterUrl,
  instructions: Instruction[],
  payer: TransactionSigner
) {
  const rpcHostname = rpcUrl.replace("http://", "").replace("https://", "");
  const rpc = createSolanaRpc(`https://${rpcHostname}`);
  const rpcSubscriptions = createSolanaRpcSubscriptions(
    devnet(`wss://${rpcHostname}`)
  );

  const sendAndConfirmTx = sendAndConfirmTransactionFactory({
    rpc,
    rpcSubscriptions,
  });

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

  return signature;
}
