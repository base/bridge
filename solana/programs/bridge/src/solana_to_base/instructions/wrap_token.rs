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

use crate::common::DISCRIMINATOR_LEN;
use crate::common::{bridge::Bridge, PartialTokenMetadata, BRIDGE_SEED, WRAPPED_TOKEN_SEED};
use crate::solana_to_base::{pay_for_gas, Call, CallType, OutgoingMessage};
use crate::solana_to_base::{REMOTE_TOKEN_METADATA_KEY, SCALER_EXPONENT_METADATA_KEY};
use crate::ID;

const REGISTER_REMOTE_TOKEN_DATA_LEN: usize = {
    32 + 32 + 32 // abi.encode(address, bytes32, uint8) = 96 bytes
};

/// Accounts struct for the wrap token instruction that creates a wrapped representation
/// of a Base token on Solana. This instruction initializes a new SPL token
/// with Token-2022 extensions and registers it with Base for cross-chain
/// token transfers. The wrapped token maintains metadata linking it to its Base counterpart.
#[derive(Accounts)]
#[instruction(decimals: u8, metadata: PartialTokenMetadata)]
pub struct WrapToken<'info> {
    /// The account that pays for the transaction and all account creation costs.
    /// Must be mutable to deduct lamports for mint creation, metadata storage, and gas fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The account that receives payment for the gas costs of registering the token on Base.
    /// CHECK: This account is validated to be the same as bridge.gas_config.gas_fee_receiver
    #[account(mut, address = bridge.gas_config.gas_fee_receiver @ WrapTokenError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    /// The new SPL Token-2022 mint being created for the wrapped token.
    /// - Uses PDA with token metadata hash and decimals for deterministic address
    /// - Mint authority set to itself (mint account) for controlled minting
    /// - Includes metadata pointer extension to store token information onchain
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
        extensions::metadata_pointer::metadata_address = mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The main bridge state account that tracks cross-chain operations.
    /// Used to increment the nonce counter and manage EIP-1559 gas pricing.
    /// Must be mutable to update the nonce after creating the outgoing message.
    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    /// The outgoing message account that stores the cross-chain call to register
    /// the wrapped token on the Base blockchain. Contains the encoded function call
    /// with token address, local mint address, and scaling parameters.
    #[account(
        init,
        payer = payer,
        space = DISCRIMINATOR_LEN + OutgoingMessage::space::<Call>(REGISTER_REMOTE_TOKEN_DATA_LEN),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// SPL Token-2022 program for creating the mint with metadata extensions.
    /// Required for initializing tokens with advanced features like metadata pointers.
    pub token_program: Program<'info, Token2022>,

    /// System program required for creating new accounts and transferring lamports.
    /// Used internally by Anchor for account initialization and rent payments.
    pub system_program: Program<'info, System>,
}

pub fn wrap_token_handler(
    ctx: Context<WrapToken>,
    decimals: u8,
    partial_token_metadata: PartialTokenMetadata,
) -> Result<()> {
    // Check if bridge is paused
    require!(!ctx.accounts.bridge.paused, WrapTokenError::BridgePaused);

    initialize_metadata(&ctx, decimals, &partial_token_metadata)?;

    register_remote_token(
        ctx,
        &partial_token_metadata.remote_token,
        partial_token_metadata.scaler_exponent,
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

    let message = OutgoingMessage::new_call(ctx.accounts.bridge.nonce, ID, call);

    pay_for_gas(
        &ctx.accounts.system_program,
        &ctx.accounts.payer,
        &ctx.accounts.gas_fee_receiver,
        &mut ctx.accounts.bridge,
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
    #[msg("Bridge is paused")]
    BridgePaused,
}
