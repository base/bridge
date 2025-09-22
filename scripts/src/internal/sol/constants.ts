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
      solanaBridge: address("9yayaS8TwWHcysZT6H45Hw421FbB84G4caQt4SVEGenq"),
      baseRelayer: address("2UuNqre3Sif4ueMfCRZqwQG7LrH4H4xJsxDf7QmGCeya"),
      spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
      wEth: address("6qbhLNZjXno9dN62thraKZNRCYoYgKvd15NqtwreqfQb"),
      wErc20: address("47f9psvcESd2ekAQYJQ2HL7An44VQ76jZnfgoXrmsL6H"),

      // Base addresses
      baseBridge: "0xc56eD1E611eB4eEa0E35906e21ea65903bDb01F2",
      counter: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",
      erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
      wSol: "0x5267009FE9c5FAa329856b88Bbdf881fEE01A8b7",
      wSpl: "0x4BB9978f622F9a74e3945e4deDd281A6Ca4E4A63",
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
      solanaBridge: address("79DpuKKNPSk9BDnQVVAExvh55waf1zvFszVsotx9wfqT"),
      baseRelayer: address("J29jxzRsQmkpxkJptuaxYXgyNqjFZErxXtDWQ4ma3k51"),
      spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
      wEth: address("Bt5ZZd4gvAR5xHsizfhA2fo93DgyYg8J7g5y12sA8zzC"),
      wErc20: address("3dmSRTTwnMvmLKMagZ5QpZSXCoSJpudxncA6f6Q885fe"),

      // Base addresses
      baseBridge: "0x0Bec82590219F7cD5AE97d118760Ceb1E0BEC849",
      counter: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",
      erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
      wSol: "0x1FAA044de9739Ae3E471D979143C55265542781f",
      wSpl: "0xF6a90921a3967040053C12d011625916e8Dc1EA2",
    },
  },
} as const;
