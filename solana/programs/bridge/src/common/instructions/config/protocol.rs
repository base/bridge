use anchor_lang::prelude::*;

use crate::common::SetBridgeConfig;

/// Set the block interval requirement
pub fn set_block_interval_requirement_handler(
    ctx: Context<SetBridgeConfig>,
    new_interval: u64,
) -> Result<()> {
    ctx.accounts
        .bridge
        .protocol_config
        .block_interval_requirement = new_interval;

    Ok(())
}
