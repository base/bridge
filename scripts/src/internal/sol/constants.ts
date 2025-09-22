import { address } from "@solana/kit";

export const CONSTANTS = {
  devnet: {
    alpha: {
      cluster: "devnet",
      rpcUrl: "api.devnet.solana.com",

      // Keypairs
      deployerKeyPair: "keypairs/deployer.devnet.alpha.json",
      bridgeKeyPair: "keypairs/bridge.devnet.alpha.json",
      baseRelayerKeyPair: "keypairs/base-relayer.devnet.alpha.json",

      // Signers
      solanaEvmLocalKey: "0x20BFBCCC8aBaD55c8aA383a75838348A646eDbA0",
      solanaEvmKeychainKey: "0xfc85de3f52047b993b2dda967b606a8b9caa2c29",

      // Solana addresses
      solanaBridge: address("524hRwZBKP3wN4r34jcqv7yRv3RJ53DagdbUtHkbCFWE"),
      baseRelayer: address("2UuNqre3Sif4ueMfCRZqwQG7LrH4H4xJsxDf7QmGCeya"),
      spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
      wEth: address("8RvdMykTQ3xfoz8mcSRJgGYm378uBmzaBEmW73mupQta"),
      wErc20: address("3UHHHSeeLcFFJR1KrdhyHKnzKHcwoSnhxGSjHmar4usN"),

      // Base addresses
      baseBridge: "0x03E05A7EB8005a8768805139394c61d2baaB3f6e",
      counter: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",
      erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
      wSol: "0x2dda899aC8534636EC9F5E17F53C0C5DC64a3a8a",
      wSpl: "0xEaAdad4bb61A27781C7210d4Eb4B35A4438755Ac",
    },

    prod: {
      cluster: "devnet",
      rpcUrl: "api.devnet.solana.com",

      // Keypairs
      deployerKeyPair: "keypairs/deployer.devnet.prod.json",
      bridgeKeyPair: "keypairs/bridge.devnet.prod.json",
      baseRelayerKeyPair: "keypairs/base-relayer.devnet.prod.json",

      // Signers
      solanaEvmLocalKey: "0xb03FAB6DEd1867a927Cd3E7026Aa0fe95dDb9715",
      solanaEvmKeychainKey: "0x7f7a481926dc754f5768691a17022c3fa548ed8b",

      // Solana addresses
      solanaBridge: address("83hN2esneZUbKgLfUvo7uzas4g7kyiodeNKAqZgx5MbH"),
      baseRelayer: address("J29jxzRsQmkpxkJptuaxYXgyNqjFZErxXtDWQ4ma3k51"),
      spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
      wEth: address("DG4ncVRoiSkYBLVUXxCFbVg38RhByjFKTLZi6UFFmZuf"),
      wErc20: address("44PhEvftJp57KRNSR7ypGLns1JUKXqAubewi3h5q1TEo"),

      // Base addresses
      baseBridge: "0x5961B1579913632c91c8cdC771cF48251A4B54F0",
      counter: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",
      erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
      wSol: "0x70445da14e089424E5f7Ab6d3C22F5Fadeb619Ca",
      wSpl: "0x4752285a93F5d0756bB2D6ed013b40ea8527a8DA",
    },
  },
} as const;
