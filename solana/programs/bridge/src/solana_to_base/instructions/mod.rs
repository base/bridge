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

fn pay_for_gas<'info>(
    system_program: &Program<'info, System>,
    payer: &Signer<'info>,
    gas_fee_receiver: &AccountInfo<'info>,
    bridge: &mut Bridge,
) -> Result<()> {
    // Get the base fee for the current window
    let current_timestamp = Clock::get()?.unix_timestamp;
    let base_fee = bridge.eip1559.refresh_base_fee(current_timestamp);

    // Record gas usage for this transaction
    eip1559.add_gas_usage(GAS_PER_CALL);

    let gas_cost = GAS_PER_CALL * base_fee * bridge.gas_cost_config.gas_cost_scaler
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

#[error_code]
pub enum SolanaToBaseError {
    #[msg("Creation with non-zero target")]
    CreationWithNonZeroTarget,
}
