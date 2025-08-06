use anchor_lang::prelude::*;

use crate::common::SetBridgeConfig;

/// Set the minimum base fee parameter
pub fn set_minimum_base_fee_handler(ctx: Context<SetBridgeConfig>, new_fee: u64) -> Result<()> {
    // Validate the new value
    require!(
        new_fee > 0 && new_fee <= 1_000_000_000,
        Eip1559ConfigError::BaseFee
    );

    // Update the configuration
    ctx.accounts.bridge.eip1559.minimum_base_fee = new_fee;

    Ok(())
}

/// Set the window duration parameter
pub fn set_window_duration_handler(ctx: Context<SetBridgeConfig>, new_duration: u64) -> Result<()> {
    require!(
        new_duration > 0 && new_duration <= 3600,
        Eip1559ConfigError::WindowDuration
    );

    ctx.accounts.bridge.eip1559.window_duration_seconds = new_duration;

    Ok(())
}

/// Set the gas target parameter
pub fn set_gas_target_handler(ctx: Context<SetBridgeConfig>, new_target: u64) -> Result<()> {
    require!(
        new_target > 0 && new_target <= 1_000_000_000,
        Eip1559ConfigError::GasTarget
    );

    ctx.accounts.bridge.eip1559.target = new_target;

    Ok(())
}

/// Set the adjustment denominator parameter
pub fn set_adjustment_denominator_handler(
    ctx: Context<SetBridgeConfig>,
    new_denominator: u64,
) -> Result<()> {
    require!(
        (1..=100).contains(&new_denominator),
        Eip1559ConfigError::AdjustmentDenominator
    );

    ctx.accounts.bridge.eip1559.denominator = new_denominator;

    Ok(())
}

#[error_code]
pub enum Eip1559ConfigError {
    // EIP-1559 Errors
    #[msg("Invalid base fee value")]
    BaseFee,
    #[msg("Invalid window duration")]
    WindowDuration,
    #[msg("Invalid gas target")]
    GasTarget,
    #[msg("Invalid adjustment denominator")]
    AdjustmentDenominator,
}
