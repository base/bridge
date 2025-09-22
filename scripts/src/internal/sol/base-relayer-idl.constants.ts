import { type Address } from "@solana/kit";
import { IDL } from "../../../../solana/idl.base_relayer.ts";

type BaseRelayerConstants = typeof IDL.constants;
type BaseRelayerConstantNames = BaseRelayerConstants[number]["name"];

type BaseRelayerConstant<
  T extends BaseRelayerConstants,
  Name extends BaseRelayerConstantNames,
> = Extract<T[number], { name: Name }>;

type BaseRelayerConstantField<
  T extends BaseRelayerConstants,
  Name extends BaseRelayerConstantNames,
  Field extends keyof BaseRelayerConstant<T, Name> = "value",
> = BaseRelayerConstant<T, Name>[Field];

type ParsedConstantValue<Name extends BaseRelayerConstantNames> =
  BaseRelayerConstantField<BaseRelayerConstants, Name, "type"> extends "pubkey"
    ? Address
    : BaseRelayerConstantField<BaseRelayerConstants, Name, "type"> extends
          | "u128"
          | "u64"
      ? bigint
      : BaseRelayerConstantField<BaseRelayerConstants, Name, "type"> extends
            | "u16"
            | "u8"
        ? number
        : BaseRelayerConstantField<
              BaseRelayerConstants,
              Name,
              "type"
            > extends "bytes"
          ? number[]
          : BaseRelayerConstantField<
                BaseRelayerConstants,
                Name,
                "type"
              > extends {
                array: any;
              }
            ? number[]
            : BaseRelayerConstantField<
                  BaseRelayerConstants,
                  Name,
                  "type"
                > extends "string"
              ? string
              : never;

export const getRelayerIdlConstant = <T extends BaseRelayerConstantNames>(
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
    case "bytes":
      return JSON.parse(value) as unknown as ParsedConstantValue<T>;

    case "u128":
      return Number(value) as unknown as ParsedConstantValue<T>;

    default:
      const t: never = type;
      return t as unknown as ParsedConstantValue<T>;
  }
};
