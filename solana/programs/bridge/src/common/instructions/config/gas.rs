use anchor_lang::prelude::*;

use crate::common::SetBridgeConfig;

/// Set the maximum gas limit per cross-chain message
pub fn set_max_gas_limit_per_message_handler(
    ctx: Context<SetBridgeConfig>,
    new_limit: u64,
) -> Result<()> {
    ctx.accounts.bridge.gas_config.max_gas_limit_per_message = new_limit;
    Ok(())
}

/// Set the base gas cost
pub fn set_base_gas_buffer_handler(ctx: Context<SetBridgeConfig>, new_cost: u64) -> Result<()> {
    ctx.accounts.bridge.gas_config.base_transaction_cost = new_cost;
    Ok(())
}

/// Set the extra gas buffer
pub fn set_extra_gas_buffer_handler(ctx: Context<SetBridgeConfig>, new_buffer: u64) -> Result<()> {
    ctx.accounts.bridge.gas_config.extra = new_buffer;
    Ok(())
}

/// Set the execution prologue gas buffer
pub fn set_execution_prologue_gas_buffer_handler(
    ctx: Context<SetBridgeConfig>,
    new_buffer: u64,
) -> Result<()> {
    ctx.accounts.bridge.gas_config.execution_prologue = new_buffer;
    Ok(())
}

/// Set the execution gas buffer
pub fn set_execution_gas_buffer_handler(
    ctx: Context<SetBridgeConfig>,
    new_buffer: u64,
) -> Result<()> {
    ctx.accounts.bridge.gas_config.execution = new_buffer;
    Ok(())
}

/// Set the execution epilogue gas buffer
pub fn set_execution_epilogue_gas_buffer_handler(
    ctx: Context<SetBridgeConfig>,
    new_buffer: u64,
) -> Result<()> {
    ctx.accounts.bridge.gas_config.execution_epilogue = new_buffer;
    Ok(())
}
