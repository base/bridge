import { $ } from "bun";
import { CONSTANTS } from "../constants";

import { fileFromPath } from "../utils/file";
import { getTarget } from "../utils/argv";
import { keyPairToAddress } from "../utils/keypair";

async function main() {
  const target = getTarget();
  const constants = CONSTANTS[target];

  const workingDirectory = (await $`pwd`.text()).trim();
  const programFile = await fileFromPath(
    `${workingDirectory}/target/deploy/bridge.so`
  );

  const bridgeAddress = await keyPairToAddress(constants.bridgeKeyPairFile);
  const deployerAddress = await keyPairToAddress(constants.deployerKeyPairFile);

  console.log("=".repeat(40));
  console.log(`Working Directory: ${workingDirectory}`);
  console.log(`Network: ${constants.cluster}`);
  console.log(`Environment: ${constants.environment}`);
  console.log(`Bridge: ${bridgeAddress}`);
  console.log(`Deployer: ${deployerAddress}`);
  console.log(`Program Binary: ${programFile.name}`);
  console.log("=".repeat(40));
  console.log("");

  console.log("💰 Checking deployer balance...");
  const balance =
    await $`solana balance ${deployerAddress} --url ${constants.cluster}`.text();
  console.log(`Deployer balance: ${balance.trim()}`);

  console.log("🚀 Deploying program...");
  await $`solana program deploy --url ${constants.cluster} --keypair ${constants.deployerKeyPairFile.name} --program-id ${constants.bridgeKeyPairFile.name} ${programFile.name}`;
  console.log("✅ Deployment completed successfully!");
}

await main().catch((error) => {
  console.error("❌ Deployment failed:", error.message);
  process.exit(1);
});
