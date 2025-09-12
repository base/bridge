import { CONSTANTS } from "../constants";

export function getTarget() {
  const target = process.argv[2];
  if (!target) {
    console.error("Please specify target environment");
    process.exit(1);
  }

  if (!(target in CONSTANTS)) {
    console.error(
      `Invalid or missing target. Available targets: ${Object.keys(
        CONSTANTS
      ).join(", ")}`
    );
    process.exit(1);
  }

  return target as keyof typeof CONSTANTS;
}

export function getBooleanFlag(name: string, defaultValue: boolean): boolean {
  // Accept forms: --name (true), --no-name (false), --name=true/false
  // Flags can appear anywhere after the target argument.
  const argv = process.argv.slice(3);

  // First pass: explicit --no-name
  const neg = argv.find((a) => a === `--no-${name}`);
  if (neg) return false;

  // Second pass: explicit --name
  const pos = argv.find((a) => a === `--${name}`);
  if (pos) return true;

  // Third pass: --name=value
  const assign = argv.find((a) => a.startsWith(`--${name}=`));
  if (assign) {
    const v = assign.split("=")[1]?.toLowerCase();
    if (v === "true" || v === "1" || v === "yes" || v === "y") return true;
    if (v === "false" || v === "0" || v === "no" || v === "n") return false;
  }

  return defaultValue;
}
