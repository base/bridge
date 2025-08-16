use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{self, BurnChecked, Mint, TokenAccount},
};

use crate::solana_to_base::{check_call, pay_for_gas};
use crate::{
    common::{bridge::Bridge, PartialTokenMetadata, WRAPPED_TOKEN_SEED},
    solana_to_base::{Call, OutgoingMessage, Transfer as TransferOp},
    ID,
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

    // Ensure the provided mint is a PDA derived by this program for wrapped tokens.
    let decimals_bytes = mint.decimals.to_le_bytes();
    let metadata_hash = partial_token_metadata.hash();
    let seeds: &[&[u8]] = &[
        WRAPPED_TOKEN_SEED,
        decimals_bytes.as_ref(),
        metadata_hash.as_ref(),
    ];
    let (expected_mint, _bump) = Pubkey::find_program_address(seeds, &ID);
    require_keys_eq!(
        mint.key(),
        expected_mint,
        BridgeWrappedTokenInternalError::IncorrectWrappedMint
    );

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

#[error_code]
pub enum BridgeWrappedTokenInternalError {
    #[msg("Mint is not a valid wrapped token PDA")]
    IncorrectWrappedMint,
}
