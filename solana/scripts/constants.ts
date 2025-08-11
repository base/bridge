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
    solanaBridge: address("AvgDrHpWUeV7fpZYVhDQbWrV2sD7zp9zDB7w97CWknKH"),
    spl: address("E1UGSzb3zcdQpFsEV4Xc3grxrxMsmHtHdFHuSWC8Hsax"),
    wEth: address("7kK3DZWUFHRYUky5aV95CouGYR3XuA3WnEPwQ5s1W8im"),
    wErc20: address("7s3fSFV23MSRssnp7gYam4LEJbBvXTcc6cVXY5duy2Dn"),

    // Base addresses
    baseBridge: "0xfcde89DFe9276Ec059d68e43759a226f0961426F",
    eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
    wSol: "0x314752245b830F3FEF1BE33Eaf16fF510Ba769a4",
    wSpl: "0xBc4027074e544Be820b1a16Bf4F4f7c626D61032",
    recipient: "0x8c1a617bdb47342f9c17ac8750e0b070c372c721",
    counter: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",
  },
} as const;
