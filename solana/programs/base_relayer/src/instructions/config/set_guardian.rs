use anchor_lang::prelude::*;

use crate::instructions::SetConfig;

pub fn set_guardian_handler(ctx: Context<SetConfig>, guardian: Pubkey) -> Result<()> {
    ctx.accounts.cfg.guardian = guardian;
    Ok(())
}
