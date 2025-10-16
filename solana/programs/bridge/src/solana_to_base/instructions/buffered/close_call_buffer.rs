use anchor_lang::prelude::*;

use crate::{solana_to_base::CallBuffer, BridgeError};

/// Accounts struct for closing a call buffer account.
#[derive(Accounts)]
pub struct CloseCallBuffer<'info> {
    /// The account paying for the transaction fees and receiving the rent back.
    /// It must be the owner of the call buffer account.
    pub owner: Signer<'info>,

    /// The call buffer account to close
    #[account(
        mut,
        close = owner,
        has_one = owner @ BridgeError::BufferUnauthorizedClose,
    )]
    pub call_buffer: Account<'info, CallBuffer>,
}

pub fn close_call_buffer_handler(_ctx: Context<CloseCallBuffer>) -> Result<()> {
    // The account will be closed automatically by Anchor due to the `close = owner` constraint
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::{common::BRIDGE_SEED, test_utils::SetupBridgeResult};
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
        instruction::{CloseCallBuffer as CloseCallBufferIx, InitializeCallBuffer},
        solana_to_base::CallType,
        test_utils::setup_bridge,
        ID,
    };

    fn setup_call_buffer(
        svm: &mut litesvm::LiteSVM,
        owner: &solana_keypair::Keypair,
        call_buffer: &solana_keypair::Keypair,
        initial_data: Vec<u8>,
    ) {
        // Initialize the call buffer first
        let bridge_pda = Pubkey::find_program_address(&[BRIDGE_SEED], &ID).0;
        let init_accounts = accounts::InitializeCallBuffer {
            payer: owner.pubkey(),
            bridge: bridge_pda,
            call_buffer: call_buffer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let init_ix = Instruction {
            program_id: ID,
            accounts: init_accounts,
            data: InitializeCallBuffer {
                ty: CallType::Call,
                to: [1u8; 20],
                value: 0u128,
                initial_data,
                max_data_len: 1024,
            }
            .data(),
        };

        let init_tx = Transaction::new(
            &[owner, call_buffer],
            Message::new(&[init_ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(init_tx)
            .expect("Failed to initialize call buffer");
    }

    #[test]
    fn test_close_call_buffer_success() {
        let SetupBridgeResult { mut svm, .. } = setup_bridge();

        // Create owner account
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Create call buffer account
        let call_buffer = Keypair::new();

        // Setup call buffer with initial data
        let initial_data = vec![0x12, 0x34, 0x56, 0x78];
        setup_call_buffer(&mut svm, &owner, &call_buffer, initial_data);

        // Get initial owner balance
        let initial_owner_balance = svm.get_account(&owner.pubkey()).unwrap().lamports;

        // Build the CloseCallBuffer instruction accounts
        let accounts = accounts::CloseCallBuffer {
            owner: owner.pubkey(),
            call_buffer: call_buffer.pubkey(),
        }
        .to_account_metas(None);

        // Build the CloseCallBuffer instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: CloseCallBufferIx {}.data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[&owner],
            Message::new(&[ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        // Send the transaction
        svm.send_transaction(tx)
            .expect("Failed to send close_call_buffer transaction");

        // Verify the call buffer account was closed (should have 0 lamports and 0 data)
        let call_buffer_account = svm.get_account(&call_buffer.pubkey()).unwrap();
        assert_eq!(
            call_buffer_account.lamports, 0,
            "Call buffer should have 0 lamports after being closed"
        );
        assert_eq!(
            call_buffer_account.data.len(),
            0,
            "Call buffer should have 0 data length after being closed"
        );
        assert_eq!(
            call_buffer_account.owner,
            system_program::ID,
            "Call buffer should be owned by system program after being closed"
        );

        // Verify the owner received the rent back
        let final_owner_balance = svm.get_account(&owner.pubkey()).unwrap().lamports;
        assert!(
            final_owner_balance > initial_owner_balance,
            "Owner should have received rent back"
        );
    }

    #[test]
    fn test_close_call_buffer_unauthorized() {
        let SetupBridgeResult { mut svm, .. } = setup_bridge();

        // Create owner account
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Create unauthorized account
        let unauthorized = Keypair::new();
        svm.airdrop(&unauthorized.pubkey(), LAMPORTS_PER_SOL)
            .unwrap();

        // Create call buffer account
        let call_buffer = Keypair::new();

        // Setup call buffer with owner
        let initial_data = vec![0x12, 0x34];
        setup_call_buffer(&mut svm, &owner, &call_buffer, initial_data);

        // Try to close call buffer with unauthorized account
        // Build the CloseCallBuffer instruction accounts with wrong owner
        let accounts = accounts::CloseCallBuffer {
            owner: unauthorized.pubkey(), // Wrong owner
            call_buffer: call_buffer.pubkey(),
        }
        .to_account_metas(None);

        // Build the CloseCallBuffer instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: CloseCallBufferIx {}.data(),
        };

        // Build the transaction
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
