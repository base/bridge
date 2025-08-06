use anchor_lang::prelude::*;

use crate::common::SetBridgeConfig;

/// Set the maximum gas limit per cross-chain message
pub fn set_max_gas_limit_per_message_handler(
    ctx: Context<SetBridgeConfig>,
    new_limit: u64,
) -> Result<()> {
    require!(
        new_limit > 0 && new_limit <= 1_000_000_000,
        GasConfigError::GasLimit
    );

    ctx.accounts.bridge.gas_config.max_gas_limit_per_message = new_limit;

    Ok(())
}

/// Set the base gas cost
pub fn set_base_gas_buffer_handler(ctx: Context<SetBridgeConfig>, new_cost: u64) -> Result<()> {
    require!(
        new_cost > 0 && new_cost <= 1_000_000,
        GasConfigError::BaseGasBuffer
    );

    ctx.accounts.bridge.gas_config.base_transaction_cost = new_cost;

    Ok(())
}

/// Set the extra gas buffer
pub fn set_extra_gas_buffer_handler(ctx: Context<SetBridgeConfig>, new_buffer: u64) -> Result<()> {
    require!(new_buffer <= 1_000_000, GasConfigError::ExtraGasBuffer);

    ctx.accounts.bridge.gas_config.extra = new_buffer;

    Ok(())
}

/// Set the execution prologue gas buffer
pub fn set_execution_prologue_gas_buffer_handler(
    ctx: Context<SetBridgeConfig>,
    new_buffer: u64,
) -> Result<()> {
    require!(
        new_buffer <= 1_000_000,
        GasConfigError::ExecutionPrologueGasBuffer
    );

    ctx.accounts.bridge.gas_config.execution_prologue = new_buffer;

    Ok(())
}

/// Set the execution gas buffer
pub fn set_execution_gas_buffer_handler(
    ctx: Context<SetBridgeConfig>,
    new_buffer: u64,
) -> Result<()> {
    require!(new_buffer <= 1_000_000, GasConfigError::ExecutionGasBuffer);

    ctx.accounts.bridge.gas_config.execution = new_buffer;

    Ok(())
}

/// Set the execution epilogue gas buffer
pub fn set_execution_epilogue_gas_buffer_handler(
    ctx: Context<SetBridgeConfig>,
    new_buffer: u64,
) -> Result<()> {
    require!(
        new_buffer <= 1_000_000,
        GasConfigError::ExecutionEpilogueGasBuffer
    );

    ctx.accounts.bridge.gas_config.execution_epilogue = new_buffer;

    Ok(())
}

#[error_code]
pub enum GasConfigError {
    #[msg("Invalid gas limit")]
    GasLimit,
    #[msg("Invalid base gas buffer")]
    BaseGasBuffer,
    #[msg("Invalid extra gas buffer")]
    ExtraGasBuffer,
    #[msg("Invalid execution prologue gas buffer")]
    ExecutionPrologueGasBuffer,
    #[msg("Invalid execution gas buffer")]
    ExecutionGasBuffer,
    #[msg("Invalid execution epilogue gas buffer")]
    ExecutionEpilogueGasBuffer,
}
