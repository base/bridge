import { z } from "zod";
import { writeFileSync } from "fs";
import { join } from "path";
import {
  devnet,
  createSolanaRpc,
  isAddress as isSolanaAddress,
  address as solanaAddress,
  type Address as SolanaAddress,
} from "@solana/kit";
import {
  fetchExpiringRootAndOpCount,
  fetchMultisigConfig,
} from "@xenoliss/mcm-sol-client";
import {
  getUpgradeInstruction,
  getUpgradeInstructionDataEncoder,
} from "@xenoliss/solana-loader-v3-client";
import { isHash, toHex, type Hex } from "viem";

import { logger } from "@internal/logger";
import { CONFIGS, DEPLOY_ENVS, type DeployEnv } from "@internal/constants";
import {
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
} from "@internal/sol";
import {
  expiringRootAndOpCountPda,
  multisigConfigPda,
  multisigSignerPda,
  type Proposal,
} from "@internal/sol/mcm";
import { programDataPda } from "@internal/sol/loader-v3";

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
  multisigId: z
    .string()
    .refine((val) => isHash(val), {
      message: "Multisig ID must be a 32-byte hex string",
    })
    .transform((val) => val as Hex),
  bufferAddress: z
    .string()
    .refine((addr) => isSolanaAddress(addr), {
      message: "Invalid buffer address format",
    })
    .transform((addr) => solanaAddress(addr)),
  spillAddress: z
    .string()
    .refine((addr) => isSolanaAddress(addr), {
      message: "Invalid spill address format",
    })
    .transform((addr) => solanaAddress(addr))
    .optional(),
  overridePreviousRoot: z.boolean().default(false),
  validUntil: z
    .string()
    .transform((val) => parseInt(val))
    .refine((val) => !isNaN(val) && val > 0, {
      message: "Valid until must be a positive timestamp",
    })
    .refine((val) => val > Math.floor(Date.now() / 1000), {
      message: "Valid until must be in the future",
    }),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

export async function handleProposeUpgrade(args: Args): Promise<void> {
  try {
    logger.info("--- MCM Propose Upgrade script ---");
    logger.info(`Multisig ID: "${args.multisigId}"`);
    logger.info(`Buffer address: ${args.bufferAddress}`);
    logger.info(`Spill address: ${args.spillAddress || "use payer address"}`);
    logger.info(`Override previous root: ${args.overridePreviousRoot}`);
    logger.info(
      `Valid until: ${args.validUntil} (${new Date(args.validUntil * 1000).toISOString()})`
    );

    const config = CONFIGS[args.deployEnv];
    const rpcUrl = devnet(`https://${config.solana.rpcUrl}`);
    const rpc = createSolanaRpc(rpcUrl);
    logger.info(`RPC URL: ${rpcUrl}`);

    // Hardcode to bridge program for BPF Loader v3 upgrades
    const programAddress = solanaAddress(
      "5TbW9CEvuid2i4LaSxEPVVSfdbqKDgfwRkQjVncaEAmw"
    );
    logger.info(`Target program: ${programAddress}`);

    const payer = await resolvePayerKeypair(args.payerKp);

    // Step 1: Read current multisig state
    const multisigState = await readMultisigState(
      args.deployEnv,
      rpc,
      args.multisigId
    );

    // Step 2: Generate upgrade instruction
    const upgradeInstruction = await generateUpgradeInstruction(
      args.deployEnv,
      programAddress,
      args.bufferAddress,
      args.spillAddress || payer.address,
      args.multisigId
    );

    // Step 3: Create root metadata
    const rootMetadata = createRootMetadata(
      multisigState,
      args.overridePreviousRoot
    );

    // Step 4: Create proposal
    const proposal = createProposal(
      upgradeInstruction,
      rootMetadata,
      args.validUntil,
      args.multisigId
    );

    // Step 5: Save proposal to JSON file
    const outputPath = saveProposalToFile(args.multisigId, proposal);

    logger.success("MCM upgrade proposal created successfully!");
    logger.success(`Output file: ${outputPath}`);
  } catch (error) {
    logger.error("MCM propose upgrade failed:", error);
    throw error;
  }
}

async function readMultisigState(
  deployEnv: DeployEnv,
  rpc: ReturnType<typeof createSolanaRpc>,
  multisigId: Hex
) {
  logger.info("Step 1: Reading current multisig state from chain...");

  // Derive PDAs
  const [expiringRootAndOpCountAddress] = await expiringRootAndOpCountPda(
    deployEnv,
    multisigId
  );
  const [multisigConfigAddress] = await multisigConfigPda(
    deployEnv,
    multisigId
  );

  logger.info(`ExpiringRootAndOpCount PDA: ${expiringRootAndOpCountAddress}`);
  logger.info(`Multisig Config PDA: ${multisigConfigAddress}`);

  // Fetch account data
  const [expiringRootAndOpCountAccount, multisigConfigAccount] =
    await Promise.all([
      fetchExpiringRootAndOpCount(rpc, expiringRootAndOpCountAddress),
      fetchMultisigConfig(rpc, multisigConfigAddress),
    ]);

  const currentOpCount = expiringRootAndOpCountAccount.data.opCount;
  const chainId = multisigConfigAccount.data.chainId;

  logger.info(`Current op_count: ${currentOpCount}`);
  logger.info(`Chain ID: ${chainId} (from multisig config)`);

  return {
    multisigConfigAddress,
    expiringRootAndOpCountAddress,
    currentOpCount,
    chainId,
  };
}

async function generateUpgradeInstruction(
  deployEnv: DeployEnv,
  programAddress: SolanaAddress,
  bufferAddress: SolanaAddress,
  spillAddress: SolanaAddress,
  multisigId: Hex
) {
  logger.info("Step 2: Generating upgrade instruction...");

  logger.info(`Program to upgrade: ${programAddress}`);
  logger.info(`Buffer address: ${bufferAddress}`);
  logger.info(`Spill address: ${spillAddress}`);

  // Derive program data PDA
  const [programDataAddress] = await programDataPda(
    solanaAddress(programAddress)
  );
  logger.info(`Program data address: ${programDataAddress}`);

  // Derive multisig signer PDA (will be the authority)
  const [multisigSignerAddress] = await multisigSignerPda(
    deployEnv,
    multisigId
  );
  logger.info(`Multisig signer (authority): ${multisigSignerAddress}`);

  logger.info(`Upgrade instruction accounts:`);
  logger.info(`  programDataAccount: ${programDataAddress}`);
  logger.info(`  programAccount: ${solanaAddress(programAddress)}`);
  logger.info(`  bufferAccount: ${solanaAddress(bufferAddress)}`);
  logger.info(`  spillAccount: ${solanaAddress(spillAddress)}`);
  logger.info(`  authority: ${multisigSignerAddress}`);

  // Create the upgrade instruction
  const upgradeInstruction = getUpgradeInstruction({
    // Accounts
    programDataAccount: programDataAddress,
    programAccount: solanaAddress(programAddress),
    bufferAccount: solanaAddress(bufferAddress),
    spillAccount: solanaAddress(spillAddress),
    authority: multisigSignerAddress as any, // MCM will handle the signing
  });

  return upgradeInstruction;
}

function createRootMetadata(
  multisigState: Awaited<ReturnType<typeof readMultisigState>>,
  overridePreviousRoot: boolean
) {
  logger.info("Step 3: Creating root metadata...");

  // Current op count from blockchain state
  const preOpCount = Number(multisigState.currentOpCount);

  // We're adding exactly 1 operation (the upgrade instruction)
  const postOpCount = preOpCount + 1;

  logger.info(`Current op count from chain: ${preOpCount}`);
  logger.info(`Will increment to: ${postOpCount} (adding 1 upgrade operation)`);

  // Validate override logic
  if (!overridePreviousRoot) {
    logger.info(
      "Override previous root: false - ensuring no pending operations"
    );
  } else {
    logger.warn(
      "Override previous root: true - will invalidate any pending operations"
    );
  }

  const rootMetadata = {
    chainId: Number(multisigState.chainId),
    multisig: multisigState.multisigConfigAddress,
    preOpCount,
    postOpCount,
    overridePreviousRoot,
  };

  logger.info("Root metadata created:");
  logger.info(`  Chain ID: ${rootMetadata.chainId}`);
  logger.info(`  Multisig: ${rootMetadata.multisig}`);
  logger.info(`  Pre op count: ${rootMetadata.preOpCount}`);
  logger.info(`  Post op count: ${rootMetadata.postOpCount}`);
  logger.info(`  Override previous root: ${rootMetadata.overridePreviousRoot}`);

  return rootMetadata;
}

function createProposal(
  upgradeInstruction: Awaited<ReturnType<typeof generateUpgradeInstruction>>,
  rootMetadata: ReturnType<typeof createRootMetadata>,
  validUntil: number,
  multisigId: Hex
): Proposal {
  logger.info("Step 4: Creating proposal...");

  // Encode instruction data
  const encodedInstructionData = toHex(
    getUpgradeInstructionDataEncoder().encode(upgradeInstruction) as Uint8Array
  );

  // const accountMetadata = [
  //   "ProgramData (https://github.com/solana-program/loader-v3/blob/main/program/src/instruction.rs#L176)",
  //   "Program (https://github.com/solana-program/loader-v3/blob/main/program/src/instruction.rs#L177)",
  //   "Buffer (https://github.com/solana-program/loader-v3/blob/main/program/src/instruction.rs#L178)",
  //   "Spill (https://github.com/solana-program/loader-v3/blob/main/program/src/instruction.rs#L179)",
  //   "Rent (https://github.com/solana-program/loader-v3/blob/main/program/src/instruction.rs#L180)",
  //   "Clock (https://github.com/solana-program/loader-v3/blob/main/program/src/instruction.rs#L181)",
  //   "Authority (https://github.com/solana-program/loader-v3/blob/main/program/src/instruction.rs#L182)",
  // ];

  const proposal: Proposal = {
    multisigId,
    validUntil,
    ixs: [
      {
        programAddress: upgradeInstruction.programAddress,
        data: encodedInstructionData,
        accounts: upgradeInstruction.accounts,
        program: "BPF Loader v3",
        description: "Program upgrade instruction",
      },
    ],
    rootMetadata,
  };

  logger.info("Proposal created:");
  logger.info(`  Multisig ID: ${multisigId}`);
  logger.info(
    `  Valid until: ${validUntil} (${new Date(validUntil * 1000).toISOString()})`
  );
  logger.info(`  Instructions: ${proposal.ixs.length}`);
  logger.info(`  Description: ${proposal.ixs[0]?.description}`);

  return proposal;
}

function saveProposalToFile(multisigId: string, proposal: Proposal): string {
  logger.info("Step 5: Saving proposal to JSON file...");

  const outputPath = join(
    process.cwd(),
    `mcm-proposal-${multisigId}-${Date.now()}.json`
  );
  writeFileSync(outputPath, JSON.stringify(proposal, null, 2));

  return outputPath;
}

async function resolvePayerKeypair(payerKpArg: PayerKpArg) {
  if (payerKpArg === "config") {
    logger.info("Using Solana CLI config for payer keypair");
    return await getSolanaCliConfigKeypairSigner();
  }

  logger.info(`Using custom payer keypair: ${payerKpArg}`);
  return await getKeypairSignerFromPath(payerKpArg);
}
