import { $ } from "bun";
import * as c from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor as renderJavaScriptVisitor } from "@codama/renderers-js";

async function main() {
  const workingDirectory = (await $`pwd`.text()).trim();
  const idlPath = `${workingDirectory}/idl.ts`;

  console.log("=".repeat(40));
  console.log(`Working Directory: ${workingDirectory}`);
  console.log(`IDL Path: ${idlPath}`);
  console.log("=".repeat(40));
  console.log("");

  // Instanciate Codama.
  const idl = rootNodeFromAnchor(require(idlPath).IDL);
  const codama = c.createFromRoot(idl);

  // Render JavaScript.
  codama.accept(
    renderJavaScriptVisitor(`${workingDirectory}/clients/ts/generated`)
  );

  console.log("✅ Done!");
}

await main().catch((error) => {
  console.error("❌ Generation failed:", error.message);
  process.exit(1);
});
