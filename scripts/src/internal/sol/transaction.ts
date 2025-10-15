import {
  appendTransactionMessageInstructions,
  assertIsSendableTransaction,
  assertIsTransactionWithBlockhashLifetime,
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
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import { addSignersToTransactionMessage } from "@solana/signers";

import { CONFIGS, type DeployEnv } from "../constants";

export async function buildAndSendTransaction(
  rpcConfig:
    | { type: "deploy-env"; value: DeployEnv }
    | { type: "rpc-url"; value: string },
  instructions: Instruction[],
  payer: TransactionSigner
) {
  const rpcUrl =
    rpcConfig.type === "deploy-env"
      ? CONFIGS[rpcConfig.value].solana.rpcUrl
      : rpcConfig.value;

  const rpcHostName = rpcUrl.replace("https://", "");
  const rpc = createSolanaRpc(`https://${rpcHostName}`);
  const rpcSubscriptions = createSolanaRpcSubscriptions(
    devnet(`wss://${rpcHostName}`)
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
    (tx) => appendTransactionMessageInstructions(instructions, tx),
    (tx) => addSignersToTransactionMessage([payer], tx)
  );

  const signedTransaction =
    await signTransactionMessageWithSigners(transactionMessage);

  const signature = getSignatureFromTransaction(signedTransaction);

  assertIsSendableTransaction(signedTransaction);
  assertIsTransactionWithBlockhashLifetime(signedTransaction);

  await sendAndConfirmTx(signedTransaction, {
    commitment: "confirmed",
  });

  return signature;
}
