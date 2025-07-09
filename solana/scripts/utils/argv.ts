import { CONSTANTS } from "../constants";

export function getTarget() {
  const target = process.argv[2] ?? "devnet-alpha";
  console.log(process.argv);
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
