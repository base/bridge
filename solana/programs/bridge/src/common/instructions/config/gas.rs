use anchor_lang::prelude::*;

use crate::common::SetBridgeConfig;

/// Set the expected gas amount per cross-chain message
pub fn set_gas_per_call_handler(ctx: Context<SetBridgeConfig>, new_val: u64) -> Result<()> {
    ctx.accounts.bridge.gas_config.gas_per_call = new_val;
    Ok(())
}
