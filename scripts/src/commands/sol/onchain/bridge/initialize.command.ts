import { Command } from "commander";
import { select, text, confirm, isCancel, cancel } from "@clack/prompts";
import { existsSync } from "fs";

import {
  getOrPromptBigint,
  getOrPromptSolanaAddress,
  getOrPromptEvmAddressList,
  validateAndExecute,
} from "@internal/utils/cli";
import { argsSchema, handleInitialize } from "./initialize.handler";

type CommanderOptions = {
  deployEnv?: string;
  payerKp?: string;
  guardianKp?: string;
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

  if (!opts.deployEnv) {
    const deployEnv = await select({
      message: "Select target deploy environment:",
      options: [
        { value: "testnet-alpha", label: "Testnet Alpha" },
        { value: "testnet-prod", label: "Testnet Prod" },
      ],
      initialValue: "testnet-alpha",
    });
    if (isCancel(deployEnv)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }
    opts.deployEnv = deployEnv;
  }

  if (!opts.payerKp) {
    const useConfigPayer = await confirm({
      message: "Use config payer keypair?",
      initialValue: true,
    });
    if (isCancel(useConfigPayer)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (useConfigPayer) {
      opts.payerKp = "config";
    } else {
      const keypairPath = await text({
        message: "Enter path to payer keypair:",
        placeholder: "/path/to/keypair.json",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Keypair path cannot be empty";
          }
          const cleanPath = value.trim().replace(/^["']|["']$/g, "");
          if (!existsSync(cleanPath)) {
            return "Keypair file does not exist";
          }
        },
      });
      if (isCancel(keypairPath)) {
        cancel("Operation cancelled.");
        process.exit(1);
      }
      opts.payerKp = keypairPath.trim().replace(/^["']|["']$/g, "");
    }
  }

  if (!opts.guardianKp) {
    const usePayerAsGuardian = await confirm({
      message: "Use payer as guardian keypair?",
      initialValue: true,
    });
    if (isCancel(usePayerAsGuardian)) {
      cancel("Operation cancelled.");
      process.exit(1);
    }

    if (usePayerAsGuardian) {
      opts.guardianKp = "payer";
    } else {
      const keypairPath = await text({
        message: "Enter path to guardian keypair:",
        placeholder: "/path/to/guardian.json",
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Keypair path cannot be empty";
          }
          const cleanPath = value.trim().replace(/^["']|["']$/g, "");
          if (!existsSync(cleanPath)) {
            return "Guardian keypair file does not exist";
          }
        },
      });
      if (isCancel(keypairPath)) {
        cancel("Operation cancelled.");
        process.exit(1);
      }
      opts.guardianKp = keypairPath.trim().replace(/^["']|["']$/g, "");
    }
  }

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
  .option(
    "--deploy-env <deployEnv>",
    "Target deploy environment (testnet-alpha | testnet-prod)"
  )
  .option(
    "--payer-kp <path>",
    "Payer keypair: 'config' or custom payer keypair path"
  )
  .option(
    "--guardian-kp <path>",
    "Guardian keypair: 'payer' or custom guardian keypair path"
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
