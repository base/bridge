use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::BridgeError;
use crate::{common::TOKEN_VAULT_SEED, ID};

/// Instruction data for finalizing a bridged SPL token transfer from Base to Solana.
///
/// Releases tokens from a program-controlled vault PDA to the specified recipient
/// token account on Solana.
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FinalizeBridgeSpl {
    /// The 20-byte ERC-20 contract address on Base that corresponds to the SPL mint.
    /// Used, together with the SPL mint, to derive the token-vault PDA for this mapping.
    pub remote_token: [u8; 20],

    /// The SPL token mint on Solana that mirrors the `remote_token`.
    pub local_token: Pubkey,

    /// The recipient SPL token account address on Solana that will receive tokens.
    /// This must be a valid token account for `local_token`.
    /// Note: this program does not enforce ownership or ATA semantics; the account
    /// is authenticated by address equality (`self.to`) and `transfer_checked`
    /// enforces the mint match.
    pub to: Pubkey,

    /// The amount to transfer, in base units of the mint (respecting mint decimals).
    /// `transfer_checked` enforces that the destination account's mint matches and
    /// the decimals are correct.
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
            BridgeError::MintDoesNotMatchLocalToken
        );

        // Check that the token account is correct given the to address
        require_keys_eq!(
            to_token_account.key(),
            self.to,
            BridgeError::TokenAccountDoesNotMatchTo
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
            BridgeError::IncorrectTokenVault
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
