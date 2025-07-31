use anchor_lang::prelude::*;

use crate::solana_to_base::CallBuffer;

/// Accounts struct for appending data to an existing call buffer account.
/// This allows building up large call data over multiple transactions.
#[derive(Accounts)]
pub struct AppendToCallBuffer<'info> {
    /// The account paying for the transaction fees.
    /// It must be the owner of the call buffer account.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The call buffer account to append data to
    #[account(
        mut,
        has_one = owner @ AppendToCallBufferError::Unauthorized,
    )]
    pub call_buffer: Account<'info, CallBuffer>,
}

pub fn append_to_call_buffer_handler(
    ctx: Context<AppendToCallBuffer>,
    data: Vec<u8>,
) -> Result<()> {
    let call_buffer = &mut ctx.accounts.call_buffer;
    call_buffer.data.extend_from_slice(&data);

    Ok(())
}

#[error_code]
pub enum AppendToCallBufferError {
    #[msg("Only the owner can append to this call buffer")]
    Unauthorized,
}

#[cfg(test)]
mod tests {
    use super::*;

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
        instruction::{AppendToCallBuffer as AppendToCallBufferIx, InitializeCallBuffer},
        solana_to_base::{CallBuffer, CallType, MAX_CALL_BUFFER_SIZE},
        test_utils::{create_call_buffer, setup_bridge_and_svm},
        ID,
    };

    fn setup_call_buffer(
        svm: &mut litesvm::LiteSVM,
        owner: &solana_keypair::Keypair,
        initial_data: Vec<u8>,
        remaining_space: Option<usize>,
    ) -> solana_keypair::Keypair {
        // Create and initialize the call buffer
        let required_space =
            8 + CallBuffer::space(initial_data.len() + remaining_space.unwrap_or_default());
        let call_buffer = create_call_buffer(svm, owner, required_space);

        let init_accounts = accounts::InitializeCallBuffer {
            payer: owner.pubkey(),
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
            }
            .data(),
        };

        let init_tx = Transaction::new(
            &[owner],
            Message::new(&[init_ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(init_tx)
            .expect("Failed to initialize call buffer");

        call_buffer
    }

    #[test]
    fn test_append_to_call_buffer_success() {
        let (mut svm, _payer, _bridge_pda) = setup_bridge_and_svm();

        // Create owner account
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Setup call buffer with initial data
        let call_buffer = setup_call_buffer(&mut svm, &owner, vec![], Some(MAX_CALL_BUFFER_SIZE));

        let chunk_size = 1000;
        let chunks = MAX_CALL_BUFFER_SIZE / chunk_size;

        let mut expected_data = vec![];
        for i in 0..chunks {
            let append_data = vec![i as u8; chunk_size];
            expected_data.extend_from_slice(&append_data);

            // Build the AppendToCallBuffer instruction accounts
            let accounts = accounts::AppendToCallBuffer {
                owner: owner.pubkey(),
                call_buffer: call_buffer.pubkey(),
            }
            .to_account_metas(None);

            // Build the AppendToCallBuffer instruction
            let ix = Instruction {
                program_id: ID,
                accounts,
                data: AppendToCallBufferIx {
                    data: append_data.clone(),
                }
                .data(),
            };

            // Build the transaction
            let tx = Transaction::new(
                &[&owner],
                Message::new(&[ix], Some(&owner.pubkey())),
                svm.latest_blockhash(),
            );

            // Send the transaction
            svm.send_transaction(tx)
                .expect("Failed to send append_to_call_buffer transaction");

            // Verify the data was appended correctly
            let call_buffer_account = svm.get_account(&call_buffer.pubkey()).unwrap();
            let call_buffer_data =
                CallBuffer::try_deserialize(&mut &call_buffer_account.data[..]).unwrap();
            assert_eq!(call_buffer_data.data, expected_data);
        }
    }

    #[test]
    fn test_append_to_call_buffer_unauthorized() {
        let (mut svm, _payer, _bridge_pda) = setup_bridge_and_svm();

        // Create owner account
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Create unauthorized account
        let unauthorized = Keypair::new();
        svm.airdrop(&unauthorized.pubkey(), LAMPORTS_PER_SOL)
            .unwrap();

        // Setup call buffer with owner
        let initial_data = vec![0x12, 0x34];
        let call_buffer = setup_call_buffer(&mut svm, &owner, initial_data, Some(2));

        // Try to append data with unauthorized account
        let append_data = vec![0x56, 0x78];

        // Build the AppendToCallBuffer instruction accounts with wrong owner
        let accounts = accounts::AppendToCallBuffer {
            owner: unauthorized.pubkey(), // Wrong owner
            call_buffer: call_buffer.pubkey(),
        }
        .to_account_metas(None);

        // Build the AppendToCallBuffer instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: AppendToCallBufferIx { data: append_data }.data(),
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
