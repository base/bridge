import { address, type Address } from "@solana/kit";
import { IDL } from "../sol/bridge.idl";

type BridgeConstants = typeof IDL.constants;
type BridgeConstantNames = BridgeConstants[number]["name"];

type BridgeConstant<
  T extends BridgeConstants,
  Name extends BridgeConstantNames,
> = Extract<T[number], { name: Name }>;

type BridgeConstantField<
  T extends BridgeConstants,
  Name extends BridgeConstantNames,
  Field extends keyof BridgeConstant<T, Name> = "value",
> = BridgeConstant<T, Name>[Field];

type ParsedConstantValue<Name extends BridgeConstantNames> =
  BridgeConstantField<BridgeConstants, Name, "type"> extends "pubkey"
    ? Address
    : BridgeConstantField<BridgeConstants, Name, "type"> extends "u128" | "u64"
      ? bigint
      : BridgeConstantField<BridgeConstants, Name, "type"> extends "u16" | "u8"
        ? number
        : BridgeConstantField<BridgeConstants, Name, "type"> extends "bytes"
          ? number[]
          : BridgeConstantField<BridgeConstants, Name, "type"> extends {
                array: any;
              }
            ? number[]
            : BridgeConstantField<
                  BridgeConstants,
                  Name,
                  "type"
                > extends "string"
              ? string
              : never;

export const getIdlConstant = <T extends BridgeConstantNames>(
  name: T
): ParsedConstantValue<T> => {
  const constant = IDL.constants.find((c) => c.name === name);
  if (!constant) {
    throw new Error(`Constant "${name}" not found`);
  }
  const { type, value } = constant;

  // Handle array types like { array: ["u8", 20] }
  if (typeof type === "object" && "array" in type) {
    // Value is already an array of numbers
    return JSON.parse(value) as unknown as ParsedConstantValue<T>;
  }

  // Handle primitive types
  switch (type) {
    case "pubkey":
      return address(value) as unknown as ParsedConstantValue<T>;

    case "string":
      return JSON.parse(value) as unknown as ParsedConstantValue<T>;

    case "u8":
      return Number(value) as unknown as ParsedConstantValue<T>;

    case "bytes":
      return JSON.parse(value) as unknown as ParsedConstantValue<T>;

    default:
      const t: never = type;
      return t as unknown as ParsedConstantValue<T>;
  }
};
