use anchor_lang::{
    prelude::*,
    system_program::{self, Transfer},
};

use crate::{
    common::{bridge::Bridge, BRIDGE_SEED, SOL_VAULT_SEED},
    solana_to_base::{
        check_and_pay_for_gas, check_call, Call, OutgoingMessage, Transfer as TransferOp,
        GAS_FEE_RECEIVER, NATIVE_SOL_PUBKEY,
    },
};

/// Accounts struct for the bridge_sol instruction that transfers native SOL from Solana to Base.
/// This instruction locks SOL in a vault on Solana and creates an outgoing message to mint
/// corresponding tokens on the Base blockchain.
#[derive(Accounts)]
#[instruction(_gas_limit: u64, _to: [u8; 20], remote_token: [u8; 20], _amount: u64, call: Option<Call>)]
pub struct BridgeSol<'info> {
    /// The account that pays for transaction fees and account creation.
    /// Must be mutable to deduct lamports for account rent and gas fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The account that owns the SOL tokens being bridged.
    /// Must sign the transaction to authorize the transfer of their SOL.
    pub from: Signer<'info>,

    /// The hardcoded account that receives gas fees for cross-chain operations.
    /// - Must match the predefined GAS_FEE_RECEIVER address
    /// - Mutable to receive gas fee payments
    ///
    /// CHECK: This is the hardcoded gas fee receiver account.
    #[account(mut, address = GAS_FEE_RECEIVER @ BridgeSolError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    /// The SOL vault account that holds locked tokens for the specific remote token.
    /// - Uses PDA with SOL_VAULT_SEED and remote_token for deterministic address
    /// - Mutable to receive the locked SOL tokens
    /// - Each remote token has its own dedicated vault
    ///
    /// CHECK: This is the SOL vault account.
    #[account(
        mut,
        seeds = [SOL_VAULT_SEED, remote_token.as_ref()],
        bump,
    )]
    pub sol_vault: AccountInfo<'info>,

    /// The main bridge state account that tracks nonces and fee parameters.
    /// - Uses PDA with BRIDGE_SEED for deterministic address
    /// - Mutable to increment nonce and update EIP1559 fee data
    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    /// The outgoing message account that stores cross-chain transfer details.
    /// - Created fresh for each bridge operation
    /// - Payer funds the account creation
    /// - Space allocated dynamically based on optional call data size
    #[account(
        init,
        payer = payer,
        space = 8 + OutgoingMessage::space(call.map(|c| c.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// System program required for SOL transfers and account creation.
    /// Used for transferring SOL from user to vault and creating outgoing message account.
    pub system_program: Program<'info, System>,
}

pub fn bridge_sol_handler(
    ctx: Context<BridgeSol>,
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
        ctx.accounts.bridge.nonce,
        ctx.accounts.from.key(),
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
        &ctx.accounts.system_program,
        &ctx.accounts.payer,
        &ctx.accounts.gas_fee_receiver,
        &mut ctx.accounts.bridge.eip1559,
        gas_limit,
        message.relay_messages_tx_size(),
    )?;

    // Lock the sol from the user into the SOL vault.
    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
            from: ctx.accounts.from.to_account_info(),
            to: ctx.accounts.sol_vault.to_account_info(),
        },
    );
    system_program::transfer(cpi_ctx, amount)?;

    *ctx.accounts.outgoing_message = message;
    ctx.accounts.bridge.nonce += 1;

    Ok(())
}

#[error_code]
pub enum BridgeSolError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
}
