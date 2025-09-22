use anchor_lang::prelude::*;

use crate::common::{PartnerOracleConfig, SetBridgeConfig};

/// Set or update the oracle signer configuration.
///
/// Updates the `oracle_signers` account with a new approval `threshold` and a
/// new list of unique EVM signer addresses. This instruction is used to rotate
/// oracle keys or adjust the required threshold for output root attestations.
pub fn set_partner_config_handler(
    ctx: Context<SetBridgeConfig>,
    partner_cfg: PartnerOracleConfig,
) -> Result<()> {
    partner_cfg.validate()?;
    ctx.accounts.bridge.partner_oracle_config = partner_cfg;
    Ok(())
}
