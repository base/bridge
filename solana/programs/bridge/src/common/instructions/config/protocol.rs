use anchor_lang::prelude::*;

use crate::common::SetBridgeConfig;

/// Set the block interval requirement
pub fn set_block_interval_requirement_handler(
    ctx: Context<SetBridgeConfig>,
    new_interval: u64,
) -> Result<()> {
    require!(
        new_interval > 0 && new_interval <= 10_000,
        ProtocolConfigError::BlockInterval
    );

    ctx.accounts
        .bridge
        .protocol_config
        .block_interval_requirement = new_interval;

    Ok(())
}

#[error_code]
pub enum ProtocolConfigError {
    #[msg("Invalid block interval")]
    BlockInterval,
}
