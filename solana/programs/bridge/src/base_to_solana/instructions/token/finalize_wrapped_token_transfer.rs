use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{MintToChecked, Token2022},
    token_interface::{self, Mint, TokenAccount},
};

use crate::{
    common::{PartialTokenMetadata, WRAPPED_TOKEN_SEED},
    ID,
};

/// Instruction data for finalizing a wrapped token transfer from Base to Solana.
///
/// This struct represents the final step in a cross-chain bridge operation where tokens
/// that were originally on Base are being bridged to Solana as wrapped tokens. The
/// finalization process mints the appropriate amount of wrapped tokens to the recipient's
/// token account on Solana.
///
/// The wrapped token mint is derived deterministically from the original token's metadata
/// and decimals, ensuring consistency across bridge operations.
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FinalizeBridgeWrappedToken {
    /// The mint address of the wrapped token on Solana.
    /// This is a PDA that represents the Solana version
    /// of a token that originally exists on Base. The mint address is derived
    /// deterministically from the original token's metadata and decimals.
    pub local_token: Pubkey,

    /// The destination token account that will receive the wrapped tokens.
    /// This must be a valid token account that is associated with the wrapped
    /// token mint. It is expected to be controlled by the intended recipient of
    /// the bridged tokens; recipient ownership is not enforced by this
    /// instruction.
    pub to: Pubkey,

    /// The amount of wrapped tokens to mint to the recipient.
    /// The amount is specified in the token's smallest unit.
    pub amount: u64,
}

impl FinalizeBridgeWrappedToken {
    pub fn finalize<'info>(&self, account_infos: &'info [AccountInfo<'info>]) -> Result<()> {
        // Deserialize the accounts
        let mut iter = account_infos.iter();
        let mint = InterfaceAccount::<Mint>::try_from(next_account_info(&mut iter)?)?;
        let to_token_account =
            InterfaceAccount::<TokenAccount>::try_from(next_account_info(&mut iter)?)?;
        let token_program_2022 = Program::<Token2022>::try_from(next_account_info(&mut iter)?)?;

        // Check that the mint is correct given the local token
        require_keys_eq!(
            mint.key(),
            self.local_token,
            FinalizeBridgeWrappedTokenError::MintDoesNotMatchLocalToken
        );

        // Check that the to is correct given the to address
        require_keys_eq!(
            to_token_account.key(),
            self.to,
            FinalizeBridgeWrappedTokenError::TokenAccountDoesNotMatchTo,
        );

        // Get the partial token metadata
        let partial_token_metadata = PartialTokenMetadata::try_from(&mint.to_account_info())?;

        // Derive the seeds for the wrapped token mint
        let decimals_bytes = mint.decimals.to_le_bytes();
        let metadata_hash = partial_token_metadata.hash();
        let seeds: &[&[u8]] = &[
            WRAPPED_TOKEN_SEED,
            decimals_bytes.as_ref(),
            metadata_hash.as_ref(),
        ];
        let (_, mint_bump) = Pubkey::find_program_address(seeds, &ID);

        let seeds: &[&[&[u8]]] = &[&[
            WRAPPED_TOKEN_SEED,
            decimals_bytes.as_ref(),
            metadata_hash.as_ref(),
            &[mint_bump],
        ]];

        // Mint the wrapped token to the recipient
        let cpi_ctx = CpiContext::new_with_signer(
            token_program_2022.to_account_info(),
            MintToChecked {
                mint: mint.to_account_info(),
                to: to_token_account.to_account_info(),
                authority: mint.to_account_info(),
            },
            seeds,
        );
        token_interface::mint_to_checked(cpi_ctx, self.amount, mint.decimals)?;

        Ok(())
    }
}

#[error_code]
pub enum FinalizeBridgeWrappedTokenError {
    #[msg("Token account does not match to address")]
    TokenAccountDoesNotMatchTo,
    #[msg("Mint does not match local token")]
    MintDoesNotMatchLocalToken,
}
