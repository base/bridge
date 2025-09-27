import { CONFIGS, type DeployEnv } from "@internal/constants";
import {
  AccountRole,
  getAddressEncoder,
  getProgramDerivedAddress,
  isSignerRole,
  isAddress as isSolanaAddress,
  isWritableRole,
  address as solanaAddress,
  type AccountMeta,
  type Address as SolanaAddress,
} from "@solana/kit";
import {
  isHex,
  toHex,
  pad,
  type Hex,
  concat,
  keccak256,
  type Hash,
  isHash,
  toBytes,
} from "viem";
import { z } from "zod";

// Proposal schema
const accountSchema = z.object({
  address: z
    .string()
    .refine((val) => isSolanaAddress(val), {
      message: "Pubkey must be a valid Solana address",
    })
    .transform((val) => solanaAddress(val)),
  role: z.enum(AccountRole),
});

const accountSchemaWithMetadata = accountSchema.extend({
  description: z.string().optional(),
});

const ixSchema = z.object({
  programAddress: z
    .string()
    .refine((val) => isSolanaAddress(val), {
      message: "Program address must be a valid Solana address",
    })
    .transform((val) => solanaAddress(val)),
  data: z
    .string()
    .refine((val) => isHex(val), {
      message: "Instruction data must be a valid hex string",
    })
    .transform((val) => val as Hex),
  accounts: z.array(accountSchemaWithMetadata),
});

const ixSchemaWithMetadata = ixSchema.extend({
  program: z.string().optional(),
  description: z.string().optional(),
});

const rootMetadataSchema = z
  .object({
    chainId: z.number(),
    multisig: z
      .string()
      .refine((val) => isSolanaAddress(val), {
        message: "Multisig must be a valid Solana address",
      })
      .transform((val) => solanaAddress(val)),
    preOpCount: z.number(),
    postOpCount: z.number(),
    overridePreviousRoot: z.boolean(),
  })
  .refine((val) => val.preOpCount <= val.postOpCount, {
    message: "Pre op count must be less than or equal to post op count",
  });

type RootMetadata = z.infer<typeof rootMetadataSchema>;

export const proposalSchema = z.object({
  multisigId: z
    .string()
    .refine((val) => isHash(val), {
      message: "Multisig ID must be a 32-byte hex string",
    })
    .transform((val) => val as Hex),
  validUntil: z.number(),
  ixs: z.array(ixSchemaWithMetadata),
  rootMetadata: rootMetadataSchema,
});

export type Proposal = z.infer<typeof proposalSchema>;

// PDA seeds
export const SIGNER_SEED = Buffer.from("multisig_signer");
export const CONFIG_SEED = Buffer.from("multisig_config");
export const CONFIG_SIGNERS_SEED = Buffer.from("multisig_config_signers");
export const ROOT_METADATA_SEED = Buffer.from("root_metadata");
export const ROOT_SIGNATURES_SEED = Buffer.from("root_signatures");

export const EXPIRING_ROOT_AND_OP_COUNT_SEED = Buffer.from(
  "expiring_root_and_op_count"
);
export const SEEN_SIGNED_HASHES_SEED = Buffer.from("seen_signed_hashes");

// Domain separators for Merkle tree leaf hashing
export const MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA = Uint8Array.from([
  0x47, 0xfd, 0xed, 0x70, 0x90, 0x1d, 0x27, 0x3, 0x83, 0x94, 0xdb, 0x90, 0x5a,
  0x72, 0x56, 0x3c, 0xad, 0x6f, 0x7, 0x58, 0x1d, 0xbc, 0xdd, 0x14, 0x72, 0xcc,
  0xd2, 0xf7, 0x42, 0xaf, 0x63, 0x60,
]);

export const MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_OP = Uint8Array.from([
  0xfb, 0x98, 0x81, 0x6f, 0xf3, 0xc5, 0x13, 0x8a, 0x68, 0xab, 0xfd, 0x40, 0xb8,
  0xd8, 0xfb, 0xc2, 0x29, 0x72, 0xfe, 0xa1, 0xdd, 0x89, 0x75, 0x73, 0x31, 0x32,
  0x7e, 0x6e, 0xa, 0x94, 0x40, 0xb7,
]);

// PDAs helpers

export async function multisigSignerPda(deployEnv: DeployEnv, multisigId: Hex) {
  const multisigBytes = toBytes(pad(multisigId, { size: 32 }));

  return await getProgramDerivedAddress({
    programAddress: CONFIGS[deployEnv].solana.mcmProgram,
    seeds: [SIGNER_SEED, multisigBytes],
  });
}

export async function multisigConfigPda(deployEnv: DeployEnv, multisigId: Hex) {
  const multisigBytes = toBytes(pad(multisigId, { size: 32 }));

  return await getProgramDerivedAddress({
    programAddress: CONFIGS[deployEnv].solana.mcmProgram,
    seeds: [CONFIG_SEED, multisigBytes],
  });
}

export async function multisigConfigSignersPda(
  deployEnv: DeployEnv,
  multisigId: Hex
) {
  const multisigBytes = toBytes(pad(multisigId, { size: 32 }));

  return await getProgramDerivedAddress({
    programAddress: CONFIGS[deployEnv].solana.mcmProgram,
    seeds: [CONFIG_SIGNERS_SEED, multisigBytes],
  });
}

export async function rootMetadataPda(deployEnv: DeployEnv, multisigId: Hex) {
  const multisigBytes = toBytes(pad(multisigId, { size: 32 }));

  return await getProgramDerivedAddress({
    programAddress: CONFIGS[deployEnv].solana.mcmProgram,
    seeds: [ROOT_METADATA_SEED, multisigBytes],
  });
}

export async function expiringRootAndOpCountPda(
  deployEnv: DeployEnv,
  multisigId: Hex
) {
  const multisigBytes = toBytes(pad(multisigId, { size: 32 }));

  return await getProgramDerivedAddress({
    programAddress: CONFIGS[deployEnv].solana.mcmProgram,
    seeds: [EXPIRING_ROOT_AND_OP_COUNT_SEED, multisigBytes],
  });
}

export async function rootSignaturesPda(
  deployEnv: DeployEnv,
  multisigId: Hex,
  root: Hash,
  validUntil: number,
  authority: SolanaAddress
) {
  const multisigBytes = toBytes(pad(multisigId, { size: 32 }));
  const rootBytes = toBytes(pad(root, { size: 32 }));

  const validUnillLeBytes = Buffer.alloc(4);
  validUnillLeBytes.writeUInt32LE(validUntil, 0);

  const authorityBytes = getAddressEncoder().encode(authority);

  return await getProgramDerivedAddress({
    programAddress: CONFIGS[deployEnv].solana.mcmProgram,
    seeds: [
      ROOT_SIGNATURES_SEED,
      multisigBytes,
      rootBytes,
      validUnillLeBytes,
      authorityBytes,
    ],
  });
}

export async function seenSignedHashesPda(
  deployEnv: DeployEnv,
  multisigId: Hex,
  root: Hash,
  validUntil: number
) {
  const multisigBytes = toBytes(pad(multisigId, { size: 32 }));
  const rootBytes = toBytes(pad(root, { size: 32 }));

  const validUnillLeBytes = Buffer.alloc(4);
  validUnillLeBytes.writeUInt32LE(validUntil, 0);

  return await getProgramDerivedAddress({
    programAddress: CONFIGS[deployEnv].solana.mcmProgram,
    seeds: [
      SEEN_SIGNED_HASHES_SEED,
      multisigBytes,
      rootBytes,
      validUnillLeBytes,
    ],
  });
}

// Merkle tree helpers

export async function computeProposalRoot(proposal: Proposal) {
  // Step 1: Compute metadata leaf hash
  const metadataLeaf = computeMetadataLeafHash(proposal.rootMetadata);

  // Step 2: Compute operations leafs hashes
  const operationsData = proposal.ixs.map((ix, i) => {
    return {
      chainId: proposal.rootMetadata.chainId,
      multisig: proposal.rootMetadata.multisig,
      nonce: proposal.rootMetadata.preOpCount + i,
      to: ix.programAddress,
      data: ix.data,
      remainingAccounts: ix.accounts,
    };
  });

  const operationsLeafs = operationsData.map((operationData) => {
    return computeOperationLeafHash(operationData);
  });

  // Step 3: Build Merkle tree with proofs
  const { root, proofs } = buildMerkleTreeFromLeaves([
    metadataLeaf,
    ...operationsLeafs,
  ]);

  const [metadataProof, ...operationProofs] = proofs;

  return { root, metadataProof: metadataProof!, operationProofs };
}

// Internals

function computeMetadataLeafHash(rootMetadata: RootMetadata) {
  const { chainId, multisig, preOpCount, postOpCount, overridePreviousRoot } =
    rootMetadata;

  const chainIdLeBytes = Buffer.alloc(8);
  chainIdLeBytes.writeBigUInt64LE(BigInt(chainId));
  const chainIdHex = pad(toHex(chainIdLeBytes), { size: 32 });

  const preOpCountLeBytes = Buffer.alloc(8);
  preOpCountLeBytes.writeBigUInt64LE(BigInt(preOpCount));
  const preOpCountHex = pad(toHex(preOpCountLeBytes), { size: 32 });

  const postOpCountLeBytes = Buffer.alloc(8);
  postOpCountLeBytes.writeBigUInt64LE(BigInt(postOpCount));
  const postOpCountHex = pad(toHex(postOpCountLeBytes), { size: 32 });

  const overridePreviousRootHex = pad(overridePreviousRoot ? "0x01" : "0x00", {
    size: 32,
  });

  const multisigHex = toHex(getAddressEncoder().encode(multisig) as Uint8Array);

  const dataToHash = concat([
    toHex(MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_METADATA),
    chainIdHex,
    multisigHex,
    preOpCountHex,
    postOpCountHex,
    overridePreviousRootHex,
  ]);

  return keccak256(dataToHash);
}

type OperationData = {
  chainId: bigint | number;
  multisig: SolanaAddress;
  nonce: bigint | number;
  to: SolanaAddress;
  data: Hex;
  remainingAccounts: AccountMeta[];
};

function computeOperationLeafHash(op: OperationData) {
  const { chainId, multisig, nonce, to, data, remainingAccounts } = op;

  const chainIdLeBytes = Buffer.alloc(8);
  chainIdLeBytes.writeBigUInt64LE(BigInt(chainId));
  const chainIdHex = pad(toHex(chainIdLeBytes), { size: 32 });

  const nonceLeBytes = Buffer.alloc(8);
  nonceLeBytes.writeBigUInt64LE(BigInt(nonce));
  const nonceHex = pad(toHex(nonceLeBytes), { size: 32 });

  const dataLenLeBytes = Buffer.alloc(8);
  dataLenLeBytes.writeBigUInt64LE(BigInt(toBytes(data).length));
  const dataLenHex = pad(toHex(dataLenLeBytes), { size: 32 });

  const remainingAccountsLenLeBytes = Buffer.alloc(8);
  remainingAccountsLenLeBytes.writeBigUInt64LE(
    BigInt(remainingAccounts.length)
  );
  const remainingAccountsLenHex = pad(toHex(remainingAccountsLenLeBytes), {
    size: 32,
  });

  const multisigHex = toHex(getAddressEncoder().encode(multisig) as Uint8Array);

  const toHex_ = toHex(getAddressEncoder().encode(to) as Uint8Array);

  const serializedAccounts = serializeRemainingAccounts(remainingAccounts);

  const dataToHash = concat([
    toHex(MANY_CHAIN_MULTI_SIG_DOMAIN_SEPARATOR_OP),
    chainIdHex,
    multisigHex,
    nonceHex,
    toHex_,
    dataLenHex,
    data,
    remainingAccountsLenHex,
    serializedAccounts,
  ]);

  return keccak256(dataToHash);
}

function serializeRemainingAccounts(
  accounts: OperationData["remainingAccounts"]
) {
  if (accounts.length === 0) {
    return "0x";
  }

  const serializedParts = accounts.map((account) => {
    const flags =
      (Number(isSignerRole(account.role)) << 1) +
      Number(isWritableRole(account.role));

    const addressHex = toHex(
      getAddressEncoder().encode(account.address) as Uint8Array
    );

    return concat([addressHex, toHex(flags, { size: 1 })]);
  });

  return concat(serializedParts);
}

function buildMerkleTreeFromLeaves(leaves: Hash[]) {
  if (leaves.length === 0) {
    throw new Error("Cannot build Merkle tree with no leaves");
  }

  if (leaves.length === 1) {
    return {
      root: leaves[0]!,
      proofs: [[]],
    };
  }

  // Build the full tree dynamically
  const tree: Hash[][] = [leaves];
  let currentLevel = [...leaves];

  // Build tree bottom-up, handling odd numbers like MCM
  while (currentLevel.length > 1) {
    const nextLevel: Hash[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        // Pair exists - hash both
        const left = currentLevel[i]!;
        const right = currentLevel[i + 1]!;
        nextLevel.push(hashPair(left, right));
      } else {
        // Odd number - promote the last element up
        nextLevel.push(currentLevel[i]!);
      }
    }

    tree.push(nextLevel);
    currentLevel = nextLevel;
  }

  // Generate proofs for each leaf
  const proofs = leaves.map((_, i) => generateMerkleProof(tree, i));

  return {
    root: currentLevel[0]!,
    proofs,
  };
}

export function hashPair(a: Hash, b: Hash) {
  if (!isHash(a) || !isHash(b)) {
    throw new Error("a and b must be hashes");
  }

  const [left, right] = a < b ? [a, b] : [b, a];
  const data = concat([left, right]);
  return keccak256(data);
}

function generateMerkleProof(tree: Hash[][], leafIndex: number): Hash[] {
  const proof: Hash[] = [];
  let currentIndex = leafIndex;

  // Traverse up the tree to collect siblings
  for (let level = 0; level < tree.length - 1; level++) {
    const currentLevelNodes = tree[level]!;
    const siblingIndex =
      currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;

    // Add sibling to proof if it exists
    if (siblingIndex < currentLevelNodes.length) {
      proof.push(currentLevelNodes[siblingIndex]!);
    }

    // Move to parent index in next level
    currentIndex = Math.floor(currentIndex / 2);
  }

  return proof;
}
