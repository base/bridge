use anchor_lang::prelude::*;

use crate::internal::{Eip1559, GasConfig};

#[account]
#[derive(Debug, PartialEq, Eq, InitSpace)]
pub struct Cfg {
    /// Guardian pubkey authorized to update configuration
    pub guardian: Pubkey,
    /// EIP-1559 state and configuration for dynamic pricing.
    pub eip1559: Eip1559,
    /// Gas configuration
    pub gas_config: GasConfig,
}
