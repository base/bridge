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
    solanaBridge: address("4L8cUU2DXTzEaa5C8MWLTyEV8dpmpDbCjg8DNgUuGedc"),
    spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
    splAta: address("Hw1qKo9UjDxPDUwEFdUvfGs77XFim9CQzvpaMGWRTe7d"),
    wEth: address("CURCLcLzb4GFg1o8c841T6yvkrEJXwNarHspTZrk5ZT2"),
    wEthAta: address("GMwSrwEcuyGitE8gGrhiHLNL6bnqVpre4ujYozdueqKT"),
    wErc20: address("HmQecEWH6q3mxMjVByk1rwPEwPYmeLUhrWAUs8kc4uhV"),
    wErc20Ata: address("HCixR6YGDfZY2KLkx8TnMKiXen9oEmr6YmPjHUKpFnY"),

    // Base addresses
    baseBridge: "0xfcde89DFe9276Ec059d68e43759a226f0961426F",
    eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
    wSol: "0x4D3210A178De60668986eecfF4eC0B2508eEE1B2",
    wSpl: "0xBc4027074e544Be820b1a16Bf4F4f7c626D61032",
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
