import { z } from "zod";
import { devnet } from "@solana/kit";
import { getSetConfigInstruction } from "@xenoliss/mcm-sol-client";
import { isAddress, getAddress, isHash, type Hex, toBytes } from "viem";
import { confirm, isCancel, cancel } from "@clack/prompts";

import { logger } from "@internal/logger";
import {
  buildAndSendTransaction,
  getSolanaCliConfigKeypairSigner,
  getKeypairSignerFromPath,
} from "@internal/sol";
import { CONFIGS, DEPLOY_ENVS } from "@internal/constants";
import {
  multisigConfigPda,
  rootMetadataPda,
  expiringRootAndOpCountPda,
  multisigConfigSignersPda,
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
  multisigId: z
    .string()
    .refine((val) => isHash(val), {
      message: "Multisig ID must be a 32-byte hex string",
    })
    .transform((val) => val as Hex),
  levels: z
    .string()
    .min(1, "Levels cannot be empty")
    .transform(parseNestedStructure),
  clearRoot: z.boolean().default(false),
});

type Args = z.infer<typeof argsSchema>;
type PayerKpArg = Args["payerKp"];

export async function handleSetConfig(args: Args): Promise<void> {
  try {
    logger.info("--- MCM Set Config script ---");

    const config = CONFIGS[args.deployEnv];
    const rpcUrl = devnet(`https://${config.solana.rpcUrl}`);
    logger.info(`RPC URL: ${rpcUrl}`);

    const payer = await resolvePayerKeypair(args.payerKp);
    logger.info(`Payer: ${payer.address}`);

    logger.info(`Multisig ID: "${args.multisigId}"`);
    logger.info(`Clear root: ${args.clearRoot}`);

    // Display the parsed tree structure for visual verification
    logger.debug(`Parsed multisig structure:`);
    const treeLines = displayParsedStructure(args.levels);
    treeLines.forEach((line) => logger.debug(line));

    logger.info(`MCM arrays:`);
    logger.info(`  - Multisigs: ${args.levels.multisigs.length}`);
    logger.info(`  - Signers: ${args.levels.signers.length}`);
    logger.info(`  - Signer groups: [${args.levels.signerGroups.join(", ")}]`);
    logger.info(
      `  - Group quorums: [${args.levels.groupQuorums.slice(0, 8).join(", ")}...]`
    );
    logger.info(
      `  - Group parents: [${args.levels.groupParents.slice(0, 8).join(", ")}...]`
    );

    const [multisigConfig] = await multisigConfigPda(
      args.deployEnv,
      args.multisigId
    );
    const [configSigners] = await multisigConfigSignersPda(
      args.deployEnv,
      args.multisigId
    );
    const [rootMetadata] = await rootMetadataPda(
      args.deployEnv,
      args.multisigId
    );
    const [expiringRootAndOpCount] = await expiringRootAndOpCountPda(
      args.deployEnv,
      args.multisigId
    );

    logger.info(`Multisig Config PDA: ${multisigConfig}`);
    logger.info(`Config Signers PDA: ${configSigners}`);
    logger.info(`Root Metadata PDA: ${rootMetadata}`);
    logger.info(`Expiring Root PDA: ${expiringRootAndOpCount}`);

    const setConfigIx = getSetConfigInstruction(
      {
        // Accounts
        multisigConfig,
        configSigners,
        rootMetadata,
        expiringRootAndOpCount,
        authority: payer,

        // Arguments
        multisigId: toBytes(args.multisigId),
        signerGroups: new Uint8Array(args.levels.signerGroups),
        groupQuorums: new Uint8Array(args.levels.groupQuorums),
        groupParents: new Uint8Array(args.levels.groupParents),
        clearRoot: args.clearRoot,
      },
      { programAddress: config.solana.mcmProgram }
    );

    // Ask for confirmation before sending the transaction
    const shouldProceed = await confirm({
      message: "Send the MCM set-config transaction?",
      initialValue: false,
    });

    if (isCancel(shouldProceed)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (!shouldProceed) {
      logger.info("Transaction cancelled by user.");
      return;
    }

    logger.info("Sending set config transaction...");
    const signature = await buildAndSendTransaction(
      args.deployEnv,
      [setConfigIx],
      payer
    );

    logger.success("MCM configuration set successfully!");
    logger.info(
      `Transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
    );
    logger.info("Multisig is now configured and ready for root setting");
  } catch (error) {
    logger.error("MCM set config failed:", error);
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

type MultisigItem = {
  type: "multisig";
  name: string;
  quorum: { required: number; total: number };
  groupId: number;
};

type SignerItem = {
  type: "signer";
  address: string;
  groupId: number;
};

type ParsedStructure = {
  multisigs: MultisigItem[];
  signers: SignerItem[];
  signerGroups: number[];
  groupQuorums: number[];
  groupParents: number[];
};

function parseNestedStructure(input: string): ParsedStructure {
  const multisigs: MultisigItem[] = [];
  const signers: SignerItem[] = [];
  const signerGroups: number[] = [];
  const groupQuorums = new Array(32).fill(0);
  const groupParents = new Array(32).fill(0);
  const groupIdCounter = { value: 0 };

  function parseNode(input: string, parentGroupId: number): void {
    input = input.trim();

    if (input.startsWith("m:")) {
      const parenIndex = input.indexOf("(");
      const multisigPart =
        parenIndex !== -1 ? input.substring(0, parenIndex) : input;
      const childrenPart =
        parenIndex !== -1
          ? input.substring(parenIndex + 1, input.lastIndexOf(")"))
          : "";

      const [, name, quorumStr] = multisigPart.split(":");
      if (!name || !quorumStr)
        throw new Error(`Invalid multisig format: ${multisigPart}`);

      const [requiredStr, totalStr] = quorumStr.split("o");
      const required = Number(requiredStr);
      const total = Number(totalStr);
      if (isNaN(required) || isNaN(total))
        throw new Error(`Invalid quorum: ${quorumStr}`);

      // Only multisigs get group IDs - sequential numbering
      const groupId = groupIdCounter.value++;
      multisigs.push({
        type: "multisig",
        name,
        quorum: { required, total },
        groupId,
      });
      groupQuorums[groupId] = required;
      // Root group (groupId=0) points to itself, others point to their parent
      groupParents[groupId] = parentGroupId === -1 ? groupId : parentGroupId;

      if (childrenPart) {
        splitTopLevel(childrenPart).forEach((child) =>
          parseNode(child.trim(), groupId)
        );
      }
    } else if (input.startsWith("s:")) {
      const address = input.slice(2);
      if (!isAddress(address)) throw new Error(`Invalid address: ${address}`);

      // Signers don't get group IDs - they belong to their parent's group
      // Handle case where root has direct signers (parentGroupId = -1)
      const signerGroup = parentGroupId === -1 ? 0 : parentGroupId;
      signers.push({
        type: "signer",
        address: getAddress(address),
        groupId: signerGroup,
      });
      signerGroups.push(signerGroup);
    } else {
      throw new Error(`Invalid format: ${input}. Must start with m: or s:`);
    }
  }

  // Start parsing with the root as group 0, but no parent
  parseNode(input, -1); // Use -1 to indicate "no parent" for root
  return { multisigs, signers, signerGroups, groupQuorums, groupParents };
}

function splitTopLevel(input: string): string[] {
  const result: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of input) {
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) {
      if (current.trim()) result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) result.push(current.trim());
  return result;
}

function displayParsedStructure(parsed: ParsedStructure): string[] {
  const lines: string[] = [];
  const visitedGroups = new Set<number>();

  function displayGroup(groupId: number, indent = ""): void {
    // Prevent infinite recursion
    if (visitedGroups.has(groupId)) {
      lines.push(`${indent}└── [CIRCULAR REFERENCE to group ${groupId}]`);
      return;
    }
    visitedGroups.add(groupId);

    // Find the multisig for this group
    const multisig = parsed.multisigs.find((m) => m.groupId === groupId);
    if (multisig && indent === "") {
      // Root multisig
      lines.push(
        `${multisig.name}:${multisig.quorum.required}o${multisig.quorum.total} (group ${groupId})`
      );
    }

    // Get all children of this group (signers and child multisigs)
    const signersInGroup = parsed.signers.filter(
      (_, i) => parsed.signerGroups[i] === groupId
    );
    const childMultisigs = parsed.multisigs.filter(
      (m) => parsed.groupParents[m.groupId] === groupId && m.groupId !== groupId
    );

    const allChildren = [
      ...signersInGroup.map((s) => ({ type: "signer" as const, item: s })),
      ...childMultisigs.map((m) => ({ type: "multisig" as const, item: m })),
    ];

    allChildren.forEach((child, i) => {
      const isLast = i === allChildren.length - 1;
      const prefix = isLast ? "└── " : "├── ";
      const nextIndent = indent + (isLast ? "    " : "│   ");

      if (child.type === "signer") {
        const signer = child.item as SignerItem;
        lines.push(
          `${indent}${prefix}${signer.address.slice(0, 8)}...${signer.address.slice(-4)}`
        );
      } else {
        const ms = child.item as MultisigItem;
        lines.push(
          `${indent}${prefix}${ms.name}:${ms.quorum.required}o${ms.quorum.total} (group ${ms.groupId})`
        );
        displayGroup(ms.groupId, nextIndent);
      }
    });

    visitedGroups.delete(groupId); // Allow revisiting in different branches
  }

  displayGroup(0);
  return lines;
}
