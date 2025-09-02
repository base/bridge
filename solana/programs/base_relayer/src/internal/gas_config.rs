use anchor_lang::prelude::*;

use crate::state::Cfg;

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct GasConfig {
    /// Additional relay buffer
    pub extra: u64,
    /// Pre-execution gas buffer
    pub execution_prologue: u64,
    /// Main execution gas buffer
    pub execution: u64,
    /// Post-execution gas buffer
    pub execution_epilogue: u64,
    /// Base transaction cost (Ethereum standard)
    pub base_transaction_cost: u64,
    /// Maximum gas limit per cross-chain message
    pub max_gas_limit_per_message: u64,
    /// Scaling factor for gas cost calculations
    pub gas_cost_scaler: u64,
    /// Decimal precision for gas cost calculations
    pub gas_cost_scaler_dp: u64,
    /// Account that receives gas fees
    pub gas_fee_receiver: Pubkey,
}

pub fn check_and_pay_for_gas<'info>(
    system_program: &Program<'info, System>,
    payer: &Signer<'info>,
    gas_fee_receiver: &AccountInfo<'info>,
    cfg: &mut Cfg,
    gas_limit: u64,
) -> Result<()> {
    check_gas_limit(gas_limit, cfg)?;
    pay_for_gas(system_program, payer, gas_fee_receiver, cfg, gas_limit)
}

fn check_gas_limit(gas_limit: u64, cfg: &Cfg) -> Result<()> {
    require!(
        gas_limit <= cfg.gas_config.max_gas_limit_per_message,
        GasConfigError::GasLimitExceeded
    );

    Ok(())
}

fn pay_for_gas<'info>(
    system_program: &Program<'info, System>,
    payer: &Signer<'info>,
    gas_fee_receiver: &AccountInfo<'info>,
    cfg: &mut Cfg,
    gas_limit: u64,
) -> Result<()> {
    // Get the base fee for the current window
    let current_timestamp = Clock::get()?.unix_timestamp;
    let base_fee = cfg.eip1559.refresh_base_fee(current_timestamp);

    // Record gas usage for this transaction
    cfg.eip1559.add_gas_usage(gas_limit);

    let gas_cost =
        gas_limit * base_fee * cfg.gas_config.gas_cost_scaler / cfg.gas_config.gas_cost_scaler_dp;

    let cpi_ctx = CpiContext::new(
        system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: payer.to_account_info(),
            to: gas_fee_receiver.to_account_info(),
        },
    );

    anchor_lang::system_program::transfer(cpi_ctx, gas_cost)?;

    Ok(())
}

#[error_code]
pub enum GasConfigError {
    #[msg("Gas limit exceeded")]
    GasLimitExceeded,
}
