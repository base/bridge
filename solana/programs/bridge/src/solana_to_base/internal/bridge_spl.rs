use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, TransferChecked};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::common::PartialTokenMetadata;
use crate::{
    common::bridge::Bridge,
    solana_to_base::{check_call, pay_for_gas, Call, OutgoingMessage, Transfer as TransferOp},
    BridgeError,
};

#[allow(clippy::too_many_arguments)]
pub fn bridge_spl_internal<'info>(
    payer: &Signer<'info>,
    from: &Signer<'info>,
    gas_fee_receiver: &AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    from_token_account: &InterfaceAccount<'info, TokenAccount>,
    bridge: &mut Account<'info, Bridge>,
    token_vault: &mut InterfaceAccount<'info, TokenAccount>,
    outgoing_message: &mut Account<'info, OutgoingMessage>,
    token_program: &Interface<'info, TokenInterface>,
    system_program: &Program<'info, System>,
    to: [u8; 20],
    remote_token: [u8; 20],
    amount: u64,
    call: Option<Call>,
) -> Result<()> {
    if let Some(call) = &call {
        check_call(call)?;
    }

    // Check that the provided mint is not a wrapped token.
    // Wrapped tokens should be handled by the wrapped_token_transfer_operation branch which burns the token from the user.
    require!(
        PartialTokenMetadata::try_from(&mint.to_account_info()).is_err(),
        BridgeError::MintIsWrappedToken
    );

    // Get the token vault balance before the transfer.
    let token_vault_balance = token_vault.amount;

    // Lock the token from the user into the token vault.
    let cpi_ctx = CpiContext::new(
        token_program.to_account_info(),
        TransferChecked {
            mint: mint.to_account_info(),
            from: from_token_account.to_account_info(),
            to: token_vault.to_account_info(),
            authority: from.to_account_info(),
        },
    );
    transfer_checked(cpi_ctx, amount, mint.decimals)?;

    // Get the token vault balance after the transfer.
    token_vault.reload()?;
    let token_vault_balance_after = token_vault.amount;

    // Compute the real received amount in case the token has transfer fees.
    let received_amount = token_vault_balance_after - token_vault_balance;

    let message = OutgoingMessage::new_transfer(
        bridge.nonce,
        from.key(),
        TransferOp {
            to,
            local_token: mint.key(),
            remote_token,
            amount: received_amount,
            call,
        },
    );

    pay_for_gas(system_program, payer, gas_fee_receiver, bridge)?;

    **outgoing_message = message;
    bridge.nonce += 1;

    Ok(())
}
