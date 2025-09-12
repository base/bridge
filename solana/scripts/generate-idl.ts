import { $ } from "bun";

async function buildIdlForProgram(programName: string) {
  const workingDirectory = (await $`pwd`.text()).trim();
  const programDir = `${workingDirectory}/programs/${programName}`;
  const jsonOutPath = `${workingDirectory}/idl.${programName}.json`;
  const tsOutPath = `${workingDirectory}/idl.${programName}.ts`;

  console.log(`📋 Generating IDL for '${programName}'...`);
  await $`bash -lc ${`cd ${programDir} && anchor idl build -o ${jsonOutPath}`}`;

  console.log(`🧹 Removing address key from '${programName}' IDL...`);
  const idlFile = Bun.file(jsonOutPath);
  const idl = await idlFile.json();
  delete (idl as any).address;

  console.log(`⚙️ Converting '${programName}' IDL to TypeScript...`);
  await Bun.write(
    tsOutPath,
    `export const IDL = ${JSON.stringify(idl, null, 2)} as const;`
  );

  console.log(`🧽 Cleaning up temporary JSON for '${programName}'...`);
  await $`rm -f ${jsonOutPath}`;
}

async function main() {
  const workingDirectory = (await $`pwd`.text()).trim();

  console.log("=".repeat(40));
  console.log(`Working Directory: ${workingDirectory}`);
  console.log("Programs: bridge, base_relayer");
  console.log("=".repeat(40));
  console.log("");

  await buildIdlForProgram("bridge");
  await buildIdlForProgram("base_relayer");

  console.log("✅ Done!");
}

await main().catch((error) => {
  console.error("❌ Generation failed:", error.message);
  process.exit(1);
});
