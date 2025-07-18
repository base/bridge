use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::{common::TOKEN_VAULT_SEED, ID};

/// Data structure for finalizing SPL token transfers from Base to Solana.
///
/// This struct contains all the necessary information to complete a cross-chain
/// SPL token transfer that was initiated on Base and is being finalized on Solana.
/// It handles the release of tokens from a program-controlled vault to the
/// designated recipient on Solana.
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FinalizeBridgeSpl {
    /// The token contract address on Base.
    /// This is a 20-byte address representing the ERC-20 token
    /// contract on Base that was originally bridged. Used to derive the
    /// token vault PDA and ensure proper token mapping between chains.
    pub remote_token: [u8; 20],

    /// The SPL token mint public key on Solana.
    /// This represents the corresponding SPL token on Solana that mirrors
    /// the remote token.
    pub local_token: Pubkey,

    /// The recipient's token account public key on Solana.
    /// This is the SPL token account that will receive the bridged tokens.
    /// Must be an associated token account or valid token account owned
    /// by the intended recipient and matching the local_token mint.
    pub to: Pubkey,

    /// The amount of tokens to transfer in the token's base units.
    /// This amount respects the token's decimal precision as defined by
    /// the mint. The transfer will be validated using transfer_checked
    /// to ensure decimal accuracy.
    pub amount: u64,
}

impl FinalizeBridgeSpl {
    pub fn finalize<'info>(&self, account_infos: &'info [AccountInfo<'info>]) -> Result<()> {
        // Deserialize the accounts
        let mut iter = account_infos.iter();
        let mint = InterfaceAccount::<Mint>::try_from(next_account_info(&mut iter)?)?;
        let token_vault =
            InterfaceAccount::<TokenAccount>::try_from(next_account_info(&mut iter)?)?;
        let to_token_account =
            InterfaceAccount::<TokenAccount>::try_from(next_account_info(&mut iter)?)?;
        let token_program = Interface::<TokenInterface>::try_from(next_account_info(&mut iter)?)?;

        // Check that the mint is correct given the local token
        require_keys_eq!(
            mint.key(),
            self.local_token,
            FinalizeBridgeSplError::MintDoesNotMatchLocalToken
        );

        // Check that the token account is correct given the to address
        require_keys_eq!(
            to_token_account.key(),
            self.to,
            FinalizeBridgeSplError::TokenAccountDoesNotMatchTo
        );

        // Check that the token vault is the expected PDA
        let mint_key = mint.key();
        let token_vault_seeds = &[
            TOKEN_VAULT_SEED,
            mint_key.as_ref(),
            self.remote_token.as_ref(),
        ];
        let (token_vault_pda, token_vault_bump) =
            Pubkey::find_program_address(token_vault_seeds, &ID);

        require_keys_eq!(
            token_vault.key(),
            token_vault_pda,
            FinalizeBridgeSplError::IncorrectTokenVault
        );

        let seeds: &[&[&[u8]]] = &[&[
            TOKEN_VAULT_SEED,
            mint_key.as_ref(),
            self.remote_token.as_ref(),
            &[token_vault_bump],
        ]];

        // Transfer the SPL token from the token vault to the recipient
        let cpi_ctx = CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                mint: mint.to_account_info(),
                from: token_vault.to_account_info(),
                to: to_token_account.to_account_info(),
                authority: token_vault.to_account_info(),
            },
            seeds,
        );
        token_interface::transfer_checked(cpi_ctx, self.amount, mint.decimals)?;

        Ok(())
    }
}

#[error_code]
pub enum FinalizeBridgeSplError {
    #[msg("Mint does not match local token")]
    MintDoesNotMatchLocalToken,
    #[msg("Token account does not match to address")]
    TokenAccountDoesNotMatchTo,
    #[msg("Incorrect token vault")]
    IncorrectTokenVault,
}
