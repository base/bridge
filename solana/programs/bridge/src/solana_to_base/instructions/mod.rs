use anchor_lang::prelude::*;

use crate::{
    common::bridge::Eip1559,
    solana_to_base::{
        Call, CallType, GAS_COST_SCALER, GAS_COST_SCALER_DP, MAX_GAS_LIMIT_PER_MESSAGE,
    },
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
    eip1559: &mut Eip1559,
    gas_limit: u64,
    tx_size: usize,
) -> Result<()> {
    check_gas_limit(gas_limit, tx_size)?;
    pay_for_gas(system_program, payer, gas_fee_receiver, eip1559, gas_limit)
}

fn check_gas_limit(gas_limit: u64, tx_size: usize) -> Result<()> {
    require!(
        gas_limit >= min_gas_limit(tx_size),
        SolanaToBaseError::GasLimitTooLow
    );
    require!(
        gas_limit <= MAX_GAS_LIMIT_PER_MESSAGE,
        SolanaToBaseError::GasLimitExceeded
    );

    Ok(())
}

fn pay_for_gas<'info>(
    system_program: &Program<'info, System>,
    payer: &Signer<'info>,
    gas_fee_receiver: &AccountInfo<'info>,
    eip1559: &mut Eip1559,
    gas_limit: u64,
) -> Result<()> {
    // Get the base fee for the current window
    let current_timestamp = Clock::get()?.unix_timestamp;
    let base_fee = eip1559.refresh_base_fee(current_timestamp);

    // Record gas usage for this transaction
    eip1559.add_gas_usage(gas_limit);

    let gas_cost = gas_limit * base_fee * GAS_COST_SCALER / GAS_COST_SCALER_DP;

    let cpi_ctx = CpiContext::new(
        system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: payer.to_account_info(),
            to: gas_fee_receiver.clone(),
        },
    );
    anchor_lang::system_program::transfer(cpi_ctx, gas_cost)?;

    Ok(())
}

fn min_gas_limit(tx_size: usize) -> u64 {
    // Additional buffer to account for the gas used in the `Bridge.relayMessages` function.
    const EXTRA_BUFFER: u64 = 10_000;

    // Buffers to account for the gas used in the `Bridge.__validateAndRelay` function.
    // See `Bridge.sol` for more details.
    const EXECUTION_PROLOGUE_GAS_BUFFER: u64 = 65_000;
    const EXECUTION_GAS_BUFFER: u64 = 40_000;
    const EXECUTION_EPILOGUE_GAS_BUFFER: u64 = 25_000;

    tx_size as u64 * 40
        + 21_000
        + EXTRA_BUFFER
        + EXECUTION_PROLOGUE_GAS_BUFFER
        + EXECUTION_GAS_BUFFER
        + EXECUTION_EPILOGUE_GAS_BUFFER
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
