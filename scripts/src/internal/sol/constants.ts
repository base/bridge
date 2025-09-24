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
      solanaBridge: address("GNyCjXAbkdceLWKBwr9Vd6NLoES6cP4QwCbQ5y5fz46H"),
      baseRelayer: address("2NYWv6ySV2UwZ7wNxkRnr7KktA78qNwZVxfeqUQRof5u"),
      spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
      wEth: address("8RvdMykTQ3xfoz8mcSRJgGYm378uBmzaBEmW73mupQta"),
      wErc20: address("3UHHHSeeLcFFJR1KrdhyHKnzKHcwoSnhxGSjHmar4usN"),

      // Base addresses
      baseBridge: "0x91a5d5A71bC3Bd7a835050ED4A337B95De0Ae757",
      counter: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",
      erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
      wSol: "0xC50EA8CAeDaE290FE4edA770b10aDEfc41CD698e",
      wSpl: "0xCf8e666c57651670AA7266Aba3E334E3600B2306",
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
      solanaBridge: address("HSvNvzehozUpYhRBuCKq3Fq8udpRocTmGMUYXmCSiCCc"),
      baseRelayer: address("ExS1gcALmaA983oiVpvFSVohi1zCtAUTgsLj5xiFPPgL"),
      spl: address("8KkQRERXdASmXqeWw7sPFB56wLxyHMKc9NPDW64EEL31"),
      wEth: address("EgN6b7stvhxJGo9br4kFefmFWjMjM6NThNX4uFvwJGbE"),
      wErc20: address("ESyyyhXapf6HdqwVtxpfg6Sit7AdqEoLRBCGja9sBLx1"),

      // Base addresses
      baseBridge: "0xB2068ECCDb908902C76E3f965c1712a9cF64171E",
      counter: "0x5d3eB988Daa06151b68369cf957e917B4371d35d",
      erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
      wSol: "0xC5b9112382f3c87AFE8e1A28fa52452aF81085AD",
      wSpl: "0x955C7356776F9304feD38ed5AeC5699436C7C614",
    },
  },
} as const;
