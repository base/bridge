import { z } from "zod";
import { devnet, createSolanaRpc, type Instruction } from "@solana/kit";
import {
  fetchExpiringRootAndOpCount,
  fetchMultisigConfig,
  getExecuteInstruction,
} from "@xenoliss/mcm-sol-client";
import { toBytes, type Hex } from "viem";
import { readFileSync } from "fs";

import { logger } from "@internal/logger";
import {
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
  buildAndSendTransaction,
} from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS, type DeployEnv } from "@internal/constants";
import {
  multisigConfigPda,
  rootMetadataPda,
  expiringRootAndOpCountPda,
  multisigSignerPda,
  proposalSchema,
  type Proposal,
  computeProposalRoot,
} from "@internal/sol/mcm";

export const argsSchema = z.object({
  deployEnv: z
    .enum(DEPLOY_ENVS, {
      message:
        "Deploy environment must be either 'development-alpha' or 'development-prod'",
    })
    .default("development-alpha"),
  payerKp: z
    .union([z.literal("config"), z.string().brand<"payerKp">()])
    .default("config"),
  proposalFile: z.string().min(1, "Proposal file path cannot be empty"),
  opIndex: z
    .string()
    .transform((val) => parseInt(val))
    .refine((val) => !isNaN(val) && val >= 0, {
      message: "Operation index must be a non-negative integer",
    }),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

export async function handleExecute(args: Args): Promise<void> {
  try {
    logger.info("--- MCM Execute Operation script ---");

    const config = CONFIGS[args.deployEnv];
    const rpcUrl = devnet(`https://${config.solana.rpcUrl}`);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Authority: ${payer.address}`);

    // Read and validate proposal
    const proposal = readProposalFile(args.proposalFile);
    logger.info(`Proposal loaded from: ${args.proposalFile}`);
    logger.info(`Multisig ID: "${proposal.multisigId}"`);
    logger.info(`Total operations in proposal: ${proposal.ixs.length}`);

    if (args.opIndex >= proposal.ixs.length) {
      throw new Error(
        `Operation index ${args.opIndex} is out of bounds (proposal has ${proposal.ixs.length} operations)`
      );
    }

    const operation = proposal.ixs[args.opIndex]!;
    logger.info(`Executing operation #${args.opIndex}:`);
    if (operation.program) {
      logger.info(`  Program: ${operation.program}`);
    }
    if (operation.description) {
      logger.info(`  Description: ${operation.description}`);
    }
    logger.info(`  Target: ${operation.programAddress}`);
    logger.info(`  Data length: ${operation.data.length} bytes`);
    logger.info(`  Accounts: ${operation.accounts.length}`);

    // Calculate operation nonce
    const nonce = proposal.rootMetadata.preOpCount + args.opIndex;
    logger.info(`Operation nonce: ${nonce}`);

    // Compute Merkle proof
    const { root, operationProofs } = await computeProposalRoot(proposal);
    logger.info(`Root: ${root}`);

    // Metadata is always at index 0, operations start at index 1
    const operationProof = operationProofs[args.opIndex]!;
    logger.info(`Operation proof: ${operationProof.join(", ")}`);

    // Derive all required PDAs
    const [multisigConfig] = await multisigConfigPda(
      args.deployEnv,
      proposal.multisigId
    );
    const [rootMetadata] = await rootMetadataPda(
      args.deployEnv,
      proposal.multisigId
    );
    const [expiringRootAndOpCount] = await expiringRootAndOpCountPda(
      args.deployEnv,
      proposal.multisigId
    );
    const [multisigSigner] = await multisigSignerPda(
      args.deployEnv,
      proposal.multisigId
    );

    logger.info("Derived PDAs:");
    logger.info(`  Multisig Config: ${multisigConfig}`);
    logger.info(`  Root Metadata: ${rootMetadata}`);
    logger.info(`  Expiring Root: ${expiringRootAndOpCount}`);
    logger.info(`  Multisig Signer: ${multisigSigner}`);

    // Extract remaining accounts from the operation
    const remainingAccounts = operation.accounts.map((account) => ({
      address: account.address,
      role: account.role,
    }));

    logger.info(`Remaining accounts: ${remainingAccounts.length}`);
    remainingAccounts.forEach((acc, i) => {
      logger.info(`  [${i}] ${acc.address} role=${acc.role}`);
    });

    // Create execute instruction
    const executeIx = getExecuteInstruction(
      {
        // Accounts
        multisigConfig,
        rootMetadata,
        expiringRootAndOpCount,
        to: operation.programAddress,
        multisigSigner,
        authority: payer,

        // Arguments
        multisigId: toBytes(proposal.multisigId),
        chainId: proposal.rootMetadata.chainId,
        nonce: BigInt(nonce),
        data: toBytes(operation.data),
        proof: operationProof.map((hash) => toBytes(hash)),
      },
      {
        programAddress: config.solana.mcmProgram,
      }
    );

    // Reconstruct instruction with remaining accounts
    const executeIxWithRemainingAccounts: Instruction = {
      programAddress: executeIx.programAddress,
      accounts: [...executeIx.accounts, ...remainingAccounts],
      data: executeIx.data,
    };

    logger.info("Sending execute transaction...");
    const signature = await buildAndSendTransaction(
      args.deployEnv,
      [executeIxWithRemainingAccounts],
      payer
    );

    logger.success(`Operation #${args.opIndex} executed successfully!`);
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );
    logger.info(`New op_count should be: ${BigInt(nonce) + 1n}`);
  } catch (error) {
    logger.error("MCM execute operation failed:", error);
    throw error;
  }
}

async function resolvePayerKeypair(payerKpArg: PayerKpArg) {
  if (payerKpArg === "config") {
    logger.info("Using Solana CLI config for payer keypair");
    return await getSolanaCliConfigKeypairSigner();
  }

  logger.info(`Using custom payer keypair: ${payerKpArg}`);
  return await getKeypairSignerFromPath(payerKpArg);
}

async function readMultisigState(
  deployEnv: DeployEnv,
  rpc: ReturnType<typeof createSolanaRpc>,
  multisigId: Hex
) {
  logger.info("Reading current multisig state from chain...");

  const [expiringRootAndOpCountAddress] = await expiringRootAndOpCountPda(
    deployEnv,
    multisigId
  );
  const [multisigConfigAddress] = await multisigConfigPda(
    deployEnv,
    multisigId
  );

  const [expiringRootAndOpCountAccount, multisigConfigAccount] =
    await Promise.all([
      fetchExpiringRootAndOpCount(rpc, expiringRootAndOpCountAddress),
      fetchMultisigConfig(rpc, multisigConfigAddress),
    ]);

  const currentOpCount = expiringRootAndOpCountAccount.data.opCount;
  const chainId = multisigConfigAccount.data.chainId;

  logger.info(`Current op_count: ${currentOpCount}`);
  logger.info(`Chain ID: ${chainId}`);

  return {
    multisigConfigAddress,
    expiringRootAndOpCountAddress,
    currentOpCount,
    chainId,
  };
}

function readProposalFile(filePath: string): Proposal {
  try {
    const fileContent = readFileSync(filePath, "utf-8");
    const json = JSON.parse(fileContent);

    const parsed = proposalSchema.safeParse(json);
    if (!parsed.success) {
      logger.error("Invalid proposal file format:");
      parsed.error.issues.forEach((err) => {
        logger.error(`  - ${err.path.join(".")}: ${err.message}`);
      });
      throw new Error("Proposal validation failed");
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse proposal file: ${error.message}`);
    }
    throw error;
  }
}
