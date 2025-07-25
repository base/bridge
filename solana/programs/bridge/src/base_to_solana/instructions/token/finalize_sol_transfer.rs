use anchor_lang::{
    prelude::*,
    system_program::{self, Transfer},
};

use crate::{common::SOL_VAULT_SEED, ID};

/// Parameters for finalizing a SOL transfer from Base to Solana.
///
/// This struct contains all the necessary information to complete a cross-chain
/// SOL transfer that was initiated on Base. The SOL is held in
/// a program-derived account (vault) until the transfer is finalized on Solana.
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FinalizeBridgeSol {
    /// The 20-byte address of the token contract on Base.
    /// This is used as a seed to derive the SOL vault PDA that holds the escrowed SOL.
    /// Even though this is a SOL transfer, we need the remote token identifier
    /// to locate the correct vault.
    pub remote_token: [u8; 20],

    /// The Solana public key of the recipient who will receive the SOL.
    /// This must match the intended recipient specified in the original bridge message.
    pub to: Pubkey,

    /// The amount of SOL to transfer, denominated in lamports (1 SOL = 1,000,000,000 lamports).
    /// This amount will be transferred from the SOL vault to the recipient.
    pub amount: u64,
}

impl FinalizeBridgeSol {
    pub fn finalize<'info>(&self, account_infos: &'info [AccountInfo<'info>]) -> Result<()> {
        // Deserialize the accounts
        let mut iter = account_infos.iter();
        let sol_vault_info = next_account_info(&mut iter)?;
        let to_info = next_account_info(&mut iter)?;
        let system_program_info = Program::<System>::try_from(next_account_info(&mut iter)?)?;

        // Check that the to is correct
        require_keys_eq!(to_info.key(), self.to, FinalizeBridgeSolError::IncorrectTo);

        // Check that the sol vault is the expected PDA
        let sol_vault_seeds = &[SOL_VAULT_SEED, self.remote_token.as_ref()];
        let (sol_vault_pda, sol_vault_bump) = Pubkey::find_program_address(sol_vault_seeds, &ID);

        require_keys_eq!(
            sol_vault_info.key(),
            sol_vault_pda,
            FinalizeBridgeSolError::IncorrectSolVault
        );

        // Transfer the SOL from the sol vault to the recipient
        let seeds: &[&[&[u8]]] = &[&[
            SOL_VAULT_SEED,
            self.remote_token.as_ref(),
            &[sol_vault_bump],
        ]];
        let cpi_ctx = CpiContext::new_with_signer(
            system_program_info.to_account_info(),
            Transfer {
                from: sol_vault_info.to_account_info(),
                to: to_info.to_account_info(),
            },
            seeds,
        );
        system_program::transfer(cpi_ctx, self.amount)
    }
}

#[error_code]
pub enum FinalizeBridgeSolError {
    #[msg("Incorrect to")]
    IncorrectTo,
    #[msg("Incorrect sol vault")]
    IncorrectSolVault,
}
