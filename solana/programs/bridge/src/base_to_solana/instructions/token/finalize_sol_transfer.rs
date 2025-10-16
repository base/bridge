use anchor_lang::{
    prelude::*,
    system_program::{self, Transfer},
};

use crate::BridgeError;
use crate::{common::SOL_VAULT_SEED, ID};

/// Instruction data for finalizing a native SOL transfer from Base to Solana.
///
/// Contains the data needed to release escrowed SOL on Solana that corresponds
/// to a transfer initiated on Base. SOL is held in a PDA vault and released to
/// the recipient when finalized.
#[derive(Debug, Copy, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct FinalizeBridgeSol {
    /// The 20-byte EVM address on Base of the ERC-20 token that represents SOL for this bridge.
    /// Used as a seed to derive the SOL vault PDA that escrows SOL for this mapping.
    /// This identifier names the vault even though the asset released here is native SOL.
    pub remote_token: [u8; 20],

    /// The Solana public key of the recipient who will receive the SOL.
    /// This must match the intended recipient specified in the original bridge message.
    pub to: Pubkey,

    /// The amount of SOL to transfer, denominated in lamports (1 SOL = 1_000_000_000 lamports).
    /// This amount will be transferred from the SOL vault to the recipient.
    pub amount: u64,
}

impl FinalizeBridgeSol {
    pub fn finalize<'info>(&self, account_infos: &'info [AccountInfo<'info>]) -> Result<()> {
        // Read the accounts in the expected order
        let mut iter = account_infos.iter();
        let sol_vault_info = next_account_info(&mut iter)?;
        let to_info = next_account_info(&mut iter)?;
        let system_program_info = Program::<System>::try_from(next_account_info(&mut iter)?)?;

        // Verify the recipient matches the instruction data
        require_keys_eq!(to_info.key(), self.to, BridgeError::IncorrectTo);

        // Verify the SOL vault PDA is correct
        let sol_vault_seeds = &[SOL_VAULT_SEED, self.remote_token.as_ref()];
        let (sol_vault_pda, sol_vault_bump) = Pubkey::find_program_address(sol_vault_seeds, &ID);

        require_keys_eq!(
            sol_vault_info.key(),
            sol_vault_pda,
            BridgeError::IncorrectSolVault
        );

        // Transfer SOL from the SOL vault to the recipient
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
