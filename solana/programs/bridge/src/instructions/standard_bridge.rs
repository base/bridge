use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use hex_literal::hex;

use crate::{messenger, MESSENGER_SEED, NATIVE_SOL_PUBKEY, OTHER_BRIDGE, VAULT_SEED};

use super::{Messenger, Vault};

pub struct BridgeParams {
    pub to: [u8; 20],
    pub remote_token: [u8; 20],
    pub amount: u64,
    pub min_gas_limit: u32,
    pub extra_data: Vec<u8>,
}

#[derive(Accounts)]
pub struct BridgeTokensTo<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut, seeds = [MESSENGER_SEED], bump)]
    pub messenger: Account<'info, Messenger>,

    // SPL Token specific accounts.
    // These accounts must be provided by the client.
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub from_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = vault // Vault PDA is the ATA owner
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

/// @notice Sends SPL tokens or SOL to a receiver's address on Base.
///
/// @param _remoteToken Address of the corresponding token on Base.
/// @param _to          Address of the receiver.
/// @param _amount      Amount of local tokens to deposit.
/// @param _minGasLimit Minimum amount of gas that the bridge can be relayed with.
/// @param _extraData   Extra data to be sent with the transaction. Note that the recipient will
///                     not be triggered with this data, but it will be emitted and can be used
///                     to identify the transaction.
pub fn bridge_tokens_to_handler(ctx: Context<BridgeTokensTo>, params: BridgeParams) -> Result<()> {
    let program_id: &[u8] = ctx.program_id.as_ref();

    require!(
        ctx.accounts.mint.key() != NATIVE_SOL_PUBKEY,
        BridgeError::InvalidSolUsage
    );

    // SPL Token Transfer
    let cpi_accounts = anchor_spl::token::Transfer {
        from: ctx.accounts.from_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    anchor_spl::token::transfer(cpi_ctx, params.amount)?;

    emit_event_and_send_message(
        program_id,
        &mut ctx.accounts.messenger,
        ctx.accounts.user.key(),
        ctx.accounts.mint.key(),
        params,
    )
}

#[derive(Accounts)]
pub struct BridgeSolTo<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut, seeds = [MESSENGER_SEED], bump)]
    pub messenger: Account<'info, Messenger>,

    pub system_program: Program<'info, System>,
}

/// @notice Sends SPL tokens or SOL to a receiver's address on Base.
///
/// @param _remoteToken Address of the corresponding token on Base.
/// @param _to          Address of the receiver.
/// @param _amount      Amount of local tokens to deposit.
/// @param _minGasLimit Minimum amount of gas that the bridge can be relayed with.
/// @param _extraData   Extra data to be sent with the transaction. Note that the recipient will
///                     not be triggered with this data, but it will be emitted and can be used
///                     to identify the transaction.
pub fn bridge_sol_to_handler(ctx: Context<BridgeSolTo>, params: BridgeParams) -> Result<()> {
    let program_id: &[u8] = ctx.program_id.as_ref();

    // Transfer `amount` of local_token from user to vault
    // Transfer lamports from user to vault PDA
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
        },
    );
    anchor_lang::system_program::transfer(cpi_context, params.amount)?;

    emit_event_and_send_message(
        program_id,
        &mut ctx.accounts.messenger,
        ctx.accounts.user.key(),
        NATIVE_SOL_PUBKEY,
        params,
    )
}

#[event]
/// @notice Emitted when an SPL or SOL bridge is initiated to Base.
pub struct TokenBridgeInitiated {
    pub local_token: Pubkey, // Address of the token on this chain. Default pubkey signifies SOL.
    pub remote_token: [u8; 20], // Address of the ERC20 on Base.
    pub from: Pubkey,        // Address of the sender.
    pub to: [u8; 20],        // Address of the receiver.
    pub amount: u64,         // Amount of ETH sent.
    pub extra_data: Vec<u8>, // Extra data sent with the transaction.
}

fn emit_event_and_send_message(
    program_id: &[u8],
    messenger: &mut Account<Messenger>,
    from: Pubkey,
    local_token: Pubkey,
    payload: BridgeParams,
) -> Result<()> {
    // TODO: Update stored deposit for `local_token` / `remote_token` pair

    let BridgeParams {
        remote_token,
        to,
        amount,
        min_gas_limit,
        extra_data,
    } = payload;

    let message =
        encode_finalize_brigde_token_call(remote_token, local_token, from, to, amount, &extra_data);

    emit!(TokenBridgeInitiated {
        local_token,
        remote_token,
        from,
        to,
        amount,
        extra_data
    });

    messenger::send_message_internal(
        program_id,
        messenger,
        local_bridge_pubkey(program_id),
        OTHER_BRIDGE,
        message,
        min_gas_limit,
    )
}

fn encode_finalize_brigde_token_call(
    remote_token: [u8; 20],
    local_token: Pubkey,
    from: Pubkey,
    to: [u8; 20],
    amount: u64,
    extra_data: &[u8],
) -> Vec<u8> {
    // Create a vector to hold the encoded data
    let mut encoded = Vec::new();

    // Add selector for Base.Bridge.finalizeBridgeToken 0x2d916920 (4 bytes)
    encoded.extend_from_slice(&hex!("2d916920"));

    // Add remote_token (32 bytes) - pad 20-byte address to 32 bytes
    let mut remote_token_bytes = [0u8; 32];
    remote_token_bytes[12..32].copy_from_slice(&remote_token);
    encoded.extend_from_slice(&remote_token_bytes);

    // Add local_token (32 bytes) - Pubkey is already 32 bytes
    encoded.extend_from_slice(local_token.as_ref());

    // Add from (32 bytes) - Pubkey is already 32 bytes
    encoded.extend_from_slice(from.as_ref());

    // Add to (32 bytes) - pad 20-byte address to 32 bytes
    let mut to_bytes = [0u8; 32];
    to_bytes[12..32].copy_from_slice(&to);
    encoded.extend_from_slice(&to_bytes);

    // Add amount (32 bytes) - pad u64 to 32 bytes
    let mut value_bytes = [0u8; 32];
    value_bytes[24..32].copy_from_slice(&amount.to_be_bytes());
    encoded.extend_from_slice(&value_bytes);

    // Add message length and data (dynamic type)
    // First add offset to message data (32 bytes)
    let mut offset_bytes = [0u8; 32];
    // Offset is 6 * 32 = 192 bytes (6 previous parameters of 32 bytes each)
    offset_bytes[31] = 192;
    encoded.extend_from_slice(&offset_bytes);

    // Add extra_data length (32 bytes)
    let mut length_bytes = [0u8; 32];
    length_bytes[24..32].copy_from_slice(&(extra_data.len() as u64).to_be_bytes());
    encoded.extend_from_slice(&length_bytes);

    // Add extra data
    encoded.extend_from_slice(extra_data);

    // Pad extra data to multiple of 32 bytes
    let padding_bytes = (32 - (extra_data.len() % 32)) % 32;
    encoded.extend_from_slice(&vec![0u8; padding_bytes]);

    encoded
}

pub fn local_bridge_pubkey(program_id: &[u8]) -> Pubkey {
    // Equivalent to keccak256(abi.encodePacked(programId, "bridge"));
    let mut data_to_hash = Vec::new();
    data_to_hash.extend_from_slice(program_id);
    data_to_hash.extend_from_slice(b"bridge");
    let hash = keccak::hash(&data_to_hash);
    Pubkey::new_from_array(hash.to_bytes())
}

#[error_code]
pub enum BridgeError {
    #[msg("Cannot bridge SOL here")]
    InvalidSolUsage,
}
