import { z } from "zod";
import { devnet } from "@solana/kit";
import { getClearSignaturesInstruction } from "@xenoliss/mcm-sol-client";
import { toBytes } from "viem";
import { readFileSync } from "fs";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
} from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS } from "@internal/constants";
import {
  rootSignaturesPda,
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
  proposalFile: z.string().min(1, "Proposal file path is required"),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

export async function handleClearSignatures(args: Args): Promise<void> {
  try {
    logger.info("--- MCM Clear Signatures script ---");

    const config = CONFIGS[args.deployEnv];
    const rpcUrl = devnet(`https://${config.solana.rpcUrl}`);
    logger.info(`RPC URL: ${rpcUrl}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    // Load proposal and extract data
    logger.info(`Loading data from proposal file: ${args.proposalFile}`);
    const proposal = loadProposalFile(args.proposalFile);

    // Compute root from proposal
    const { root } = await computeProposalRoot(proposal);

    // Extract data from proposal
    const multisigId = proposal.multisigId;
    const validUntil = proposal.validUntil;

    logger.info("Proposal data:");
    logger.info(`  Multisig ID: ${multisigId}`);
    logger.info(`  Computed Root: ${root}`);
    logger.info(
      `  Valid Until: ${validUntil} (${new Date(validUntil * 1000).toISOString()})`
    );

    // Derive root signatures PDA
    const [rootSignatures] = await rootSignaturesPda(
      args.deployEnv,
      multisigId,
      root,
      validUntil,
      payer.address
    );

    logger.info(`Root Signatures PDA: ${rootSignatures}`);

    // Create clear signatures instruction
    const clearSignaturesIx = getClearSignaturesInstruction(
      {
        // Accounts
        signatures: rootSignatures,
        authority: payer,

        // Arguments
        multisigId: toBytes(multisigId),
        root: toBytes(root),
        validUntil: validUntil,
      },
      { programAddress: config.solana.mcmProgram }
    );

    logger.info("Sending clear signatures transaction...");
    const signature = await buildAndSendTransaction(
      args.deployEnv,
      [clearSignaturesIx],
      payer
    );

    logger.success("MCM signatures cleared successfully!");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );
    logger.info("Signature storage account closed and can be reinitialized");
  } catch (error) {
    logger.error("MCM clear signatures failed:", error);
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
