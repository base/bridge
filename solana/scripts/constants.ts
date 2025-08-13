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
    baseBridge: "0x6A52C4Eb4B096FE3a468F96975D444B3e0d939Af",
    eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
    wSol: "0xb4fc71604681527644cC686a024b8d13A5AF5fd9",
    wSpl: "0x00e9aC740E198DCFBCf0e2913D1deCe16b736dc9",
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
    spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
    wEth: address("3h67vcqHCoJ61gvkyZ1SMFtM1P6JGg2mgiYWQ7k2XzHU"),
    wErc20: address("9P7h46b3nAgBv743Y5373FKHhDL31Tzx5jxihpWmfNg4"),

    // Base addresses
    baseBridge: "0x9BA58C63b341B3560693610aF2b2555301Fd3AEC",
    eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
    wSol: "0xC924C339deeF36Bda20e94b2813CF98049B2815a",
    wSpl: "0x99FE595072dE80D1Df43f3091F4867A75081166C",
    recipient: "0x8c1a617bdb47342f9c17ac8750e0b070c372c721",
    counter: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",
  },
} as const;
