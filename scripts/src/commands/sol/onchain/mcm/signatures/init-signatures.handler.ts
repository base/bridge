import { z } from "zod";
import { devnet } from "@solana/kit";
import { getInitSignaturesInstruction } from "@xenoliss/mcm-sol-client";
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
  totalSignatures: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 2))
    .refine((val) => !isNaN(val) && val > 0 && val <= 180, {
      message: "Total signatures must be between 1 and 180",
    }),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

export async function handleInitSignatures(args: Args): Promise<void> {
  try {
    logger.info("--- MCM Init Signatures script ---");

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
    const totalSignatures = args.totalSignatures;

    logger.info("Proposal data:");
    logger.info(`  Multisig ID: ${multisigId}`);
    logger.info(`  Computed Root: ${root}`);
    logger.info(
      `  Valid Until: ${validUntil} (${new Date(validUntil * 1000).toISOString()})`
    );
    logger.info(`  Total Signatures: ${totalSignatures}`);

    // Derive root signatures PDA
    const [rootSignatures] = await rootSignaturesPda(
      args.deployEnv,
      multisigId,
      root,
      validUntil,
      payer.address
    );

    logger.info(`Root Signatures PDA: ${rootSignatures}`);

    // Create init signatures instruction
    const initSignaturesIx = getInitSignaturesInstruction(
      {
        // Accounts
        signatures: rootSignatures,
        authority: payer,

        // Arguments
        multisigId: toBytes(multisigId),
        root: toBytes(root),
        validUntil: validUntil,
        totalSignatures: totalSignatures,
      },
      { programAddress: config.solana.mcmProgram }
    );

    logger.info("Sending init signatures transaction...");
    const signature = await buildAndSendTransaction(
      args.deployEnv,
      [initSignaturesIx],
      payer
    );

    logger.success("MCM signatures storage initialized successfully!");
    logger.success(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );
  } catch (error) {
    logger.error("MCM init signatures failed:", error);
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
