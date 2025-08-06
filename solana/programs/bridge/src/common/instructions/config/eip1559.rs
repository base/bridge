use anchor_lang::prelude::*;

use crate::common::SetBridgeConfig;

/// Set the minimum base fee parameter
pub fn set_minimum_base_fee_handler(ctx: Context<SetBridgeConfig>, new_fee: u64) -> Result<()> {
    ctx.accounts.bridge.eip1559.config.minimum_base_fee = new_fee;
    Ok(())
}

/// Set the window duration parameter
pub fn set_window_duration_handler(ctx: Context<SetBridgeConfig>, new_duration: u64) -> Result<()> {
    ctx.accounts.bridge.eip1559.config.window_duration_seconds = new_duration;
    Ok(())
}

/// Set the gas target parameter
pub fn set_gas_target_handler(ctx: Context<SetBridgeConfig>, new_target: u64) -> Result<()> {
    ctx.accounts.bridge.eip1559.config.target = new_target;

    Ok(())
}

/// Set the adjustment denominator parameter
pub fn set_adjustment_denominator_handler(
    ctx: Context<SetBridgeConfig>,
    new_denominator: u64,
) -> Result<()> {
    ctx.accounts.bridge.eip1559.config.denominator = new_denominator;
    Ok(())
}
