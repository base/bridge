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

    // Solana addresses
    solanaBridge: address("ADr2FqCx35AFdS2j46gJtkoksxAFPRtjVMPo6u62tVfz"),
    spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
    wEth: address("3zPmfRJHXEYZP1SAAzwdhACkgARwX9YzpocdTMWqx8E6"),
    wErc20: address("Dsbc8W1LVY3tXsdpzemeHDEmLLE7ugaSuiBpkqauaJ7d"),

    // Base addresses
    baseBridge: "0xe6EC42a064d2eFdb19B5AAbD6c40BbE4dd1C2970",
    eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
    wSol: "0x90032B7b474FDC9c6e58A96d7B1B22FF471C50ae",
    wSpl: "0xed0D3f4AB984010b6bC8bF812C332093e5025C91",
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

    // Solana addresses
    solanaBridge: address("Z8DUqPNTT4tZAX3hNoQjYdNoB7rLxDBDX6CrHG972c7"),
    spl: address("E1UGSzb3zcdQpFsEV4Xc3grxrxMsmHtHdFHuSWC8Hsax"),
    wEth: address("3h67vcqHCoJ61gvkyZ1SMFtM1P6JGg2mgiYWQ7k2XzHU"),
    wErc20: address("9P7h46b3nAgBv743Y5373FKHhDL31Tzx5jxihpWmfNg4"),

    // Base addresses
    baseBridge: "0x8D0fE4465F3E41b1e933AF50Fe34BA5E10084410",
    eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
    wSol: "0xb64Aec5Cb44247f75C490c2b1e93B2809B32307B",
    wSpl: "0x46848FA619CA3DE5788475e1C1D713fe05aeb300",
    recipient: "0x8c1a617bdb47342f9c17ac8750e0b070c372c721",
    counter: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",
  },
} as const;
