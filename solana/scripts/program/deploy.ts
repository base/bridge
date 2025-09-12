import { $ } from "bun";
import { CONSTANTS } from "../constants";

import { fileFromPath } from "../utils/file";
import { getTarget } from "../utils/argv";
import { keyPairToAddress } from "../utils/keypair";
import { getBase58Codec } from "@solana/kit";

async function main() {
  const target = getTarget();
  const constants = CONSTANTS[target];

  const workingDirectory = (await $`pwd`.text()).trim();
  const programFile = await fileFromPath(
    `${workingDirectory}/target/deploy/bridge.so`
  );
  const relayerProgramFile = await fileFromPath(
    `${workingDirectory}/target/deploy/base_relayer.so`
  );

  const bridgeAddress = await keyPairToAddress(constants.bridgeKeyPairFile);
  const relayerAddress = await keyPairToAddress(
    constants.baseRelayerKeyPairFile
  );
  const deployerAddress = await keyPairToAddress(constants.deployerKeyPairFile);

  console.log("=".repeat(40));
  console.log(`Working Directory: ${workingDirectory}`);
  console.log(`Network: ${constants.cluster}`);
  console.log(`Environment: ${constants.environment}`);
  console.log(`Bridge: ${bridgeAddress}`);
  console.log(
    `Bridge (bytes32): ${getBase58Codec().encode(bridgeAddress).toHex()}`
  );
  console.log(`Base Relayer Program: ${relayerAddress}`);
  console.log(
    `Base Relayer Program (bytes32): ${getBase58Codec().encode(relayerAddress).toHex()}`
  );
  console.log(`Deployer: ${deployerAddress}`);
  console.log(`Program Binary: ${programFile.name}`);
  console.log(`Relayer program Binary: ${relayerProgramFile.name}`);
  console.log("=".repeat(40));
  console.log("");

  console.log("💰 Checking deployer balance...");
  const balance =
    await $`solana balance ${deployerAddress} --url ${constants.cluster}`.text();
  console.log(`Deployer balance: ${balance.trim()}`);

  console.log("🚀 Deploying bridge program...");
  await $`solana program deploy --url ${constants.cluster} --keypair ${constants.deployerKeyPairFile.name} --program-id ${constants.bridgeKeyPairFile.name} ${programFile.name}`;

  console.log("🚀 Deploying base relayer program...");
  await $`solana program deploy --url ${constants.cluster} --keypair ${constants.deployerKeyPairFile.name} --program-id ${constants.baseRelayerKeyPairFile.name} ${relayerProgramFile.name}`;

  console.log("✅ Deployment completed successfully!");
}

await main().catch((error) => {
  console.error("❌ Deployment failed:", error.message);
  process.exit(1);
});
