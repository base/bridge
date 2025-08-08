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
    splAta: address("Hw1qKo9UjDxPDUwEFdUvfGs77XFim9CQzvpaMGWRTe7d"),
    wEth: address("3zPmfRJHXEYZP1SAAzwdhACkgARwX9YzpocdTMWqx8E6"),
    wEthAta: address("11111111111111111111111111111111"),
    wErc20: address("Dsbc8W1LVY3tXsdpzemeHDEmLLE7ugaSuiBpkqauaJ7d"),
    wErc20Ata: address("11111111111111111111111111111111"),

    // Base addresses
    baseBridge: "0x8DcB17B51300C5Af4b1fE22c6BDA294b37FAF336",
    eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
    wSol: "0x0D6995fe5768683C7934d070c5a12569d21fBA06",
    wSpl: "0x583b43F642F9496827b65D5AF4173f3De4A7e9D9",
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
    splAta: address("6x7ujzdNWDKQPxfW1gosdzegm6sPeNU5BooUfjkQn4Jk"),
    wEth: address("7kK3DZWUFHRYUky5aV95CouGYR3XuA3WnEPwQ5s1W8im"),
    wEthAta: address("Hij46yANqwuuc2VThykEsHfEH8gvzxPhH9EXspkgL68G"),
    wErc20: address("7s3fSFV23MSRssnp7gYam4LEJbBvXTcc6cVXY5duy2Dn"),
    wErc20Ata: address("7qd2bgZSkj5hR4yaH3fS9ecx5C8QTSzvsX62gFcVPyzm"),

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
