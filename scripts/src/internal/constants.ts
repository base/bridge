import { address, type Address as SolanaAddress } from "@solana/kit";
import type { Chain, Address as EvmAddress } from "viem";
import { baseSepolia } from "viem/chains";

export const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export const DEPLOY_ENVS = ["development-alpha", "development-prod"] as const;

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
  "development-alpha": {
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
  "development-prod": {
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
      bridgeProgram: address("83hN2esneZUbKgLfUvo7uzas4g7kyiodeNKAqZgx5MbH"),
      baseRelayerProgram: address(
        "J29jxzRsQmkpxkJptuaxYXgyNqjFZErxXtDWQ4ma3k51"
      ),

      // SPLs
      spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
      wEth: address("DG4ncVRoiSkYBLVUXxCFbVg38RhByjFKTLZi6UFFmZuf"),
      wErc20: address("44PhEvftJp57KRNSR7ypGLns1JUKXqAubewi3h5q1TEo"),
    },
    base: {
      chain: baseSepolia,

      // Contracts
      bridgeContract: "0x5961B1579913632c91c8cdC771cF48251A4B54F0",
      counterContract: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",

      // ERC20s
      erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
      wSol: "0x70445da14e089424E5f7Ab6d3C22F5Fadeb619Ca",
      wSpl: "0x4752285a93F5d0756bB2D6ed013b40ea8527a8DA",
    },
  },
} as const satisfies Record<DeployEnv, Config>;
