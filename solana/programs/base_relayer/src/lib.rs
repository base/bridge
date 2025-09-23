#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

mod constants;
mod instructions;
mod internal;
mod state;

use instructions::*;
use internal::*;
use state::*;

#[cfg(test)]
mod test_utils;

declare_id!("2UuNqre3Sif4ueMfCRZqwQG7LrH4H4xJsxDf7QmGCeya");

#[program]
pub mod base_relayer {

    use super::*;

    /// Initializes the Base relayer program configuration.
    /// Creates the `Cfg` PDA with guardian authority and pricing parameters used to
    /// charge for cross-chain execution (EIP-1559) and gas accounting. Must be
    /// called once during deployment.
    ///
    /// # Arguments
    /// * `ctx` - The context containing accounts for initialization: `payer` funds
    ///           account creation, `cfg` PDA is created with seeds, and `guardian`
    ///           is recorded as the admin authority.
    /// * `cfg` - Initial configuration values: guardian pubkey, EIP-1559 state and
    ///           config, and gas-cost configuration.
    pub fn initialize(
        ctx: Context<Initialize>,
        new_guardian: Pubkey,
        eip1559_config: Eip1559Config,
        gas_config: GasConfig,
    ) -> Result<()> {
        initialize_handler(ctx, new_guardian, eip1559_config, gas_config)
    }

    /// Updates the EIP1559 configuration.
    /// Only the recorded `guardian` may call this instruction.
    ///
    /// # Arguments
    /// * `ctx` - The context containing the `cfg` PDA and the `guardian` signer.
    ///           Authorization is enforced via an Anchor `has_one` constraint.
    /// * `cfg` - The new EIP1559 configuration to write in full.
    pub fn set_eip1559_config(
        ctx: Context<SetConfig>,
        eip1559_config: Eip1559Config,
    ) -> Result<()> {
        set_eip1559_config_handler(ctx, eip1559_config)
    }

    /// Updates the Gas configuration.
    /// Only the recorded `guardian` may call this instruction.
    ///
    /// # Arguments
    /// * `ctx` - The context containing the `cfg` PDA and the `guardian` signer.
    ///           Authorization is enforced via an Anchor `has_one` constraint.
    /// * `cfg` - The new Gas configuration to write in full.
    pub fn set_gas_config(ctx: Context<SetConfig>, gas_config: GasConfig) -> Result<()> {
        set_gas_config_handler(ctx, gas_config)
    }

    /// Updates the configured guardian.
    /// Only the current `guardian` may call this instruction.
    ///
    /// # Arguments
    /// * `ctx` - The context containing the `cfg` PDA and the `guardian` signer.
    ///           Authorization is enforced via an Anchor `has_one` constraint.
    /// * `cfg` - The new guardian with permissions to update other configs.
    pub fn set_guardian(ctx: Context<SetConfig>, new_guardian: Pubkey) -> Result<()> {
        set_guardian_handler(ctx, new_guardian)
    }

    /// Pays the gas cost for relaying a message to Base and records the request.
    /// Transfers lamports from `payer` to `cfg.gas_config.gas_fee_receiver` using
    /// the current EIP-1559 pricing and the provided `gas_limit`. Also initializes
    /// a new `MessageToRelay` account containing the `outgoing_message` and
    /// `gas_limit`. The payer is the sole authorization; the guardian is not
    /// required for this operation.
    ///
    /// # Arguments
    /// * `ctx`              - The context including `payer`, mutable `cfg` PDA
    ///                         (for fee window updates), `gas_fee_receiver` (must
    ///                         match configured receiver), and a new
    ///                         `message_to_relay` account.
    /// * `outgoing_message` - The Base-side message identifier to be executed.
    /// * `gas_limit`        - Maximum gas units to budget for execution on Base.
    ///
    /// # Errors
    /// Returns an error if the `gas_fee_receiver` does not match the configured
    /// receiver or if the payer lacks sufficient lamports to cover the computed
    /// fee.
    pub fn pay_for_relay(
        ctx: Context<PayForRelay>,
        outgoing_message: Pubkey,
        gas_limit: u64,
    ) -> Result<()> {
        pay_for_relay_handler(ctx, outgoing_message, gas_limit)
    }
}
