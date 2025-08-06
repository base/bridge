use anchor_lang::prelude::*;

use crate::common::SetBridgeConfig;

/// Set the gas cost scaler
pub fn set_gas_cost_scaler_handler(ctx: Context<SetBridgeConfig>, new_scaler: u64) -> Result<()> {
    require!(
        new_scaler > 0 && new_scaler <= 1_000_000_000,
        GasCostConfigError::GasScaler
    );

    ctx.accounts.bridge.gas_cost_config.gas_cost_scaler = new_scaler;

    Ok(())
}

/// Set the gas cost scaler decimal precision
pub fn set_gas_cost_scaler_dp_handler(ctx: Context<SetBridgeConfig>, new_dp: u64) -> Result<()> {
    require!(
        new_dp > 0 && new_dp <= 1_000_000_000,
        GasCostConfigError::GasScalerDP
    );

    ctx.accounts.bridge.gas_cost_config.gas_cost_scaler_dp = new_dp;

    Ok(())
}

/// Set the gas fee receiver
pub fn set_gas_fee_receiver_handler(
    ctx: Context<SetBridgeConfig>,
    new_receiver: Pubkey,
) -> Result<()> {
    ctx.accounts.bridge.gas_cost_config.gas_fee_receiver = new_receiver;

    Ok(())
}

#[error_code]
pub enum GasCostConfigError {
    #[msg("Invalid gas scaler")]
    GasScaler,
    #[msg("Invalid gas scaler decimal precision")]
    GasScalerDP,
}
