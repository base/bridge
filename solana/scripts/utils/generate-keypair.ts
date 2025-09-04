import { Keypair } from "@solana/web3.js";

await Bun.write(
  "keypairs/bridge.devnet.alpha.json",
  JSON.stringify(Array.from(Keypair.generate().secretKey))
);
await Bun.write(
  "keypairs/base_relayer.devnet.alpha.json",
  JSON.stringify(Array.from(Keypair.generate().secretKey))
);
