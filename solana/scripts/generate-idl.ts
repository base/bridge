import { $ } from "bun";
import { getTarget } from "./utils/argv";

async function main() {
  const target = getTarget();
  const features = target.split("-").join(",");

  const workingDirectory = (await $`pwd`.text()).trim();

  console.log("=".repeat(40));
  console.log(`Working Directory: ${workingDirectory}`);
  console.log(`Features: ${features}`);
  console.log("=".repeat(40));
  console.log("");

  console.log("📋 Generating IDL...");
  await $`anchor idl build -o ${workingDirectory}/idl.ts -- --features ${features}`;

  console.log("🧹 Removing address key from IDL...");
  const idlFile = Bun.file(`${workingDirectory}/idl.ts`);
  const idl = await idlFile.json();
  delete idl.address;

  console.log("⚙️ Converting IDL to typescript...");
  await idlFile.write(
    `export const IDL = ${JSON.stringify(idl, null, 2)} as const;`
  );

  console.log("✅ Done!");
}

await main().catch((error) => {
  console.error("❌ Generation failed:", error.message);
  process.exit(1);
});
