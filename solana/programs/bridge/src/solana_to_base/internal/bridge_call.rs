use anchor_lang::prelude::*;

use crate::{
    common::bridge::Bridge,
    solana_to_base::{check_and_pay_for_gas, check_call, Call, OutgoingMessage},
};

#[allow(clippy::too_many_arguments)]
pub fn bridge_call_internal<'info>(
    payer: &Signer<'info>,
    from: &Signer<'info>,
    gas_fee_receiver: &AccountInfo<'info>,
    bridge: &mut Account<'info, Bridge>,
    outgoing_message: &mut Account<'info, OutgoingMessage>,
    system_program: &Program<'info, System>,
    gas_limit: u64,
    call: Call,
) -> Result<()> {
    check_call(&call)?;

    let message = OutgoingMessage::new_call(bridge.nonce, payer.key(), from.key(), gas_limit, call);

    check_and_pay_for_gas(
        system_program,
        payer,
        gas_fee_receiver,
        bridge,
        gas_limit,
        message.relay_messages_tx_size(),
    )?;

    **outgoing_message = message;
    bridge.nonce += 1;

    Ok(())
}
