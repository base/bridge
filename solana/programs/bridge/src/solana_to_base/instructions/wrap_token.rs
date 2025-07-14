use alloy_primitives::{Address, FixedBytes, U256};
use alloy_sol_types::SolValue;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::rent::{
    DEFAULT_EXEMPTION_THRESHOLD, DEFAULT_LAMPORTS_PER_BYTE_YEAR,
};
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::token_2022::spl_token_2022::extension::{ExtensionType, Length};
use anchor_spl::token_interface::spl_pod::bytemuck::pod_get_packed_len;
use anchor_spl::token_interface::{
    spl_token_metadata_interface::state::{Field, TokenMetadata},
    token_metadata_initialize, token_metadata_update_field, Mint, Token2022,
    TokenMetadataInitialize, TokenMetadataUpdateField,
};
use spl_type_length_value::variable_len_pack::VariableLenPack;

use crate::common::{bridge::{Bridge, BridgeError}, PartialTokenMetadata, BRIDGE_SEED, WRAPPED_TOKEN_SEED};
use crate::solana_to_base::{
    check_and_pay_for_gas, Call, CallType, OutgoingMessage, GAS_FEE_RECEIVER,
};
use crate::solana_to_base::{REMOTE_TOKEN_METADATA_KEY, SCALER_EXPONENT_METADATA_KEY};
use crate::ID;

const REGISTER_REMOTE_TOKEN_DATA_LEN: usize = {
    32 + 32 + 32 // abi.encode(address, bytes32, uint8) = 96 bytes
};

#[derive(Accounts)]
#[instruction(decimals: u8, metadata: PartialTokenMetadata)]
pub struct WrapToken<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: This is the hardcoded gas fee receiver account.
    #[account(mut, address = GAS_FEE_RECEIVER @ WrapTokenError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    #[account(
        init,
        payer = payer,
        // NOTE: Suboptimal to compute the seeds here but it allows to use `init`.
        seeds = [
            WRAPPED_TOKEN_SEED,
            decimals.to_le_bytes().as_ref(),
            metadata.hash().as_ref(),
        ],
        bump,
        mint::decimals = decimals,
        mint::authority = mint,
        // mint::freeze_authority = mint,
        // extensions::metadata_pointer::authority = mint,
        extensions::metadata_pointer::metadata_address = mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    #[account(
        init,
        payer = payer,
        space = 8 + OutgoingMessage::space(Some(REGISTER_REMOTE_TOKEN_DATA_LEN)),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    pub token_program: Program<'info, Token2022>,

    pub system_program: Program<'info, System>,
}

pub fn wrap_token_handler(
    ctx: Context<WrapToken>,
    decimals: u8,
    partial_token_metadata: PartialTokenMetadata,
    gas_limit: u64,
) -> Result<()> {
    // Check if bridge is paused
    require!(!ctx.accounts.bridge.paused, BridgeError::BridgePaused);
    
    initialize_metadata(&ctx, decimals, &partial_token_metadata)?;

    register_remote_token(
        ctx,
        &partial_token_metadata.remote_token,
        partial_token_metadata.scaler_exponent,
        gas_limit,
    )?;

    Ok(())
}

fn initialize_metadata(
    ctx: &Context<WrapToken>,
    decimals: u8,
    partial_token_metadata: &PartialTokenMetadata,
) -> Result<()> {
    let token_metadata = TokenMetadata::from(partial_token_metadata);

    // Calculate lamports required for the additional metadata
    let token_metadata_size = add_type_and_length_to_len(token_metadata.get_packed_len().unwrap());
    let lamports = token_metadata_size as u64
        * DEFAULT_LAMPORTS_PER_BYTE_YEAR
        * DEFAULT_EXEMPTION_THRESHOLD as u64;

    // Transfer additional lamports to mint account (because we're increasing its size to store the metadata)
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.payer.to_account_info(),
                to: ctx.accounts.mint.to_account_info(),
            },
        ),
        lamports,
    )?;

    let decimals_bytes = decimals.to_le_bytes();
    let metadata_hash = partial_token_metadata.hash();

    let seeds = &[
        WRAPPED_TOKEN_SEED,
        &decimals_bytes,
        &metadata_hash,
        &[ctx.bumps.mint],
    ];

    // Initialize token metadata (name, symbol, etc.)
    token_metadata_initialize(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TokenMetadataInitialize {
                program_id: ctx.accounts.token_program.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                metadata: ctx.accounts.mint.to_account_info(),
                mint_authority: ctx.accounts.mint.to_account_info(),
                update_authority: ctx.accounts.mint.to_account_info(),
            },
            &[seeds],
        ),
        token_metadata.name,
        token_metadata.symbol,
        Default::default(),
    )?;

    // Set the remote token metadata key (remote token address)
    token_metadata_update_field(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TokenMetadataUpdateField {
                program_id: ctx.accounts.token_program.to_account_info(),
                metadata: ctx.accounts.mint.to_account_info(),
                update_authority: ctx.accounts.mint.to_account_info(),
            },
            &[seeds],
        ),
        Field::Key(REMOTE_TOKEN_METADATA_KEY.to_string()),
        hex::encode(partial_token_metadata.remote_token),
    )?;

    // Set the scaler exponent metadata key
    token_metadata_update_field(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TokenMetadataUpdateField {
                program_id: ctx.accounts.token_program.to_account_info(),
                metadata: ctx.accounts.mint.to_account_info(),
                update_authority: ctx.accounts.mint.to_account_info(),
            },
            &[seeds],
        ),
        Field::Key(SCALER_EXPONENT_METADATA_KEY.to_string()),
        partial_token_metadata.scaler_exponent.to_string(),
    )?;

    Ok(())
}

fn register_remote_token(
    ctx: Context<WrapToken>,
    remote_token: &[u8; 20],
    scaler_exponent: u8,
    gas_limit: u64,
) -> Result<()> {
    let address = Address::from(remote_token);
    let local_token = FixedBytes::from(ctx.accounts.mint.key().to_bytes());
    let scaler_exponent = U256::from(scaler_exponent);

    let call = Call {
        ty: CallType::Call,
        to: [0; 20],
        value: 0,
        data: (address, local_token, scaler_exponent).abi_encode(),
    };

    let message = OutgoingMessage::new_call(ctx.accounts.bridge.nonce, ID, gas_limit, call);

    check_and_pay_for_gas(
        &ctx.accounts.system_program,
        &ctx.accounts.payer,
        &ctx.accounts.gas_fee_receiver,
        &mut ctx.accounts.bridge.eip1559,
        gas_limit,
        message.relay_messages_tx_size(),
    )?;

    *ctx.accounts.outgoing_message = message;
    ctx.accounts.bridge.nonce += 1;

    Ok(())
}

/// Helper function to calculate exactly how many bytes a value will take up,
/// given the value's length
/// Copied from https://github.com/solana-program/token-2022/blob/4f292ccb95529b5fea7c305c4c8bf7ea1037175a/program/src/extension/mod.rs#L136
const fn add_type_and_length_to_len(value_len: usize) -> usize {
    value_len
        .saturating_add(std::mem::size_of::<ExtensionType>())
        .saturating_add(pod_get_packed_len::<Length>())
}

#[error_code]
pub enum WrapTokenError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
}
