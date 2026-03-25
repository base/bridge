import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Identity = {
  bridgeDeclareId: string;
  relayerDeclareId: string;
  constantsMainnetBridgeProgram: string;
  constantsMainnetBaseRelayerProgram: string;
  readmeMainnetBridgeProgram: string;
  readmeMainnetBaseRelayerProgram: string;
};

function mustMatch(input: string, pattern: RegExp, label: string): string {
  const match = input.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Unable to parse ${label}`);
  }
  return match[1];
}

function loadIdentity(repoRoot: string): Identity {
  const bridgeLib = readFileSync(
    join(repoRoot, "solana/programs/bridge/src/lib.rs"),
    "utf8"
  );
  const relayerLib = readFileSync(
    join(repoRoot, "solana/programs/base_relayer/src/lib.rs"),
    "utf8"
  );
  const constants = readFileSync(
    join(repoRoot, "scripts/src/internal/constants.ts"),
    "utf8"
  );
  const solanaReadme = readFileSync(join(repoRoot, "solana/README.md"), "utf8");

  return {
    bridgeDeclareId: mustMatch(
      bridgeLib,
      /declare_id!\("([^"]+)"\);/,
      "bridge declare_id"
    ),
    relayerDeclareId: mustMatch(
      relayerLib,
      /declare_id!\("([^"]+)"\);/,
      "base_relayer declare_id"
    ),
    constantsMainnetBridgeProgram: mustMatch(
      constants,
      /mainnet:[\s\S]*?bridgeProgram:\s*address\(\s*"([^"]+)"\s*\)/,
      "constants mainnet bridgeProgram"
    ),
    constantsMainnetBaseRelayerProgram: mustMatch(
      constants,
      /mainnet:[\s\S]*?baseRelayerProgram:\s*address\(\s*"([^"]+)"\s*\)/,
      "constants mainnet baseRelayerProgram"
    ),
    readmeMainnetBridgeProgram: mustMatch(
      solanaReadme,
      /\*\*Mainnet Bridge\*\*:\s*`([^`]+)`/,
      "README mainnet bridge"
    ),
    readmeMainnetBaseRelayerProgram: mustMatch(
      solanaReadme,
      /\*\*Mainnet Base Relayer\*\*:\s*`([^`]+)`/,
      "README mainnet base relayer"
    ),
  };
}

function compare(label: string, source: string, deployedRef: string): boolean {
  if (source === deployedRef) {
    console.log(`[OK] ${label}`);
    return true;
  }

  console.error(
    `[MISMATCH] ${label}\n  source: ${source}\n  deployed-ref: ${deployedRef}`
  );
  return false;
}

function run() {
  const repoRoot = resolve(__dirname, "..", "..");
  const identity = loadIdentity(repoRoot);

  let ok = true;
  ok =
    compare(
      "bridge source declare_id vs constants mainnet bridgeProgram",
      identity.bridgeDeclareId,
      identity.constantsMainnetBridgeProgram
    ) && ok;
  ok =
    compare(
      "relayer source declare_id vs constants mainnet baseRelayerProgram",
      identity.relayerDeclareId,
      identity.constantsMainnetBaseRelayerProgram
    ) && ok;
  ok =
    compare(
      "bridge source declare_id vs README mainnet bridge",
      identity.bridgeDeclareId,
      identity.readmeMainnetBridgeProgram
    ) && ok;
  ok =
    compare(
      "relayer source declare_id vs README mainnet base relayer",
      identity.relayerDeclareId,
      identity.readmeMainnetBaseRelayerProgram
    ) && ok;

  if (!ok) {
    process.exit(1);
  }
}

run();
