import { $ } from "bun";
import * as c from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor as renderJavaScriptVisitor } from "@codama/renderers-js";

function createClient(workingDirectory: string, idlPath: string, name: string) {
  // Instanciate Codama.
  const idl = rootNodeFromAnchor(require(idlPath).IDL);
  const codama = c.createFromRoot(idl);

  // Render JavaScript.
  codama.accept(
    renderJavaScriptVisitor(`${workingDirectory}/clients/ts/generated/${name}`)
  );
}

async function main() {
  const workingDirectory = (await $`pwd`.text()).trim();
  const bridgeIdlPath = `${workingDirectory}/idl.bridge.ts`;
  const relayerIdlPath = `${workingDirectory}/idl.base_relayer.ts`;

  console.log("=".repeat(40));
  console.log(`Working Directory: ${workingDirectory}`);
  console.log(`Bridge IDL Path: ${bridgeIdlPath}`);
  console.log(`Base Relayer IDL Path: ${relayerIdlPath}`);
  console.log("=".repeat(40));
  console.log("");

  createClient(workingDirectory, bridgeIdlPath, "bridge");
  createClient(workingDirectory, relayerIdlPath, "base_relayer");

  console.log("✅ Done!");
}

await main().catch((error) => {
  console.error("❌ Generation failed:", error.message);
  process.exit(1);
});
