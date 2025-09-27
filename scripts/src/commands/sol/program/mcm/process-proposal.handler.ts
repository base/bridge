import { z } from "zod";
import { readFileSync } from "fs";
import { keccak256, pad, concat, toHex, type Hash, type Hex } from "viem";

import { logger } from "@internal/logger";
import { DEPLOY_ENVS } from "@internal/constants";
import {
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
} from "@internal/sol";
import {
  type Proposal,
  proposalSchema,
  computeProposalRoot,
} from "@internal/sol/mcm";
import { privateKeyToAccount } from "viem/accounts";

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
  proposalPath: z
    .string()
    .min(1, "Proposal path cannot be empty")
    .refine((path) => path.endsWith(".json"), {
      message: "Proposal file must be a JSON file",
    }),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

export async function handleProcessProposal(args: Args): Promise<void> {
  try {
    logger.info("--- MCM Process Proposal script ---");
    logger.info(`Proposal file: ${args.proposalPath}`);

    logger.info(`Deploy environment: ${args.deployEnv}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer address: ${payer.address}`);

    // Load proposal from JSON file
    const proposal = loadProposal(args.proposalPath);

    // Compute Merkle root
    const { root, metadataProof, operationProofs } =
      await computeProposalRoot(proposal);

    logger.info(`  Root: ${root}`);
    logger.info(`  Proof metadata: ${metadataProof}`);
    operationProofs.forEach((proof, index) => {
      logger.info(`  Proof operation ${index}: ${proof.join(", ")}`);
    });

    const hashToSign = computeHashToSign(root, proposal.validUntil);
    logger.success(`Hash to sign: ${hashToSign}`);

    const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as Hex);
    const sig = await account.signMessage({
      message: { raw: hashToSign },
    });
    logger.success(`Signature: ${sig}`);
  } catch (error) {
    logger.error("MCM process proposal failed:", error);
    throw error;
  }
}

function loadProposal(proposalPath: string): Proposal {
  logger.info("Loading proposal from JSON file...");

  try {
    const proposalJson = readFileSync(proposalPath, "utf8");
    const proposal = proposalSchema.parse(JSON.parse(proposalJson));
    return proposal;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON format in proposal file: ${error.message}`);
    }
    throw error;
  }
}

function computeHashToSign(root: Hash, validUntil: number) {
  const validUntilBe = toHex(validUntil, { size: 32 });
  const dataToHash = concat([root, validUntilBe]);
  return keccak256(dataToHash);
}

async function resolvePayerKeypair(payerKpArg: PayerKpArg) {
  if (payerKpArg === "config") {
    logger.info("Using Solana CLI config for payer keypair");
    return await getSolanaCliConfigKeypairSigner();
  }

  logger.info(`Using custom payer keypair: ${payerKpArg}`);
  return await getKeypairSignerFromPath(payerKpArg);
}
