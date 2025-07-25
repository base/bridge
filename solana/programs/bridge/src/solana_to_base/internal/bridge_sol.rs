use anchor_lang::{
    prelude::*,
    system_program::{self, Transfer},
};

use crate::{
    common::bridge::Bridge,
    solana_to_base::{
        check_and_pay_for_gas, check_call, Call, OutgoingMessage, Transfer as TransferOp,
        NATIVE_SOL_PUBKEY,
    },
};

#[allow(clippy::too_many_arguments)]
pub fn bridge_sol_internal<'info>(
    payer: &Signer<'info>,
    from: &Signer<'info>,
    gas_fee_receiver: &AccountInfo<'info>,
    sol_vault: &AccountInfo<'info>,
    bridge: &mut Account<'info, Bridge>,
    outgoing_message: &mut Account<'info, OutgoingMessage>,
    system_program: &Program<'info, System>,
    gas_limit: u64,
    to: [u8; 20],
    remote_token: [u8; 20],
    amount: u64,
    call: Option<Call>,
) -> Result<()> {
    if let Some(call) = &call {
        check_call(call)?;
    }

    let message = OutgoingMessage::new_transfer(
        bridge.nonce,
        payer.key(),
        from.key(),
        gas_limit,
        TransferOp {
            to,
            local_token: NATIVE_SOL_PUBKEY,
            remote_token,
            amount,
            call,
        },
    );

    check_and_pay_for_gas(
        system_program,
        payer,
        gas_fee_receiver,
        &mut bridge.eip1559,
        gas_limit,
        message.relay_messages_tx_size(),
    )?;

    // Lock the sol from the user into the SOL vault.
    let cpi_ctx = CpiContext::new(
        system_program.to_account_info(),
        Transfer {
            from: from.to_account_info(),
            to: sol_vault.to_account_info(),
        },
    );
    system_program::transfer(cpi_ctx, amount)?;

    **outgoing_message = message;
    bridge.nonce += 1;

    Ok(())
}
