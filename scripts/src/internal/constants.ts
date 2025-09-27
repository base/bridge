import { address, type Address as SolanaAddress } from "@solana/kit";
import type { Chain, Address as EvmAddress } from "viem";
import { baseSepolia } from "viem/chains";

export const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export const DEPLOY_ENVS = ["testnet-alpha", "testnet-prod"] as const;

export type DeployEnv = (typeof DEPLOY_ENVS)[number];

export type Config = {
  solana: {
    cluster: string;
    rpcUrl: string;

    // Keypairs
    deployerKpPath: string;
    bridgeKpPath: string;
    baseRelayerKpPath: string;

    // Base oracle signers
    evmLocalKey: EvmAddress;
    evmKeychainKey: EvmAddress;

    // Programs
    bridgeProgram: SolanaAddress;
    baseRelayerProgram: SolanaAddress;

    // SPLs
    spl: SolanaAddress;
    wEth: SolanaAddress;
    wErc20: SolanaAddress;
  };
  base: {
    chain: Chain;

    // Contracts
    bridgeContract: EvmAddress;
    counterContract: EvmAddress;

    // ERC20s
    erc20: EvmAddress;
    wSol: EvmAddress;
    wSpl: EvmAddress;
  };
};

export const CONFIGS = {
  "testnet-alpha": {
    solana: {
      cluster: "devnet",
      rpcUrl: "api.devnet.solana.com",

      // Keypairs
      deployerKpPath: "keypairs/deployer.devnet.alpha.json",
      bridgeKpPath: "keypairs/bridge.devnet.alpha.json",
      baseRelayerKpPath: "keypairs/base-relayer.devnet.alpha.json",

      // Base oracle signers
      evmLocalKey: "0x20BFBCCC8aBaD55c8aA383a75838348A646eDbA0",
      evmKeychainKey: "0xfc85de3f52047b993b2dda967b606a8b9caa2c29",

      // Programs
      bridgeProgram: address("GNyCjXAbkdceLWKBwr9Vd6NLoES6cP4QwCbQ5y5fz46H"),
      baseRelayerProgram: address(
        "2NYWv6ySV2UwZ7wNxkRnr7KktA78qNwZVxfeqUQRof5u"
      ),

      // SPLs
      spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
      wEth: address("8RvdMykTQ3xfoz8mcSRJgGYm378uBmzaBEmW73mupQta"),
      wErc20: address("3UHHHSeeLcFFJR1KrdhyHKnzKHcwoSnhxGSjHmar4usN"),
    },
    base: {
      chain: baseSepolia,

      // Contracts
      bridgeContract: "0x91a5d5A71bC3Bd7a835050ED4A337B95De0Ae757",
      counterContract: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",

      // ERC20s
      erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
      wSol: "0xC50EA8CAeDaE290FE4edA770b10aDEfc41CD698e",
      wSpl: "0xCf8e666c57651670AA7266Aba3E334E3600B2306",
    },
  },
  "testnet-prod": {
    solana: {
      cluster: "devnet",
      rpcUrl: "api.devnet.solana.com",

      // Keypairs
      deployerKpPath: "keypairs/deployer.devnet.prod.json",
      bridgeKpPath: "keypairs/bridge.devnet.prod.json",
      baseRelayerKpPath: "keypairs/base-relayer.devnet.prod.json",

      // Base oracle signers
      evmLocalKey: "0xb03FAB6DEd1867a927Cd3E7026Aa0fe95dDb9715",
      evmKeychainKey: "0x7f7a481926dc754f5768691a17022c3fa548ed8b",

      // Programs
      bridgeProgram: address("HSvNvzehozUpYhRBuCKq3Fq8udpRocTmGMUYXmCSiCCc"),
      baseRelayerProgram: address(
        "ExS1gcALmaA983oiVpvFSVohi1zCtAUTgsLj5xiFPPgL"
      ),

      // SPLs
      spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
      wEth: address("EgN6b7stvhxJGo9br4kFefmFWjMjM6NThNX4uFvwJGbE"),
      wErc20: address("ESyyyhXapf6HdqwVtxpfg6Sit7AdqEoLRBCGja9sBLx1"),
    },
    base: {
      chain: baseSepolia,

      // Contracts
      bridgeContract: "0xB2068ECCDb908902C76E3f965c1712a9cF64171E",
      counterContract: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",

      // ERC20s
      erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
      wSol: "0xC5b9112382f3c87AFE8e1A28fa52452aF81085AD",
      wSpl: "0x955C7356776F9304feD38ed5AeC5699436C7C614",
    },
  },
} as const satisfies Record<DeployEnv, Config>;
