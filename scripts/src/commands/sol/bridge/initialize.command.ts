import { Command } from "commander";
import { text, isCancel, cancel } from "@clack/prompts";

import {
  getOrPromptBigint,
  getOrPromptSolanaAddress,
  getOrPromptEvmAddressList,
  getOrPromptFilePath,
  validateAndExecute,
} from "@internal/utils/cli";
import { argsSchema, handleInitialize } from "./initialize.handler";

type CommanderOptions = {
  programId?: string;
  rpcUrl?: string;
  payerKp?: string;
  guardian?: string;
  eip1559Target?: string;
  eip1559Denominator?: string;
  eip1559WindowDurationSeconds?: string;
  eip1559MinimumBaseFee?: string;
  gasPerCall?: string;
  gasCostScaler?: string;
  gasCostScalerDp?: string;
  gasFeeReceiver?: string;
  protocolBlockIntervalRequirement?: string;
  bufferMaxCallBufferSize?: string;
  baseOracleThreshold?: string;
  baseOracleSignerCount?: string;
  baseOracleSigners?: string;
  partnerOracleRequiredThreshold?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  opts.programId = await getOrPromptSolanaAddress(
    opts.programId,
    "Enter Bridge program ID (Solana address)"
  );

  if (!opts.rpcUrl) {
    const rpcUrl = await text({
      message: "Enter Solana RPC URL:",
      placeholder: "https://api.devnet.solana.com",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "RPC URL is required";
        }
        try {
          new URL(value);
          return undefined;
        } catch {
          return "Invalid URL format";
        }
      },
    });

    if (isCancel(rpcUrl)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.rpcUrl = rpcUrl;
  }

  opts.payerKp = await getOrPromptFilePath(
    opts.payerKp,
    "Enter payer keypair path (or 'config' for Solana CLI config)",
    ["config"]
  );

  opts.guardian = await getOrPromptSolanaAddress(
    opts.guardian,
    "Enter guardian address (or 'payer' to use payer address)",
    ["payer"]
  );

  opts.eip1559Target = await getOrPromptBigint(
    opts.eip1559Target,
    "Enter EIP-1559 target (bigint)"
  );
  opts.eip1559Denominator = await getOrPromptBigint(
    opts.eip1559Denominator,
    "Enter EIP-1559 denominator (bigint)"
  );
  opts.eip1559WindowDurationSeconds = await getOrPromptBigint(
    opts.eip1559WindowDurationSeconds,
    "Enter EIP-1559 window duration seconds (bigint)"
  );
  opts.eip1559MinimumBaseFee = await getOrPromptBigint(
    opts.eip1559MinimumBaseFee,
    "Enter EIP-1559 minimum base fee (bigint)"
  );

  opts.gasPerCall = await getOrPromptBigint(
    opts.gasPerCall,
    "Enter gas per call (bigint)"
  );
  opts.gasCostScaler = await getOrPromptBigint(
    opts.gasCostScaler,
    "Enter gas cost scaler (bigint)"
  );
  opts.gasCostScalerDp = await getOrPromptBigint(
    opts.gasCostScalerDp,
    "Enter gas cost scaler decimal precision (bigint)"
  );
  opts.gasFeeReceiver = await getOrPromptSolanaAddress(
    opts.gasFeeReceiver,
    "Enter gas fee receiver (solana address)"
  );

  opts.protocolBlockIntervalRequirement = await getOrPromptBigint(
    opts.protocolBlockIntervalRequirement,
    "Enter protocol block interval requirement (bigint)"
  );

  opts.bufferMaxCallBufferSize = await getOrPromptBigint(
    opts.bufferMaxCallBufferSize,
    "Enter buffer max call buffer size (bigint)"
  );

  opts.baseOracleThreshold = await getOrPromptBigint(
    opts.baseOracleThreshold,
    "Enter base oracle threshold (bigint)"
  );
  opts.baseOracleSignerCount = await getOrPromptBigint(
    opts.baseOracleSignerCount,
    "Enter base oracle signer count (bigint)"
  );
  opts.baseOracleSigners = await getOrPromptEvmAddressList(
    opts.baseOracleSigners,
    "Enter base oracle signers (comma-separated EVM addresses)"
  );

  opts.partnerOracleRequiredThreshold = await getOrPromptBigint(
    opts.partnerOracleRequiredThreshold,
    "Enter partner oracle required threshold (bigint)"
  );

  return opts;
}

export const initializeCommand = new Command("initialize")
  .description("Initialize the Bridge Solana program")
  .option("--program-id <address>", "Bridge program address")
  .option(
    "--rpc-url <url>",
    "Solana RPC URL (e.g., https://api.devnet.solana.com)"
  )
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .option(
    "--guardian <address>",
    "Guardian address: 'payer' or Solana public key"
  )
  .option("--eip1559-target <uint>", "EIP-1559 target (bigint)")
  .option("--eip1559-denominator <uint>", "EIP-1559 denominator (bigint)")
  .option(
    "--eip1559-window-duration-seconds <uint>",
    "EIP-1559 window duration seconds (bigint)"
  )
  .option(
    "--eip1559-minimum-base-fee <uint>",
    "EIP-1559 minimum base fee (bigint)"
  )
  .option("--gas-per-call <uint>", "Gas per call (bigint)")
  .option("--gas-cost-scaler <uint>", "Gas cost scaler (bigint)")
  .option(
    "--gas-cost-scaler-dp <uint>",
    "Gas cost scaler decimal precision (bigint)"
  )
  .option("--gas-fee-receiver <address>", "Gas fee receiver (solana address)")
  .option(
    "--protocol-block-interval-requirement <uint>",
    "Protocol block interval requirement (bigint)"
  )
  .option(
    "--buffer-max-call-buffer-size <uint>",
    "Buffer max call buffer size (bigint)"
  )
  .option("--base-oracle-threshold <int>", "Base oracle threshold (bigint)")
  .option(
    "--base-oracle-signer-count <int>",
    "Base oracle signer count (bigint)"
  )
  .option(
    "--base-oracle-signers <hexes>",
    "Comma or space separated base oracle signer addresses"
  )
  .option(
    "--partner-oracle-required-threshold <int>",
    "Partner oracle required threshold (bigint)"
  )
  .action(async (options) => {
    const collected = await collectInteractiveOptions(options);
    await validateAndExecute(argsSchema, collected, handleInitialize);
  });
