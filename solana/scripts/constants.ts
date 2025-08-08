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
    solanaBridge: address("7oLTUCrqwRUgYMMRQYbe9vHFMGkensP9SBo9sY8XSP2P"),
    spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
    splAta: address("Hw1qKo9UjDxPDUwEFdUvfGs77XFim9CQzvpaMGWRTe7d"),
    wEth: address("GJdYmKpWXcPqsqqusSND9t4rKbiHLobmWVqGx73xf2gp"),
    wEthAta: address("11111111111111111111111111111111"),
    wErc20: address("Dpu9qKAW1c7SyA8zUGiz2BLzXbwoZbXX8rebKz4zFqFy"),
    wErc20Ata: address("11111111111111111111111111111111"),

    // Base addresses
    baseBridge: "0xaace3A73B7096c40F75e3306bd58877048c81AEb",
    eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
    wSol: "0x4B2f802705462c9506271b97271AE1F91Ea4c239",
    wSpl: "0x15eAEFE23132216f4Dc5581cfd7797c61fcfc649",
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
