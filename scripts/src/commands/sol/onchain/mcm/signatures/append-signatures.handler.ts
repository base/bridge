import { z } from "zod";
import { devnet } from "@solana/kit";
import { getAppendSignaturesInstruction } from "@xenoliss/mcm-sol-client";
import { isHex, toBytes, type Hash } from "viem";
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
  signatures: z
    .string()
    .transform((val) => {
      return val.split(",").map((s) => {
        const trimmed = s.trim();
        if (!isHex(trimmed) || trimmed.length !== 132) {
          throw new Error(
            "Each signature must be a 65-byte hex string (130 chars + 0x prefix)"
          );
        }
        return trimmed;
      });
    })
    .refine((val) => val.length > 0 && val.length <= 10, {
      message: "Signature batch must contain 1-10 signatures",
    }),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

export async function handleAppendSignatures(args: Args): Promise<void> {
  try {
    logger.info("--- MCM Append Signatures script ---");

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
    logger.info(`  Adding ${args.signatures.length} signatures`);

    // Derive root signatures PDA
    const [rootSignatures] = await rootSignaturesPda(
      args.deployEnv,
      multisigId,
      root,
      validUntil,
      payer.address
    );

    logger.info(`Root Signatures PDA: ${rootSignatures}`);

    // Convert signatures to the format expected by the program
    const signaturesBatch = args.signatures.map((sigHex) => {
      try {
        return decodeSignature(sigHex);
      } catch (error) {
        throw new Error(`Invalid signature ${sigHex}: ${error}`);
      }
    });

    // Create append signatures instruction
    const appendSignaturesIx = getAppendSignaturesInstruction(
      {
        // Accounts
        signatures: rootSignatures,
        authority: payer,

        // Arguments
        multisigId: toBytes(multisigId),
        root: toBytes(root),
        validUntil: validUntil,
        signaturesBatch,
      },
      { programAddress: config.solana.mcmProgram }
    );

    logger.info("Sending append signatures transaction...");
    const signature = await buildAndSendTransaction(
      args.deployEnv,
      [appendSignaturesIx],
      payer
    );

    logger.success("MCM signatures appended successfully!");
    logger.success(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );
  } catch (error) {
    logger.error("MCM append signatures failed:", error);
    throw error;
  }
}

// Function to decode 65-byte hex signature into r, s, v components
function decodeSignature(sigHex: string) {
  if (!isHex(sigHex) || sigHex.length !== 132) {
    throw new Error(
      "Signature must be a 65-byte hex string (130 chars + 0x prefix)"
    );
  }

  const sigBytes = toBytes(sigHex as Hash);
  const r = sigBytes.slice(0, 32);
  const s = sigBytes.slice(32, 64);
  const v = sigBytes[64]!;

  return { v, r, s };
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
