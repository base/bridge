use anchor_lang::prelude::*;

use crate::common::SetBridgeConfig;

/// Set the block interval requirement
pub fn set_block_interval_requirement_handler(
    ctx: Context<SetBridgeConfig>,
    new_interval: u64,
) -> Result<()> {
    require!(
        new_interval <= 1000,
        SetBlockIntervalRequirementError::NewIntervalTooHigh
    );

    ctx.accounts
        .bridge
        .protocol_config
        .block_interval_requirement = new_interval;

    Ok(())
}

#[error_code]
pub enum SetBlockIntervalRequirementError {
    #[msg("New interval too high")]
    NewIntervalTooHigh,
}
