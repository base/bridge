import { z } from "zod";
import {
  devnet,
  createSolanaRpc,
  type Address as SolanaAddress,
} from "@solana/kit";
import { getSetRootInstruction } from "@xenoliss/mcm-sol-client";
import { concat, keccak256, toBytes, type Hash, type Hex } from "viem";
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
  rootSignaturesPda,
  seenSignedHashesPda,
  proposalSchema,
  type Proposal,
  computeProposalRoot,
  hashPair,
} from "@internal/sol/mcm";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";

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
  proposalFile: z.string().min(1, "Proposal file path is required"),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

export async function handleSetRoot(args: Args): Promise<void> {
  try {
    logger.info("--- MCM Set Root script ---");

    const config = CONFIGS[args.deployEnv];
    const rpcUrl = devnet(`https://${config.solana.rpcUrl}`);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    // Load proposal and extract data
    logger.info(`Loading data from proposal file: ${args.proposalFile}`);
    const proposal = loadProposalFile(args.proposalFile);

    // Compute root and proofs from proposal
    const { root, metadataProof, operationProofs } =
      await computeProposalRoot(proposal);

    // Extract data from proposal
    logger.info("Proposal data:");
    logger.info(`  Multisig ID: ${proposal.multisigId}`);
    logger.info(
      `  Valid Until: ${proposal.validUntil} (${new Date(proposal.validUntil * 1000).toISOString()})`
    );
    logger.info(`  Total operations: ${proposal.ixs.length}`);
    logger.info(
      `  Override previous root: ${proposal.rootMetadata.overridePreviousRoot}`
    );
    logger.info(`  Pre op count: ${proposal.rootMetadata.preOpCount}`);
    logger.info(`  Post op count: ${proposal.rootMetadata.postOpCount}`);

    logger.info(`Root: ${root}`);

    // Derive all required PDAs
    const pdas = await deriveSetRootPDAs(
      args.deployEnv,
      proposal.multisigId,
      root,
      proposal.validUntil,
      payer.address
    );

    logger.info("Derived PDAs:");
    logger.info(`  Root Signatures: ${pdas.rootSignatures}`);
    logger.info(`  Root Metadata: ${pdas.rootMetadata}`);
    logger.info(`  Seen Signed Hashes: ${pdas.seenSignedHashes}`);
    logger.info(`  Expiring Root: ${pdas.expiringRootAndOpCount}`);
    logger.info(`  Multisig Config: ${pdas.multisigConfig}`);

    // Create and send instruction
    const setRootIx = getSetRootInstruction(
      {
        // Accounts
        rootSignatures: pdas.rootSignatures,
        rootMetadata: pdas.rootMetadata,
        seenSignedHashes: pdas.seenSignedHashes,
        expiringRootAndOpCount: pdas.expiringRootAndOpCount,
        multisigConfig: pdas.multisigConfig,
        authority: payer,

        // Arguments
        multisigId: toBytes(proposal.multisigId),
        root: toBytes(root),
        validUntil: proposal.validUntil,
        chainId: proposal.rootMetadata.chainId,
        multisig: proposal.rootMetadata.multisig,
        preOpCount: proposal.rootMetadata.preOpCount,
        postOpCount: proposal.rootMetadata.postOpCount,
        overridePreviousRoot: proposal.rootMetadata.overridePreviousRoot,
        metadataProof: metadataProof.map((hash) => toBytes(hash)),
      },
      { programAddress: config.solana.mcmProgram }
    );

    logger.info("Sending set root transaction...");
    const signature = await buildAndSendTransaction(
      args.deployEnv,
      [setRootIx],
      payer
    );

    logger.success("MCM root set successfully!");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );
    logger.info("Root is now active and operations can be executed");
  } catch (error) {
    logger.error("MCM set root failed:", error);
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

async function deriveSetRootPDAs(
  deployEnv: DeployEnv,
  multisigId: Hex,
  root: Hash,
  validUntil: number,
  authorityAddress: SolanaAddress
) {
  logger.info("Deriving all required PDAs for set_root instruction...");

  const [rootSignatures] = await rootSignaturesPda(
    deployEnv,
    multisigId,
    root,
    validUntil,
    authorityAddress
  );

  const [rootMetadata] = await rootMetadataPda(deployEnv, multisigId);

  const [seenSignedHashes] = await seenSignedHashesPda(
    deployEnv,
    multisigId,
    root,
    validUntil
  );

  const [expiringRootAndOpCount] = await expiringRootAndOpCountPda(
    deployEnv,
    multisigId
  );

  const [multisigConfig] = await multisigConfigPda(deployEnv, multisigId);

  return {
    rootSignatures,
    rootMetadata,
    seenSignedHashes,
    expiringRootAndOpCount,
    multisigConfig,
  };
}

function loadProposalFile(filePath: string): Proposal {
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
