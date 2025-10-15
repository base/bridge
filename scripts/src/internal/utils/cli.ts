/**
 * CLI Utilities
 *
 * Common helpers for Commander.js commands with interactive prompts.
 * Reduces duplication across all command files by providing:
 * - Wrappers for @clack/prompts with automatic isCancel handling
 * - Type-safe value validators for common types (addresses, numbers, etc.)
 * - Zod validation workflow helper
 */

import {
  text,
  select,
  confirm,
  isCancel,
  cancel,
  type SelectOptions,
} from "@clack/prompts";
import { existsSync } from "fs";
import { isAddress as isSolanaAddress } from "@solana/kit";
import { isAddress as isEvmAddress, isHash } from "viem";
import { z } from "zod";

import { logger } from "@internal/logger";

export const bigintSchema = z
  .string()
  .transform((val) => val.replace(/_/g, ""))
  .pipe(z.coerce.bigint());
export const integerSchema = (min?: number, max?: number) => {
  let schema = z.number().int();
  if (min !== undefined) schema = schema.min(min);
  if (max !== undefined) schema = schema.max(max);

  return z
    .string()
    .transform((val) => Number(val.replace(/_/g, "")))
    .pipe(schema);
};
export const decimalSchema = (min?: number) => {
  let schema = z.number();
  if (min !== undefined) schema = schema.min(min);

  return z
    .string()
    .transform((val) => Number(val.replace(/_/g, "")))
    .pipe(schema);
};
export const solanaAddressSchema = z.string().refine(isSolanaAddress, {
  message: "Value must be a base58 address",
});
export const evmAddressSchema = z.string().refine(isEvmAddress, {
  message: "Invalid EVM address",
});
export const hexSchema = z.hex();
export const hashSchema = z.string().refine(isHash, {
  message: "Value must be a valid 32-byte hash (0x... 66 characters)",
});

/**
 * Wrapper for text() with automatic isCancel handling
 */
export async function getInteractiveInput(
  message: string,
  placeholder: string,
  validate: (input: string) => string | undefined
): Promise<string> {
  const result = await text({ message, placeholder, validate });
  if (isCancel(result)) {
    cancel("Operation cancelled.");
    process.exit(1);
  }
  return result.trim();
}

/**
 * Wrapper for select() with automatic isCancel handling
 */
export async function getInteractiveSelect<T extends string>(
  opts: SelectOptions<T>
): Promise<T> {
  const result = await select(opts);
  if (isCancel(result)) {
    cancel("Operation cancelled.");
    process.exit(1);
  }
  return result as T;
}

/**
 * Wrapper for confirm() with automatic isCancel handling
 */
export async function getInteractiveConfirm(
  message: string,
  initialValue: boolean = true
): Promise<boolean> {
  const result = await confirm({ message, initialValue });
  if (isCancel(result)) {
    cancel("Operation cancelled.");
    process.exit(1);
  }
  return result;
}

/**
 * Gets a validated bigint from CLI args or prompts the user
 */
export async function getOrPromptBigint(
  value: string | undefined,
  label: string
): Promise<string> {
  return getOrPromptWithZod(value, label, bigintSchema, "12345");
}

/**
 * Gets a validated Solana address from CLI args or prompts the user
 */
export async function getOrPromptSolanaAddress(
  value: string | undefined,
  label: string,
  allowedKeywords?: string[]
): Promise<string> {
  // If keywords are allowed, create a union schema that accepts keywords OR addresses
  if (allowedKeywords && allowedKeywords.length > 0) {
    const keywordSchemas = allowedKeywords.map((kw) => z.literal(kw));
    const schemaWithKeywords = z.union([
      ...keywordSchemas,
      solanaAddressSchema,
    ]);
    return getOrPromptWithZod(
      value,
      label,
      schemaWithKeywords,
      allowedKeywords[0] || "Solana address"
    );
  }

  return getOrPromptWithZod(
    value,
    label,
    solanaAddressSchema,
    "Solana address"
  );
}

/**
 * Gets a validated EVM address from CLI args or prompts the user
 */
export async function getOrPromptEvmAddress(
  value: string | undefined,
  label: string
): Promise<string> {
  return getOrPromptWithZod(value, label, evmAddressSchema, "0x...");
}

/**
 * Gets a validated integer from CLI args or prompts the user
 */
export async function getOrPromptInteger(
  value: string | undefined,
  label: string,
  min?: number,
  max?: number
): Promise<string> {
  return getOrPromptWithZod(
    value,
    label,
    integerSchema(min, max),
    String(min ?? 0)
  );
}

/**
 * Gets a validated decimal number from CLI args or prompts the user
 */
export async function getOrPromptDecimal(
  value: string | undefined,
  label: string,
  min?: number
): Promise<string> {
  return getOrPromptWithZod(value, label, decimalSchema(min), "0.0");
}

/**
 * Validates and returns a keypair file path (from CLI or interactive prompt)
 */
export async function getOrPromptFilePath(
  value: string | undefined,
  label: string,
  allowedKeywords?: string[]
): Promise<string> {
  const validate = (input: string) => {
    if (!input || input.trim().length === 0) {
      return "Keypair path cannot be empty";
    }
    const cleanPath = input.trim().replace(/^["']|["']$/g, "");

    // Check if input is an allowed keyword
    if (allowedKeywords && allowedKeywords.includes(cleanPath)) {
      return undefined;
    }

    // Otherwise validate as file path
    if (!existsSync(cleanPath)) {
      return "Keypair file does not exist";
    }
    return undefined;
  };

  if (value !== undefined) {
    const cleanPath = value.trim().replace(/^["']|["']$/g, "");
    const error = validate(cleanPath);
    if (error) {
      logger.error(`${label}: ${error}`);
      process.exit(1);
    }
    return cleanPath;
  }

  const placeholder =
    allowedKeywords && allowedKeywords.length > 0 && allowedKeywords[0]
      ? allowedKeywords[0]
      : "/path/to/keypair.json";

  const result = await getInteractiveInput(label, placeholder, validate);
  return result.replace(/^["']|["']$/g, "");
}

/**
 * Validates and returns a list of EVM addresses as comma-separated string
 */
export async function getOrPromptEvmAddressList(
  value: string | undefined,
  label: string
): Promise<string> {
  const splitAddresses = (input: string): string[] =>
    input
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

  const validate = (input: string) => {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return "At least one signer is required";
    }
    const addresses = splitAddresses(trimmed);
    if (addresses.length === 0) {
      return "At least one signer is required";
    }
    for (const address of addresses) {
      if (!isEvmAddress(address)) {
        return `Invalid EVM address: ${address}`;
      }
    }
    return undefined;
  };

  if (value !== undefined) {
    const trimmed = value.trim();
    const error = validate(trimmed);
    if (error) {
      logger.error(`${label}: ${error}`);
      process.exit(1);
    }
    return trimmed;
  }

  return getInteractiveInput(label, "0xSigner1, 0xSigner2", validate);
}

/**
 * Gets value from CLI args or prompts for it is a non-empty string or prompts for it
 */
export async function getOrPromptString(
  value: string | undefined,
  label: string,
  placeholder?: string
): Promise<string> {
  const validate = (input: string) => {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return "Value cannot be empty";
    }
    return undefined;
  };

  if (value !== undefined) {
    const trimmed = value.trim();
    const error = validate(trimmed);
    if (error) {
      logger.error(`${label}: ${error}`);
      process.exit(1);
    }
    return trimmed;
  }

  return getInteractiveInput(label, placeholder || "", validate);
}

/**
 * Gets a validated hex string from CLI args or prompts the user
 */
export async function getOrPromptHex(
  value: string | undefined,
  label: string
): Promise<string> {
  return getOrPromptWithZod(value, label, hexSchema, "0x...");
}

/**
 * Gets a validated hash (0x... 32 bytes) from CLI args or prompts the user
 * Can be used for transaction hashes, message hashes, etc.
 */
export async function getOrPromptHash(
  value: string | undefined,
  label: string
): Promise<string> {
  return getOrPromptWithZod(value, label, hashSchema, "0x...");
}

/**
 * Validates data with Zod schema and executes handler, or exits with errors
 */
export async function validateAndExecute<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  handler: (parsed: T) => Promise<void>
): Promise<void> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    logger.error("Validation failed:");
    parsed.error.issues.forEach((err) => {
      logger.error(`  - ${err.path.join(".")}: ${err.message}`);
    });
    process.exit(1);
  }
  await handler(parsed.data);
}

/**
 * Gets a validated value from CLI args or prompts the user
 */
async function getOrPromptWithZod<T>(
  value: string | undefined,
  label: string,
  schema: z.ZodSchema<T>,
  placeholder: string
): Promise<string> {
  const validate = (input: string) => {
    const result = schema.safeParse(input.trim());
    return result.success
      ? undefined
      : result.error.issues[0]?.message || "Invalid value";
  };

  if (value !== undefined) {
    const trimmed = value.trim();
    const error = validate(trimmed);
    if (error) {
      logger.error(`${label}: ${error}`);
      process.exit(1);
    }
    return trimmed;
  }

  return getInteractiveInput(label, placeholder, validate);
}
