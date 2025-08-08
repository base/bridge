use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{self, BurnChecked, Mint, TokenAccount},
};

use crate::solana_to_base::{check_call, pay_for_gas};
use crate::{
    common::{bridge::Bridge, PartialTokenMetadata},
    solana_to_base::{Call, OutgoingMessage, Transfer as TransferOp},
};

#[allow(clippy::too_many_arguments)]
pub fn bridge_wrapped_token_internal<'info>(
    payer: &Signer<'info>,
    from: &Signer<'info>,
    gas_fee_receiver: &AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    from_token_account: &InterfaceAccount<'info, TokenAccount>,
    bridge: &mut Account<'info, Bridge>,
    outgoing_message: &mut Account<'info, OutgoingMessage>,
    token_program: &Program<'info, Token2022>,
    system_program: &Program<'info, System>,
    to: [u8; 20],
    amount: u64,
    call: Option<Call>,
) -> Result<()> {
    if let Some(call) = &call {
        check_call(call)?;
    }

    // Get the token metadata from the mint.
    let partial_token_metadata = PartialTokenMetadata::try_from(&mint.to_account_info())?;

    let message = OutgoingMessage::new_transfer(
        bridge.nonce,
        from.key(),
        TransferOp {
            to,
            local_token: mint.key(),
            remote_token: partial_token_metadata.remote_token,
            amount,
            call,
        },
    );

    pay_for_gas(system_program, payer, gas_fee_receiver, bridge)?;

    // Burn the token from the user.
    let cpi_ctx = CpiContext::new(
        token_program.to_account_info(),
        BurnChecked {
            mint: mint.to_account_info(),
            from: from_token_account.to_account_info(),
            authority: from.to_account_info(),
        },
    );
    token_interface::burn_checked(cpi_ctx, amount, mint.decimals)?;

    **outgoing_message = message;
    bridge.nonce += 1;

    Ok(())
}
