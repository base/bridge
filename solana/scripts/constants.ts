import { address } from "@solana/kit";
import { fileFromPath } from "./utils/file";

export const CONSTANTS = {
  "devnet-alpha": {
    // Network
    cluster: "devnet",
    environment: "alpha",
    rpcUrl: "api.devnet.solana.com",

    // Keypairs
    deployerKeyPairFile: await fileFromPath(
      "keypairs/deployer.devnet.alpha.json"
    ),
    bridgeKeyPairFile: await fileFromPath("keypairs/bridge.devnet.alpha.json"),
    baseRelayerKeyPairFile: await fileFromPath(
      "keypairs/base_relayer.devnet.alpha.json"
    ),

    // Signers
    solanaEvmLocalKey: "0x20BFBCCC8aBaD55c8aA383a75838348A646eDbA0",
    solanaEvmKeychainKey: "0xfc85de3f52047b993b2dda967b606a8b9caa2c29",

    // Solana addresses
    solanaBridge: address("7yfbZ5bSMuEXYMETsQ1H5G6PZrPqnkZm55rNMTryjwNB"),
    baseRelayerProgram: address("G8xnCLr1ezxFP4LDMVKu8REX3WgSfnNJbwNEyQiMbdf1"),
    spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
    wEth: address("8RvdMykTQ3xfoz8mcSRJgGYm378uBmzaBEmW73mupQta"),
    wErc20: address("3UHHHSeeLcFFJR1KrdhyHKnzKHcwoSnhxGSjHmar4usN"),

    // Base addresses
    baseBridge: "0x93049260cc6D529D6b186b09D7ba1ef8a834A34F",
    eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
    wSol: "0xE061cB6CA67E152Aff009DBB20749a096a579974",
    wSpl: "0xf8d6970486762Fc2558726bD9Ee026886675d129",
    recipient: "0x8c1a617bdb47342f9c17ac8750e0b070c372c721",
    counter: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",
  },
  "devnet-prod": {
    // Network
    cluster: "devnet",
    environment: "prod",
    rpcUrl: "api.devnet.solana.com",

    // Keypairs
    deployerKeyPairFile: await fileFromPath(
      "keypairs/deployer.devnet.prod.json"
    ),
    bridgeKeyPairFile: await fileFromPath("keypairs/bridge.devnet.prod.json"),
    baseRelayerKeyPairFile: await fileFromPath(
      "keypairs/base_relayer.devnet.prod.json"
    ),

    // Signers
    solanaEvmLocalKey: "0xb03FAB6DEd1867a927Cd3E7026Aa0fe95dDb9715",
    solanaEvmKeychainKey: "0x7f7a481926dc754f5768691a17022c3fa548ed8b",

    // Solana addresses
    solanaBridge: address("79DpuKKNPSk9BDnQVVAExvh55waf1zvFszVsotx9wfqT"),
    baseRelayerProgram: address("H83uxCfMz9wGtshMNjXvAkjfSYdKSZC3SVKp2zuZjGJ"),
    spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
    wEth: address("Bt5ZZd4gvAR5xHsizfhA2fo93DgyYg8J7g5y12sA8zzC"),
    wErc20: address("3dmSRTTwnMvmLKMagZ5QpZSXCoSJpudxncA6f6Q885fe"),

    // Base addresses
    baseBridge: "0x0Bec82590219F7cD5AE97d118760Ceb1E0BEC849",
    eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
    wSol: "0x1FAA044de9739Ae3E471D979143C55265542781f",
    wSpl: "0xF6a90921a3967040053C12d011625916e8Dc1EA2",
    recipient: "0x8c1a617bdb47342f9c17ac8750e0b070c372c721",
    counter: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",
  },
} as const;
