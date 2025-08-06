use anchor_lang::prelude::*;

use crate::common::SetBridgeConfig;

/// Set the pause status of the bridge
/// Only the guardian can call this function
pub fn set_pause_status_handler(ctx: Context<SetBridgeConfig>, paused: bool) -> Result<()> {
    ctx.accounts.bridge.paused = paused;
    Ok(())
}