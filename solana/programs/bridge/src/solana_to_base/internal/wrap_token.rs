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

use crate::common::{bridge::Bridge, PartialTokenMetadata, MAX_URI_LEN, WRAPPED_TOKEN_SEED};
use crate::solana_to_base::{
    pay_for_gas, Call, CallType, OutgoingMessage, REMOTE_TOKEN_METADATA_KEY,
    SCALER_EXPONENT_METADATA_KEY,
};
use crate::BridgeError;
use crate::ID;

pub const REGISTER_REMOTE_TOKEN_DATA_LEN: usize = {
    32 + 32 + 32 // abi.encode(address, bytes32, uint8) = 96 bytes
};

/// Creates the wrapped mint's metadata and messages Base to register the token.
///
/// Shared by `wrap_token` and `wrap_token_v2`, which differ only in whether the caller can supply a
/// `uri`. Both derive the same mint for a given token, so a token wrapped through either
/// instruction behaves identically afterwards.
#[allow(clippy::too_many_arguments)]
pub fn wrap_token_internal<'info>(
    payer: &Signer<'info>,
    gas_fee_receiver: &AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    bridge: &mut Account<'info, Bridge>,
    outgoing_message: &mut Account<'info, OutgoingMessage>,
    token_program: &Program<'info, Token2022>,
    system_program: &Program<'info, System>,
    mint_bump: u8,
    decimals: u8,
    partial_token_metadata: PartialTokenMetadata,
) -> Result<()> {
    // Check if bridge is paused
    require!(!bridge.paused, BridgeError::BridgePaused);

    require!(
        partial_token_metadata.uri.len() <= MAX_URI_LEN as usize,
        BridgeError::UriTooLong
    );

    initialize_metadata(
        payer,
        mint,
        token_program,
        system_program,
        mint_bump,
        decimals,
        &partial_token_metadata,
    )?;

    register_remote_token(
        payer,
        gas_fee_receiver,
        mint,
        bridge,
        outgoing_message,
        system_program,
        &partial_token_metadata,
    )?;

    Ok(())
}

fn initialize_metadata<'info>(
    payer: &Signer<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Program<'info, Token2022>,
    system_program: &Program<'info, System>,
    mint_bump: u8,
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
            system_program.to_account_info(),
            Transfer {
                from: payer.to_account_info(),
                to: mint.to_account_info(),
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
        &[mint_bump],
    ];

    // Initialize token metadata (name, symbol, etc.)
    token_metadata_initialize(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TokenMetadataInitialize {
                program_id: token_program.to_account_info(),
                mint: mint.to_account_info(),
                metadata: mint.to_account_info(),
                mint_authority: mint.to_account_info(),
                update_authority: mint.to_account_info(),
            },
            &[seeds],
        ),
        token_metadata.name,
        token_metadata.symbol,
        token_metadata.uri,
    )?;

    // Set the remote token metadata key (remote token address)
    token_metadata_update_field(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TokenMetadataUpdateField {
                program_id: token_program.to_account_info(),
                metadata: mint.to_account_info(),
                update_authority: mint.to_account_info(),
            },
            &[seeds],
        ),
        Field::Key(REMOTE_TOKEN_METADATA_KEY.to_string()),
        hex::encode(partial_token_metadata.remote_token),
    )?;

    // Set the scaler exponent metadata key
    token_metadata_update_field(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TokenMetadataUpdateField {
                program_id: token_program.to_account_info(),
                metadata: mint.to_account_info(),
                update_authority: mint.to_account_info(),
            },
            &[seeds],
        ),
        Field::Key(SCALER_EXPONENT_METADATA_KEY.to_string()),
        partial_token_metadata.scaler_exponent.to_string(),
    )?;

    Ok(())
}

fn register_remote_token<'info>(
    payer: &Signer<'info>,
    gas_fee_receiver: &AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    bridge: &mut Account<'info, Bridge>,
    outgoing_message: &mut Account<'info, OutgoingMessage>,
    system_program: &Program<'info, System>,
    partial_token_metadata: &PartialTokenMetadata,
) -> Result<()> {
    let address = Address::from(&partial_token_metadata.remote_token);
    let local_token = FixedBytes::from(mint.key().to_bytes());
    let scaler_exponent = U256::from(partial_token_metadata.scaler_exponent);

    let call = Call {
        ty: CallType::Call,
        to: [0; 20],
        value: 0,
        data: (address, local_token, scaler_exponent).abi_encode(),
    };

    let message = OutgoingMessage::new_call(bridge.nonce, ID, call);

    pay_for_gas(system_program, payer, gas_fee_receiver, bridge)?;

    **outgoing_message = message;
    bridge.nonce += 1;

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
