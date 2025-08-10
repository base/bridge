import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type Abi,
  type Hash,
} from "viem";
import { base, baseSepolia, type Chain } from "viem/chains";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

export type ChainName = "base" | "baseSepolia";

type ClientInputs = {
  chain?: Chain | ChainName;
  rpcUrl?: string;
};

type WalletInputs = ClientInputs & {
  privateKey?: Hex;
};

function resolveChain(chain?: Chain | ChainName): Chain {
  if (!chain) return baseSepolia;
  if (typeof chain === "string") {
    if (chain === "base") return base;
    if (chain === "baseSepolia") return baseSepolia;
    throw new Error(`Unsupported chain name: ${chain}`);
  }
  return chain;
}

function resolveRpcUrl({ chain, rpcUrl }: ClientInputs): string | undefined {
  if (rpcUrl) return rpcUrl;
  const resolved =
    typeof chain === "string"
      ? chain
      : chain?.id === base.id
        ? "base"
        : chain?.id === baseSepolia.id
          ? "baseSepolia"
          : undefined;
  if (resolved === "base")
    return process.env.BASE_RPC_URL ?? process.env.EVM_RPC_URL;
  if (resolved === "baseSepolia")
    return process.env.BASE_SEPOLIA_RPC_URL ?? process.env.EVM_RPC_URL;
  return process.env.EVM_RPC_URL;
}

export function getExplorerBaseUrl(
  chain: Chain | ChainName = "baseSepolia"
): string {
  const c = resolveChain(chain);
  if (c.id === base.id) return "https://basescan.org";
  if (c.id === baseSepolia.id) return "https://sepolia.basescan.org";
  return "";
}

export function getPublicClient(inputs: ClientInputs = {}) {
  const chain = resolveChain(inputs.chain);
  const rpcUrl = resolveRpcUrl({ ...inputs, chain });
  return createPublicClient({ chain, transport: http(rpcUrl) });
}

export function getWalletClient(inputs: WalletInputs = {}) {
  const chain = resolveChain(inputs.chain);
  const rpcUrl = resolveRpcUrl({ ...inputs, chain });
  const privateKey =
    inputs.privateKey ?? (process.env.EVM_PRIVATE_KEY as Hex | undefined);
  if (!privateKey) {
    throw new Error(
      "Missing EVM private key. Provide 'privateKey' or set EVM_PRIVATE_KEY in environment."
    );
  }
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });
  return { walletClient, account };
}

export async function sendTransaction(
  {
    to,
    data,
    value,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce,
  }: {
    to?: Address;
    data?: Hex;
    value?: bigint;
    gas?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    nonce?: number;
  },
  inputs: WalletInputs = {}
) {
  const chain = resolveChain(inputs.chain);
  const publicClient = getPublicClient({ chain, rpcUrl: inputs.rpcUrl });
  const { walletClient } = getWalletClient({ ...inputs, chain });

  const hash: Hash = await walletClient.sendTransaction({
    to,
    data,
    value,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const explorer = getExplorerBaseUrl(chain);
  if (explorer) {
    console.log(`✅ Transaction confirmed: ${explorer}/tx/${hash}`);
  } else {
    console.log(`✅ Transaction confirmed: ${hash}`);
  }
  return { hash, receipt };
}

export async function writeContractTx(
  {
    address,
    abi,
    functionName,
    args,
    value,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce,
  }: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
    gas?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    nonce?: number;
  },
  inputs: WalletInputs = {}
) {
  const chain = resolveChain(inputs.chain);
  const publicClient = getPublicClient({ chain, rpcUrl: inputs.rpcUrl });
  const { walletClient } = getWalletClient({ ...inputs, chain });

  const hash: Hash = await walletClient.writeContract({
    address,
    abi,
    functionName: functionName as never,
    args: (args ?? []) as never,
    value,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const explorer = getExplorerBaseUrl(chain);
  if (explorer) {
    console.log(`✅ Transaction confirmed: ${explorer}/tx/${hash}`);
  } else {
    console.log(`✅ Transaction confirmed: ${hash}`);
  }
  return { hash, receipt };
}

export function getDefaultChainFromEnv(): Chain {
  const env = (process.env.EVM_CHAIN ?? "baseSepolia").toString();
  return resolveChain((env === "base" ? "base" : "baseSepolia") as ChainName);
}

export function getAccountFromEnv(): PrivateKeyAccount {
  const pk = process.env.EVM_PRIVATE_KEY as Hex | undefined;
  if (!pk) throw new Error("EVM_PRIVATE_KEY is not set in the environment");
  return privateKeyToAccount(pk);
}
