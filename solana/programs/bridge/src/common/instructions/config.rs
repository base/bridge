use anchor_lang::prelude::*;

use crate::common::{bridge::Bridge, BRIDGE_SEED};

/// Accounts struct for bridge configuration setter instructions
/// Only the guardian can update these parameters
#[derive(Accounts)]
pub struct SetBridgeConfig<'info> {
    #[account(
        mut,
        has_one = guardian @ ConfigError::UnauthorizedConfigUpdate,
        seeds = [BRIDGE_SEED],
        bump
    )]
    pub bridge: Account<'info, Bridge>,

    /// The guardian account authorized to update configuration
    pub guardian: Signer<'info>,
}

// ===== EIP-1559 CONFIGURATION SETTERS =====

/// Set the minimum base fee parameter
pub fn set_minimum_base_fee_handler(ctx: Context<SetBridgeConfig>, new_fee: u64) -> Result<()> {
    // Validate the new value
    require!(
        new_fee > 0 && new_fee <= 1_000_000_000,
        ConfigError::InvalidBaseFee
    );

    let old_value = ctx.accounts.bridge.eip1559.minimum_base_fee;

    // Update the configuration
    ctx.accounts.bridge.eip1559.minimum_base_fee = new_fee;

    // Emit event for monitoring
    emit!(Eip1559ConfigUpdated {
        parameter: "minimum_base_fee".to_string(),
        old_value,
        new_value: new_fee,
        guardian: ctx.accounts.guardian.key(),
    });

    Ok(())
}

/// Set the window duration parameter
pub fn set_window_duration_handler(ctx: Context<SetBridgeConfig>, new_duration: u64) -> Result<()> {
    require!(
        new_duration > 0 && new_duration <= 3600,
        ConfigError::InvalidWindowDuration
    );

    let old_value = ctx.accounts.bridge.eip1559.window_duration_seconds;

    ctx.accounts.bridge.eip1559.window_duration_seconds = new_duration;

    emit!(Eip1559ConfigUpdated {
        parameter: "window_duration".to_string(),
        old_value,
        new_value: new_duration,
        guardian: ctx.accounts.guardian.key(),
    });

    Ok(())
}

/// Set the gas target parameter
pub fn set_gas_target_handler(ctx: Context<SetBridgeConfig>, new_target: u64) -> Result<()> {
    require!(
        new_target > 0 && new_target <= 1_000_000_000,
        ConfigError::InvalidGasTarget
    );

    let old_value = ctx.accounts.bridge.eip1559.target;

    ctx.accounts.bridge.eip1559.target = new_target;

    emit!(Eip1559ConfigUpdated {
        parameter: "gas_target".to_string(),
        old_value,
        new_value: new_target,
        guardian: ctx.accounts.guardian.key(),
    });

    Ok(())
}

/// Set the adjustment denominator parameter
pub fn set_adjustment_denominator_handler(
    ctx: Context<SetBridgeConfig>,
    new_denominator: u64,
) -> Result<()> {
    require!(
        (1..=100).contains(&new_denominator),
        ConfigError::InvalidAdjustmentDenominator
    );

    let old_value = ctx.accounts.bridge.eip1559.denominator;

    ctx.accounts.bridge.eip1559.denominator = new_denominator;

    emit!(Eip1559ConfigUpdated {
        parameter: "adjustment_denominator".to_string(),
        old_value,
        new_value: new_denominator,
        guardian: ctx.accounts.guardian.key(),
    });

    Ok(())
}

// ===== GAS COST CONFIGURATION SETTERS =====

/// Set the gas cost scaler
pub fn set_gas_cost_scaler_handler(ctx: Context<SetBridgeConfig>, new_scaler: u64) -> Result<()> {
    require!(
        new_scaler > 0 && new_scaler <= 1_000_000_000,
        ConfigError::InvalidGasScaler
    );

    let old_value = ctx.accounts.bridge.gas_cost_config.gas_cost_scaler;
    ctx.accounts.bridge.gas_cost_config.gas_cost_scaler = new_scaler;

    emit!(BridgeConfigUpdated {
        category: "gas".to_string(),
        parameter: "gas_cost_scaler".to_string(),
        old_value: old_value.to_string(),
        new_value: new_scaler.to_string(),
        guardian: ctx.accounts.guardian.key(),
    });

    Ok(())
}

/// Set the gas cost scaler decimal precision
pub fn set_gas_cost_scaler_dp_handler(ctx: Context<SetBridgeConfig>, new_dp: u64) -> Result<()> {
    require!(
        new_dp > 0 && new_dp <= 1_000_000_000,
        ConfigError::InvalidGasScalerDP
    );

    let old_value = ctx.accounts.bridge.gas_cost_config.gas_cost_scaler_dp;
    ctx.accounts.bridge.gas_cost_config.gas_cost_scaler_dp = new_dp;

    emit!(BridgeConfigUpdated {
        category: "gas".to_string(),
        parameter: "gas_cost_scaler_dp".to_string(),
        old_value: old_value.to_string(),
        new_value: new_dp.to_string(),
        guardian: ctx.accounts.guardian.key(),
    });

    Ok(())
}

/// Set the gas fee receiver
pub fn set_gas_fee_receiver_handler(
    ctx: Context<SetBridgeConfig>,
    new_receiver: Pubkey,
) -> Result<()> {
    let old_value = ctx.accounts.bridge.gas_cost_config.gas_fee_receiver;
    ctx.accounts.bridge.gas_cost_config.gas_fee_receiver = new_receiver;

    emit!(BridgeConfigUpdated {
        category: "gas".to_string(),
        parameter: "gas_fee_receiver".to_string(),
        old_value: old_value.to_string(),
        new_value: new_receiver.to_string(),
        guardian: ctx.accounts.guardian.key(),
    });

    Ok(())
}

// ===== BUFFER CONFIGURATION SETTERS =====

/// Set the extra relay buffer
pub fn set_extra_buffer_handler(ctx: Context<SetBridgeConfig>, new_buffer: u64) -> Result<()> {
    require!(new_buffer <= 1_000_000, ConfigError::InvalidBuffer);

    let old_value = ctx.accounts.bridge.gas_config.extra;
    ctx.accounts.bridge.gas_config.extra = new_buffer;

    emit!(BridgeConfigUpdated {
        category: "buffer".to_string(),
        parameter: "extra_buffer".to_string(),
        old_value: old_value.to_string(),
        new_value: new_buffer.to_string(),
        guardian: ctx.accounts.guardian.key(),
    });

    Ok(())
}

/// Set the execution prologue gas buffer
pub fn set_execution_prologue_gas_buffer_handler(
    ctx: Context<SetBridgeConfig>,
    new_buffer: u64,
) -> Result<()> {
    require!(new_buffer <= 1_000_000, ConfigError::InvalidBuffer);

    let old_value = ctx.accounts.bridge.gas_config.execution_prologue;
    ctx.accounts.bridge.gas_config.execution_prologue = new_buffer;

    emit!(BridgeConfigUpdated {
        category: "buffer".to_string(),
        parameter: "execution_prologue_gas_buffer".to_string(),
        old_value: old_value.to_string(),
        new_value: new_buffer.to_string(),
        guardian: ctx.accounts.guardian.key(),
    });

    Ok(())
}

/// Set the execution gas buffer
pub fn set_execution_gas_buffer_handler(
    ctx: Context<SetBridgeConfig>,
    new_buffer: u64,
) -> Result<()> {
    require!(new_buffer <= 1_000_000, ConfigError::InvalidBuffer);

    let old_value = ctx.accounts.bridge.gas_config.execution;
    ctx.accounts.bridge.gas_config.execution = new_buffer;

    emit!(BridgeConfigUpdated {
        category: "buffer".to_string(),
        parameter: "execution_gas_buffer".to_string(),
        old_value: old_value.to_string(),
        new_value: new_buffer.to_string(),
        guardian: ctx.accounts.guardian.key(),
    });

    Ok(())
}

/// Set the execution epilogue gas buffer
pub fn set_execution_epilogue_gas_buffer_handler(
    ctx: Context<SetBridgeConfig>,
    new_buffer: u64,
) -> Result<()> {
    require!(new_buffer <= 1_000_000, ConfigError::InvalidBuffer);

    let old_value = ctx.accounts.bridge.gas_config.execution_epilogue;
    ctx.accounts.bridge.gas_config.execution_epilogue = new_buffer;

    emit!(BridgeConfigUpdated {
        category: "buffer".to_string(),
        parameter: "execution_epilogue_gas_buffer".to_string(),
        old_value: old_value.to_string(),
        new_value: new_buffer.to_string(),
        guardian: ctx.accounts.guardian.key(),
    });

    Ok(())
}

/// Set the base transaction cost
pub fn set_base_transaction_cost_handler(
    ctx: Context<SetBridgeConfig>,
    new_cost: u64,
) -> Result<()> {
    require!(
        new_cost > 0 && new_cost <= 1_000_000,
        ConfigError::InvalidTransactionCost
    );

    let old_value = ctx.accounts.bridge.gas_config.base_transaction_cost;
    ctx.accounts.bridge.gas_config.base_transaction_cost = new_cost;

    emit!(BridgeConfigUpdated {
        category: "buffer".to_string(),
        parameter: "base_transaction_cost".to_string(),
        old_value: old_value.to_string(),
        new_value: new_cost.to_string(),
        guardian: ctx.accounts.guardian.key(),
    });

    Ok(())
}

/// Set the maximum gas limit per cross-chain message
pub fn set_max_gas_limit_per_message_handler(
    ctx: Context<SetBridgeConfig>,
    new_limit: u64,
) -> Result<()> {
    require!(
        new_limit > 0 && new_limit <= 1_000_000_000,
        ConfigError::InvalidGasLimit
    );

    let old_value = ctx.accounts.bridge.gas_config.max_gas_limit_per_message;
    ctx.accounts.bridge.gas_config.max_gas_limit_per_message = new_limit;

    emit!(BridgeConfigUpdated {
        category: "gas".to_string(),
        parameter: "max_gas_limit_per_message".to_string(),
        old_value: old_value.to_string(),
        new_value: new_limit.to_string(),
        guardian: ctx.accounts.guardian.key(),
    });

    Ok(())
}

// ===== METADATA CONFIGURATION SETTERS =====
// Note: Token metadata keys use constants since they're needed in trait implementations

// ===== PROTOCOL CONFIGURATION SETTERS =====

/// Set the block interval requirement
pub fn set_block_interval_requirement_handler(
    ctx: Context<SetBridgeConfig>,
    new_interval: u64,
) -> Result<()> {
    require!(
        new_interval > 0 && new_interval <= 10_000,
        ConfigError::InvalidBlockInterval
    );

    let old_value = ctx
        .accounts
        .bridge
        .protocol_config
        .block_interval_requirement;
    ctx.accounts
        .bridge
        .protocol_config
        .block_interval_requirement = new_interval;

    emit!(BridgeConfigUpdated {
        category: "protocol".to_string(),
        parameter: "block_interval_requirement".to_string(),
        old_value: old_value.to_string(),
        new_value: new_interval.to_string(),
        guardian: ctx.accounts.guardian.key(),
    });

    Ok(())
}

// ===== LIMITS CONFIGURATION SETTERS =====

/// Set the maximum call buffer size
pub fn set_max_call_buffer_size_handler(
    ctx: Context<SetBridgeConfig>,
    new_size: u64,
) -> Result<()> {
    require!(
        new_size > 0 && new_size <= 1024 * 1024,
        ConfigError::InvalidBufferSize
    ); // Max 1MB

    let old_value = ctx.accounts.bridge.buffer_config.max_call_buffer_size;
    ctx.accounts.bridge.buffer_config.max_call_buffer_size = new_size;

    emit!(BridgeConfigUpdated {
        category: "limits".to_string(),
        parameter: "max_call_buffer_size".to_string(),
        old_value: old_value.to_string(),
        new_value: new_size.to_string(),
        guardian: ctx.accounts.guardian.key(),
    });

    Ok(())
}

// ===== ABI CONFIGURATION SETTERS =====
// Note: ABI encoding overheads use constants since they're needed in state struct methods

// ===== EVENTS =====

/// Event for monitoring EIP-1559 configuration changes
#[event]
pub struct Eip1559ConfigUpdated {
    pub parameter: String,
    pub old_value: u64,
    pub new_value: u64,
    pub guardian: Pubkey,
}

/// Event for monitoring bridge configuration changes
#[event]
pub struct BridgeConfigUpdated {
    pub category: String,
    pub parameter: String,
    pub old_value: String,
    pub new_value: String,
    pub guardian: Pubkey,
}

// ===== ERRORS =====

/// Error codes for configuration updates
#[error_code]
pub enum ConfigError {
    #[msg("Unauthorized to update configuration")]
    UnauthorizedConfigUpdate = 6000,

    // EIP-1559 Errors
    #[msg("Invalid base fee value")]
    InvalidBaseFee,
    #[msg("Invalid window duration")]
    InvalidWindowDuration,
    #[msg("Invalid gas target")]
    InvalidGasTarget,
    #[msg("Invalid adjustment denominator")]
    InvalidAdjustmentDenominator,

    // Bridge Config Errors
    #[msg("Invalid gas limit value")]
    InvalidGasLimit,
    #[msg("Invalid gas scaler value")]
    InvalidGasScaler,
    #[msg("Invalid gas scaler decimal precision")]
    InvalidGasScalerDP,
    #[msg("Invalid buffer value")]
    InvalidBuffer,
    #[msg("Invalid transaction cost")]
    InvalidTransactionCost,

    #[msg("Invalid block interval")]
    InvalidBlockInterval,
    #[msg("Invalid buffer size")]
    InvalidBufferSize,
    #[msg("Invalid data length")]
    InvalidDataLength,
}
