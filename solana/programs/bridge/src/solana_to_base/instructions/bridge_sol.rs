use anchor_lang::{
    prelude::*,
    system_program::{self, Transfer},
};

use crate::{
    common::{bridge::Bridge, BRIDGE_SEED, SOL_VAULT_SEED},
    solana_to_base::{
        check_and_pay_for_gas, check_call, Call, CallBuffer, OutgoingMessage,
        Transfer as TransferOp, GAS_FEE_RECEIVER, NATIVE_SOL_PUBKEY,
    },
};

/// Common accounts struct for the bridge_sol and bridge_sol_with_buffered_call instructions that
/// transfers native SOL from Solana to Base.
#[derive(Accounts, Clone)]
#[instruction(_gas_limit: u64, _to: [u8; 20], remote_token: [u8; 20])]
pub struct BridgeSolCommon<'info> {
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
}

/// Accounts struct for the bridge_sol instruction that transfers native SOL from Solana to Base
/// along with an optional call that can be executed on Base.
///
/// The bridged SOLs are locked in a vault on Solana and an outgoing message is created to mint
/// the corresponding tokens and execute the optional call on Base.
#[derive(Accounts)]
#[instruction(_gas_limit: u64, _to: [u8; 20], remote_token: [u8; 20], _amount: u64, call: Option<Call>)]
pub struct BridgeSol<'info> {
    /// Common accounts for the bridge_sol used by the instruction.
    pub common: BridgeSolCommon<'info>,

    /// The outgoing message account that stores cross-chain transfer details.
    /// - Created fresh for each bridge operation
    /// - Payer funds the account creation
    /// - Space allocated dynamically based on optional call data size
    #[account(
        init,
        payer = common.payer,
        space = 8 + OutgoingMessage::space(call.map(|c| c.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// System program required for SOL transfers and account creation.
    /// Used for transferring SOL from user to vault and creating outgoing message account.
    pub system_program: Program<'info, System>,
}

/// Accounts struct for the bridge_sol_with_buffered_call instruction that transfers native SOL
/// from Solana to Base along with a call (read from a call buffer account) to execute on Base.
///
/// The bridged SOLs are locked in a vault on Solana and an outgoing message is created to mint
/// the corresponding tokens and execute the call on Base. The call buffer account is closed and
/// rent returned to the owner.
#[derive(Accounts)]
pub struct BridgeSolWithBufferedCall<'info> {
    /// Common accounts used by the instruction.
    pub common: BridgeSolCommon<'info>,

    /// The owner of the call buffer who will receive the rent refund.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The call buffer account that stores the call data.
    /// This account will be closed and rent returned to the owner.
    #[account(
        mut,
        close = owner,
        has_one = owner @ BridgeSolError::Unauthorized,
    )]
    pub call_buffer: Account<'info, CallBuffer>,

    /// The outgoing message account that stores the cross-chain transfer details.
    #[account(init, payer = common.payer, space = 8 + OutgoingMessage::space(Some(call_buffer.data.len())))]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// System program required for SOL transfers and account creation.
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
        ctx.accounts.common.bridge.nonce,
        ctx.accounts.common.payer.key(),
        ctx.accounts.common.from.key(),
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
        &ctx.accounts.common.payer,
        &ctx.accounts.common.gas_fee_receiver,
        &mut ctx.accounts.common.bridge.eip1559,
        gas_limit,
        message.relay_messages_tx_size(),
    )?;

    // Lock the sol from the user into the SOL vault.
    let cpi_ctx = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
            from: ctx.accounts.common.from.to_account_info(),
            to: ctx.accounts.common.sol_vault.to_account_info(),
        },
    );
    system_program::transfer(cpi_ctx, amount)?;

    *ctx.accounts.outgoing_message = message;
    ctx.accounts.common.bridge.nonce += 1;

    Ok(())
}

pub fn bridge_sol_with_buffered_call_handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, BridgeSolWithBufferedCall<'info>>,
    gas_limit: u64,
    to: [u8; 20],
    remote_token: [u8; 20],
    amount: u64,
) -> Result<()> {
    let call_buffer = &ctx.accounts.call_buffer;
    let call = Call {
        ty: call_buffer.ty,
        to: call_buffer.to,
        value: call_buffer.value,
        data: call_buffer.data.clone(),
    };

    let mut accounts = BridgeSol {
        common: ctx.accounts.common.clone(),
        outgoing_message: ctx.accounts.outgoing_message.clone(),
        system_program: ctx.accounts.system_program.clone(),
    };

    let bumps = BridgeSolBumps {
        common: ctx.bumps.common,
    };

    let ctx =
        Context::<BridgeSol>::new(ctx.program_id, &mut accounts, ctx.remaining_accounts, bumps);

    bridge_sol_handler(ctx, gas_limit, to, remote_token, amount, Some(call))
}

#[error_code]
pub enum BridgeSolError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
    #[msg("Only the owner can close this call buffer")]
    Unauthorized,
}
