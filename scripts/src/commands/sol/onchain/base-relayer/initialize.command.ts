import { Command } from "commander";

import {
  getInteractiveSelect,
  getOrPromptBigint,
  getOrPromptSolanaAddress,
  getOrPromptKeypairPath,
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
  minGasLimitPerMessage?: string;
  maxGasLimitPerMessage?: string;
  gasCostScaler?: string;
  gasCostScalerDp?: string;
  gasFeeReceiver?: string;
};

async function collectInteractiveOptions(
  options: CommanderOptions
): Promise<CommanderOptions> {
  let opts = { ...options };

  if (!opts.deployEnv) {
    opts.deployEnv = await getInteractiveSelect({
      message: "Select target deploy environment:",
      options: [
        { value: "testnet-alpha", label: "Testnet Alpha" },
        { value: "testnet-prod", label: "Testnet Prod" },
      ],
      initialValue: "testnet-alpha",
    });
  }

  opts.payerKp = await getOrPromptKeypairPath(
    opts.payerKp,
    "Enter payer keypair path (or 'config' for Solana CLI config)",
    ["config"]
  );

  opts.guardianKp = await getOrPromptKeypairPath(
    opts.guardianKp,
    "Enter guardian keypair path (or 'payer' for payer keypair)",
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

  opts.minGasLimitPerMessage = await getOrPromptBigint(
    opts.minGasLimitPerMessage,
    "Enter minimum gas limit per message (bigint)"
  );
  opts.maxGasLimitPerMessage = await getOrPromptBigint(
    opts.maxGasLimitPerMessage,
    "Enter maximum gas limit per message (bigint)"
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

  return opts;
}

export const initializeCommand = new Command("initialize")
  .description("Initialize the Base Relayer program")
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
  .option(
    "--min-gas-limit-per-message <uint>",
    "Minimum gas limit per message (bigint)"
  )
  .option(
    "--max-gas-limit-per-message <uint>",
    "Maximum gas limit per message (bigint)"
  )
  .option("--gas-cost-scaler <uint>", "Gas cost scaler (bigint)")
  .option(
    "--gas-cost-scaler-dp <uint>",
    "Gas cost scaler decimal precision (bigint)"
  )
  .option("--gas-fee-receiver <address>", "Gas fee receiver (solana address)")
  .action(async (options) => {
    const opts = await collectInteractiveOptions(options);
    await validateAndExecute(argsSchema, opts, handleInitialize);
  });
