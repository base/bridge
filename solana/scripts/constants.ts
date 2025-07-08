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
    spl: address("EReUhaa3nirQPqNLbShduUB8jBiDBzncgvjXLY8dcgC7"),
    splAta: address("CmJD8SzbNmPdqh4d7ix5rszzzeaXacfymPshsA8bxVQ6"),
    wEth: address("J4S2C7x3ZnraP46Sav8AQh8LNfM5V9wxbEJFpkiew8Y5"),
    wEthAta: address("2kdhULKz8NCZ9v8EXwd6hHqrVhpSrYNSEP8ubRPYSoFn"),
    wErc20: address("FFD8WyHb6RqM5h3L8eiSx6nq2LE4nQoUrnM8ft7ufbHY"),
    wErc20Ata: address("33JaNBeRuorjMpba5o1x84PodMUxhMjF6Bw6pQnVcWXh"),

    // Base addresses
    baseBridge: "0xfcde89DFe9276Ec059d68e43759a226f0961426F",
    eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
    wSol: "0x314752245b830F3FEF1BE33Eaf16fF510Ba769a4",
    wSpl: "0x124229C60213709087c408ffe33D2b1142F91125",
    recipient: "0x8c1a617bdb47342f9c17ac8750e0b070c372c721",
    counter: "0xCdfe10f911eD5039E031D6a7be3a0F97fA061C38",
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
    spl: address("HDfeDzHJaDpW7oVHCysovy64kSdMFFUcsYHxYZjYTi3N"),
    splAta: address("2PL8hCX4rAvVWnsAt4f9DJjCmxbEKYyTpN2ZJiAsGm2A"),
    wEth: address("Epy2F1JBEj4Rr3zk5iutuKxvrJGxDGbsn1HUxmPnV9ny"),
    wEthAta: address("G5FWozHkwbTqCPqvzZSJu1hQRV1V3NR6jBnXg7BXhHY4"),
    wErc20: address("ASJK4fpHvJbadSNcqqq96RR5UNyXmMRj83zK9VsoosX9"),
    wErc20Ata: address("F6W7Au338An9qBXhoQauPrJoX8YvTBvLkfSUSo2gBzbV"),

    // Base addresses
    baseBridge: "0xfcde89DFe9276Ec059d68e43759a226f0961426F",
    eth: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    erc20: "0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9",
    wSol: "0x314752245b830F3FEF1BE33Eaf16fF510Ba769a4",
    wSpl: "0x124229C60213709087c408ffe33D2b1142F91125",
    recipient: "0x8c1a617bdb47342f9c17ac8750e0b070c372c721",
    counter: "0xCdfe10f911eD5039E031D6a7be3a0F97fA061C38",
  },
} as const;
