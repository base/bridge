use anchor_lang::prelude::*;

use crate::{
    common::bridge::Bridge,
    solana_to_base::{Call, CallType},
};

pub mod wrap_token;
pub use wrap_token::*;

pub mod bridge_call;
pub use bridge_call::*;
pub mod bridge_sol;
pub use bridge_sol::*;
pub mod bridge_spl;
pub use bridge_spl::*;
pub mod bridge_wrapped_token;
pub use bridge_wrapped_token::*;

pub mod buffered;
pub use buffered::*;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct TransferParams {
    pub to: [u8; 20],
    pub remote_token: [u8; 20],
    pub amount: u64,
    pub call: Option<Call>,
}

pub fn check_call(call: &Call) -> Result<()> {
    require!(
        matches!(call.ty, CallType::Call | CallType::DelegateCall) || call.to == [0; 20],
        SolanaToBaseError::CreationWithNonZeroTarget
    );
    Ok(())
}

pub fn check_and_pay_for_gas<'info>(
    system_program: &Program<'info, System>,
    payer: &Signer<'info>,
    gas_fee_receiver: &AccountInfo<'info>,
    bridge: &mut Bridge,
    gas_limit: u64,
    tx_size: usize,
) -> Result<()> {
    check_gas_limit(gas_limit, tx_size, bridge)?;
    pay_for_gas(system_program, payer, gas_fee_receiver, bridge, gas_limit)
}

fn check_gas_limit(gas_limit: u64, tx_size: usize, bridge: &Bridge) -> Result<()> {
    require!(
        gas_limit >= min_gas_limit(tx_size, bridge),
        SolanaToBaseError::GasLimitTooLow
    );

    require!(
        gas_limit <= bridge.gas_config.max_gas_limit_per_message,
        SolanaToBaseError::GasLimitExceeded
    );

    Ok(())
}

fn pay_for_gas<'info>(
    system_program: &Program<'info, System>,
    payer: &Signer<'info>,
    gas_fee_receiver: &AccountInfo<'info>,
    bridge: &mut Bridge,
    gas_limit: u64,
) -> Result<()> {
    // Get the base fee for the current window
    let current_timestamp = Clock::get()?.unix_timestamp;
    let base_fee = bridge.eip1559.refresh_base_fee(current_timestamp);

    // Record gas usage for this transaction
    bridge.eip1559.add_gas_usage(gas_limit);

    let gas_cost = gas_limit * base_fee * bridge.gas_cost_config.gas_cost_scaler
        / bridge.gas_cost_config.gas_cost_scaler_dp;

    let cpi_ctx = CpiContext::new(
        system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: payer.to_account_info(),
            to: gas_fee_receiver.to_account_info(),
        },
    );

    anchor_lang::system_program::transfer(cpi_ctx, gas_cost)?;

    Ok(())
}

fn min_gas_limit(tx_size: usize, bridge: &Bridge) -> u64 {
    tx_size as u64 * 40
        + bridge.gas_config.base_transaction_cost
        + bridge.gas_config.extra
        + bridge.gas_config.execution_prologue
        + bridge.gas_config.execution
        + bridge.gas_config.execution_epilogue
}

#[error_code]
pub enum SolanaToBaseError {
    #[msg("Creation with non-zero target")]
    CreationWithNonZeroTarget,
    #[msg("Gas limit too low")]
    GasLimitTooLow,
    #[msg("Gas limit exceeded")]
    GasLimitExceeded,
}
