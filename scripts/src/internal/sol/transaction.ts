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
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import { addSignersToTransactionMessage } from "@solana/signers";
import { CONFIGS, type DeployEnv } from "../constants";

export async function buildAndSendTransaction(
  deployEnv: DeployEnv,
  instructions: Instruction[],
  payer: TransactionSigner
) {
  const config = CONFIGS[deployEnv];
  const rpc = createSolanaRpc(`https://${config.solana.rpcUrl}`);
  const rpcSubscriptions = createSolanaRpcSubscriptions(
    devnet(`wss://${config.solana.rpcUrl}`)
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

  await sendAndConfirmTx(signedTransaction, {
    commitment: "confirmed",
  });

  return signature;
}
