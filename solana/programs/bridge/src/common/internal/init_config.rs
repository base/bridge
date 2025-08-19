use anchor_lang::prelude::*;

use crate::common::{
    BaseOracleConfig, BufferConfig, Eip1559Config, GasConfig, PartnerOracleConfig, ProtocolConfig,
};

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct Config {
    /// Configuration parameters for EIP-1559-inspired fee calculations
    pub eip1559_config: Eip1559Config,
    /// Configuration parameters for outgoing message pricing
    pub gas_config: GasConfig,
    /// Configuration parameters for bridge protocol
    pub protocol_config: ProtocolConfig,
    /// Configuration parameters for pre-loading Solana --> Base messages in buffer accounts
    pub buffer_config: BufferConfig,
    /// Partner oracle configuration containing the required signature threshold
    pub partner_oracle_config: PartnerOracleConfig,
    /// Configuration parameters for Base oracle signers
    pub base_oracle_config: BaseOracleConfig,
}

impl Config {
    pub fn validate(&self) -> Result<()> {
        self.base_oracle_config.validate()?;
        self.partner_oracle_config.validate()?;
        Ok(())
    }
}
