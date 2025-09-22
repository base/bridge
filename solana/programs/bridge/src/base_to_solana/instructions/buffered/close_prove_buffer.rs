use anchor_lang::prelude::*;

use crate::base_to_solana::ProveBuffer;

/// Accounts struct for closing a prove buffer account.
#[derive(Accounts)]
pub struct CloseProveBuffer<'info> {
    /// The account paying for the transaction fees and receiving the rent back.
    /// It must be the owner of the prove buffer account.
    pub owner: Signer<'info>,

    /// The prove buffer account to close
    #[account(
        mut,
        close = owner,
        has_one = owner @ CloseProveBufferError::Unauthorized,
    )]
    pub prove_buffer: Account<'info, ProveBuffer>,
}

pub fn close_prove_buffer_handler(_ctx: Context<CloseProveBuffer>) -> Result<()> {
    // The account will be closed automatically by Anchor due to the `close = owner` constraint
    Ok(())
}

#[error_code]
pub enum CloseProveBufferError {
    #[msg("Only the owner can close this prove buffer")]
    Unauthorized,
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::common::BRIDGE_SEED;
    use anchor_lang::{
        solana_program::{instruction::Instruction, native_token::LAMPORTS_PER_SOL},
        system_program, InstructionData,
    };
    use solana_keypair::Keypair;
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    use crate::{
        accounts,
        instruction::{CloseProveBuffer as CloseProveBufferIx, InitializeProveBuffer},
        test_utils::setup_bridge_and_svm,
        ID,
    };

    fn setup_prove_buffer(
        svm: &mut litesvm::LiteSVM,
        owner: &solana_keypair::Keypair,
        prove_buffer: &solana_keypair::Keypair,
        max_data_len: u64,
        max_proof_len: u64,
    ) {
        let bridge_pda = Pubkey::find_program_address(&[BRIDGE_SEED], &ID).0;

        let init_accounts = accounts::InitializeProveBuffer {
            payer: owner.pubkey(),
            bridge: bridge_pda,
            prove_buffer: prove_buffer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let init_ix = Instruction {
            program_id: ID,
            accounts: init_accounts,
            data: InitializeProveBuffer {
                max_data_len,
                max_proof_len,
            }
            .data(),
        };

        let init_tx = Transaction::new(
            &[owner, prove_buffer],
            Message::new(&[init_ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(init_tx)
            .expect("Failed to initialize prove buffer");
    }

    #[test]
    fn test_close_prove_buffer_success() {
        let (mut svm, _payer, _bridge_pda) = setup_bridge_and_svm();

        // Create owner account
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Create prove buffer account
        let prove_buffer = Keypair::new();

        // Setup prove buffer with capacity
        setup_prove_buffer(&mut svm, &owner, &prove_buffer, 1024, 8);

        // Get initial owner balance
        let initial_owner_balance = svm.get_account(&owner.pubkey()).unwrap().lamports;

        // Build the CloseProveBuffer instruction accounts
        let accounts = accounts::CloseProveBuffer {
            owner: owner.pubkey(),
            prove_buffer: prove_buffer.pubkey(),
        }
        .to_account_metas(None);

        // Build the CloseProveBuffer instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: CloseProveBufferIx {}.data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[&owner],
            Message::new(&[ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        // Send the transaction
        svm.send_transaction(tx)
            .expect("Failed to send close_prove_buffer transaction");

        // Verify the prove buffer account was closed
        let prove_buffer_account = svm.get_account(&prove_buffer.pubkey()).unwrap();
        assert_eq!(
            prove_buffer_account.lamports, 0,
            "Prove buffer should have 0 lamports after being closed"
        );
        assert_eq!(
            prove_buffer_account.data.len(),
            0,
            "Prove buffer should have 0 data length after being closed"
        );
        assert_eq!(
            prove_buffer_account.owner,
            system_program::ID,
            "Prove buffer should be owned by system program after being closed"
        );

        // Verify the owner received the rent back
        let final_owner_balance = svm.get_account(&owner.pubkey()).unwrap().lamports;
        assert!(
            final_owner_balance > initial_owner_balance,
            "Owner should have received rent back"
        );
    }

    #[test]
    fn test_close_prove_buffer_unauthorized() {
        let (mut svm, _payer, _bridge_pda) = setup_bridge_and_svm();

        // Create owner account
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Create unauthorized account
        let unauthorized = Keypair::new();
        svm.airdrop(&unauthorized.pubkey(), LAMPORTS_PER_SOL)
            .unwrap();

        // Create prove buffer account
        let prove_buffer = Keypair::new();

        // Setup prove buffer with owner
        setup_prove_buffer(&mut svm, &owner, &prove_buffer, 256, 4);

        // Try to close prove buffer with unauthorized account
        let accounts = accounts::CloseProveBuffer {
            owner: unauthorized.pubkey(),
            prove_buffer: prove_buffer.pubkey(),
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: CloseProveBufferIx {}.data(),
        };

        let tx = Transaction::new(
            &[&unauthorized],
            Message::new(&[ix], Some(&unauthorized.pubkey())),
            svm.latest_blockhash(),
        );

        // Send the transaction - should fail
        let result = svm.send_transaction(tx);
        assert!(
            result.is_err(),
            "Expected transaction to fail with unauthorized owner"
        );

        // Check that the error contains the expected error message
        let error_string = format!("{:?}", result.unwrap_err());
        assert!(
            error_string.contains("Unauthorized"),
            "Expected Unauthorized error, got: {}",
            error_string
        );
    }
}
