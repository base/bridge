use anchor_lang::prelude::*;

use crate::common::SetBridgeConfig;

/// Set the maximum call buffer size
pub fn set_max_call_buffer_size_handler(
    ctx: Context<SetBridgeConfig>,
    new_size: u64,
) -> Result<()> {
    require!(
        new_size > 0 && new_size <= 64 * 1024, // 64KB
        BufferConfigError::BufferSize
    );

    ctx.accounts.bridge.buffer_config.max_call_buffer_size = new_size;

    Ok(())
}

#[error_code]
pub enum BufferConfigError {
    #[msg("Invalid buffer size")]
    BufferSize,
}
