import {
  address,
  type Address,
  type Address as SolanaAddress,
} from "@solana/kit";
import type { Chain, Address as EvmAddress } from "viem";
import { base, baseSepolia } from "viem/chains";

export const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export const DEPLOY_ENVS = [
  "testnet-alpha",
  "testnet-prod",
  "mainnet",
] as const;

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
      rpcUrl: "https://api.devnet.solana.com",

      // Keypairs
      deployerKpPath: "keypairs/deployer.devnet.alpha.json",
      bridgeKpPath: "keypairs/bridge.devnet.alpha.json",
      baseRelayerKpPath: "keypairs/base-relayer.devnet.alpha.json",

      // Base oracle signers
      evmLocalKey: "0x20BFBCCC8aBaD55c8aA383a75838348A646eDbA0",
      evmKeychainKey: "0xfc85de3f52047b993b2dda967b606a8b9caa2c29",

      // Programs
      bridgeProgram: address("6YpL1h2a9u6LuNVi55vAes36xNszt2UDm3Zk1kj4WSBm"),
      baseRelayerProgram: address(
        "ETsFnoWdJK8N7VJW6XXjiciyB2xeQfCXMQWNa85Zi9cn"
      ),

      // SPLs
      spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
      wEth: address("Ds8zVAg2CCG9p1LL1PkeDBzr4hhsSYeeadKQZnH3KGkL"),
      wErc20: address("5RY1tS5AccP14676cQzs6EZBoV51Gek3FoWPyU1syhrq"),
    },
    base: {
      chain: baseSepolia,

      // Contracts
      bridgeContract: "0x64567a9147fa89B1edc987e36Eb6f4b6db71656b",
      counterContract: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",

      // ERC20s
      erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
      wSol: "0x003512146Fd54b71f926C7Fd4B7bd20Fc84E22c5",
      wSpl: "0x80351342c4dd23C78c0837C640E041a239e67cD8",
    },
  },
  "testnet-prod": {
    solana: {
      cluster: "devnet",
      rpcUrl: "https://api.devnet.solana.com",

      // Keypairs
      deployerKpPath: "keypairs/deployer.devnet.prod.json",
      bridgeKpPath: "keypairs/bridge.devnet.prod.json",
      baseRelayerKpPath: "keypairs/base-relayer.devnet.prod.json",

      // Base oracle signers
      evmLocalKey: "0xb03FAB6DEd1867a927Cd3E7026Aa0fe95dDb9715",
      evmKeychainKey: "0x7f7a481926dc754f5768691a17022c3fa548ed8b",

      // Programs
      bridgeProgram: address("7c6mteAcTXaQ1MFBCrnuzoZVTTAEfZwa6wgy4bqX3KXC"),
      baseRelayerProgram: address(
        "56MBBEYAtQAdjT4e1NzHD8XaoyRSTvfgbSVVcEcHj51H"
      ),

      // SPLs
      spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
      wEth: address("EgN6b7stvhxJGo9br4kFefmFWjMjM6NThNX4uFvwJGbE"),
      wErc20: address("ESyyyhXapf6HdqwVtxpfg6Sit7AdqEoLRBCGja9sBLx1"),
    },
    base: {
      chain: baseSepolia,

      // Contracts
      bridgeContract: "0x01824a90d32A69022DdAEcC6C5C14Ed08dB4EB9B",
      counterContract: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",

      // ERC20s
      erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
      wSol: "0xCace0c896714DaF7098FFD8CC54aFCFe0338b4BC",
      wSpl: "0x955C7356776F9304feD38ed5AeC5699436C7C614",
    },
  },
  mainnet: {
    solana: {
      cluster: "mainnet",
      rpcUrl: "https://api.mainnet-beta.solana.com",

      // Keypairs
      deployerKpPath: "keypairs/deployer.mainnet.json",
      bridgeKpPath: "keypairs/bridge.mainnet.json",
      baseRelayerKpPath: "keypairs/base-relayer.mainnet.json",

      // Base oracle signers
      evmLocalKey: "0x68fb9f14256fb52944c65f4afd207c2153ec18f1",
      evmKeychainKey: "0x9B1494C2d4c0dedbd8DA203054ee7de08c138836",

      // Programs
      bridgeProgram: address("HNCne2FkVaNghhjKXapxJzPaBvAKDG1Ge3gqhZyfVWLM"),
      baseRelayerProgram: address(
        "g1et5VenhfJHJwsdJsDbxWZuotD5H4iELNG61kS4fb9"
      ),

      // SPLs
      spl: "" as Address,
      wEth: "" as Address,
      wErc20: "" as Address,
    },
    base: {
      chain: base,

      // Contracts
      bridgeContract: "0x3eff766C76a1be2Ce1aCF2B69c78bCae257D5188",
      counterContract: "0x",

      // ERC20s
      erc20: "0x",
      wSol: "0x",
      wSpl: "0x",
    },
  },
} as const satisfies Record<DeployEnv, Config>;
