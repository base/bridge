import { $ } from "bun";
import { type Address } from "@solana/kit";

import { fileFromPath } from "../utils/file";
import { keyPairToAddress } from "../utils/keypair";
import { CONSTANTS } from "../constants";
import { getTarget } from "../utils/argv";

async function updateLibRs(libRsFile: Bun.BunFile, bridgeAddress: Address) {
  const libRs = await libRsFile.text();
  const updatedLibRs = libRs.replace(
    /declare_id!\("([^"]+)"\)/,
    `declare_id!("${bridgeAddress}")`
  );

  await Bun.write(libRsFile, updatedLibRs);
}

async function main() {
  const target = getTarget();
  const features = target.split("-").join(",");
  const constants = CONSTANTS[target];

  const workingDirectory = (await $`pwd`.text()).trim();
  const libRsFile = await fileFromPath(
    `${workingDirectory}/programs/bridge/src/lib.rs`
  );
  const libRsBackupFile = await fileFromPath(
    `${workingDirectory}/programs/bridge/src/lib.rs.backup`,
    false
  );

  const relayerLibRsFile = await fileFromPath(
    `${workingDirectory}/programs/base_relayer/src/lib.rs`
  );
  const relayerLibRsBackupFile = await fileFromPath(
    `${workingDirectory}/programs/base_relayer/src/lib.rs.backup`,
    false
  );

  const bridgeAddress = await keyPairToAddress(constants.bridgeKeyPairFile);
  const baseRelayerAddress = await keyPairToAddress(
    constants.baseRelayerKeyPairFile
  );
  const deployerAddress = await keyPairToAddress(constants.deployerKeyPairFile);

  console.log("=".repeat(40));
  console.log(`Working Directory: ${workingDirectory}`);
  console.log(`Network: ${constants.cluster}`);
  console.log(`Environment: ${constants.environment}`);
  console.log(`Features: ${features}`);
  console.log(`Bridge: ${bridgeAddress}`);
  console.log(`Base Relayer Program: ${baseRelayerAddress}`);
  console.log(`Deployer: ${deployerAddress}`);
  console.log("=".repeat(40));
  console.log("");

  console.log("📦 Backing up files...");
  await Bun.write(libRsBackupFile, libRsFile);
  await Bun.write(relayerLibRsBackupFile, relayerLibRsFile);

  console.log("📝 Updating lib.rs...");
  await updateLibRs(libRsFile, bridgeAddress);
  await updateLibRs(relayerLibRsFile, baseRelayerAddress);

  console.log("🔨 Building program...");
  await $`cargo-build-sbf`;

  console.log("🧹 Restoring lib.rs...");
  await Bun.write(libRsFile, await libRsBackupFile.text());
  await libRsBackupFile.delete();
  await Bun.write(relayerLibRsFile, await relayerLibRsBackupFile.text());
  await relayerLibRsBackupFile.delete();

  console.log("✅ Done!");
}

await main().catch((error) => {
  console.error("❌ Build failed:", error.message);
  process.exit(1);
});
