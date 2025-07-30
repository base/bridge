use anchor_lang::prelude::*;

use crate::solana_to_base::{CallBuffer, CallType, MAX_CALL_BUFFER_SIZE};

/// Accounts struct for initializing a call buffer account that can store large call data.
/// The account must be pre-allocated by the user to avoid CPI size limitations.
#[derive(Accounts)]
#[instruction(_ty: CallType, _to: [u8; 20], _value: u128, initial_data: Vec<u8>)]
pub struct InitializeCallBuffer<'info> {
    /// The account paying for the transaction fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: We will initialize this account
    /// The call buffer account to initialize (must be pre-allocated by the user).
    #[account(
        mut,
        owner = crate::ID,
        constraint = call_buffer.data_len() <= 8 + CallBuffer::space(MAX_CALL_BUFFER_SIZE) @ InitializeCallBufferError::MaxSizeExceeded,
    )]
    pub call_buffer: AccountInfo<'info>,

    /// System program (kept for compatibility but not used since account is pre-allocated).
    pub system_program: Program<'info, System>,
}

pub fn initialize_call_buffer_handler(
    ctx: Context<InitializeCallBuffer>,
    ty: CallType,
    to: [u8; 20],
    value: u128,
    initial_data: Vec<u8>,
) -> Result<()> {
    // Ensure account is not already initialized
    const DISCRIMINATOR_LEN: usize = CallBuffer::DISCRIMINATOR.len();
    let call_buffer_data = ctx.accounts.call_buffer.try_borrow_data()?;
    if call_buffer_data[..DISCRIMINATOR_LEN] != [0u8; DISCRIMINATOR_LEN] {
        return Err(InitializeCallBufferError::AlreadyInitialized.into());
    }
    drop(call_buffer_data);

    // Create the CallBuffer struct
    let call_buffer = CallBuffer {
        owner: ctx.accounts.payer.key(),
        ty,
        to,
        value,
        data: initial_data,
    };

    // Serialize the account data.
    // NOTE: This will write the discriminator to the account.
    let mut call_buffer_data = ctx.accounts.call_buffer.try_borrow_mut_data()?;
    CallBuffer::try_serialize(&call_buffer, &mut &mut call_buffer_data[..])?;

    Ok(())
}

#[error_code]
pub enum InitializeCallBufferError {
    #[msg("Call buffer size exceeds maximum allowed size")]
    MaxSizeExceeded,
    #[msg("Account is already initialized")]
    AlreadyInitialized,
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
        instruction::InitializeCallBuffer as InitializeCallBufferIx,
        solana_to_base::{CallBuffer, CallType, MAX_CALL_BUFFER_SIZE},
        test_utils::{create_call_buffer, setup_bridge_and_svm},
        ID,
    };

    #[test]
    fn test_initialize_call_buffer_success() {
        let (mut svm, _payer, _bridge_pda) = setup_bridge_and_svm();

        // Create payer account
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Test parameters
        let ty = CallType::Call;
        let to = [1u8; 20];
        let value = 100u128;
        let initial_data = vec![0x12, 0x34, 0x56, 0x78];

        // Create call buffer account
        let required_space = 8 + CallBuffer::space(initial_data.len());
        let call_buffer = create_call_buffer(&mut svm, &payer, required_space);

        // Build the InitializeCallBuffer instruction
        let accounts = accounts::InitializeCallBuffer {
            payer: payer.pubkey(),
            call_buffer: call_buffer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: InitializeCallBufferIx {
                ty,
                to,
                value,
                initial_data: initial_data.clone(),
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&payer],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        // Send the transaction
        svm.send_transaction(tx)
            .expect("Failed to send initialize_call_buffer transaction");

        // Verify the CallBuffer account was created correctly
        let call_buffer_account = svm.get_account(&call_buffer.pubkey()).unwrap();
        assert_eq!(call_buffer_account.owner, ID);

        let call_buffer_data =
            CallBuffer::try_deserialize(&mut &call_buffer_account.data[..]).unwrap();

        // Verify the call buffer fields
        assert_eq!(call_buffer_data.owner, payer.pubkey());
        assert_eq!(call_buffer_data.ty, ty);
        assert_eq!(call_buffer_data.to, to);
        assert_eq!(call_buffer_data.value, value);
        assert_eq!(call_buffer_data.data, initial_data);
    }

    #[test]
    fn test_initialize_call_buffer_already_initialized() {
        let (mut svm, _payer, _bridge_pda) = setup_bridge_and_svm();

        // Create payer account
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Test parameters
        let ty = CallType::Call;
        let to = [1u8; 20];
        let value = 100u128;
        let initial_data = vec![0x12, 0x34, 0x56, 0x78];

        // Create call buffer account
        let required_space = 8 + CallBuffer::space(initial_data.len());
        let call_buffer = create_call_buffer(&mut svm, &payer, required_space);

        let accounts = accounts::InitializeCallBuffer {
            payer: payer.pubkey(),
            call_buffer: call_buffer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: InitializeCallBufferIx {
                ty,
                to,
                value,
                initial_data: initial_data.clone(),
            }
            .data(),
        };

        // Build the transaction with two initialization instructions
        let tx = Transaction::new(
            &[&payer],
            Message::new(&[ix.clone(), ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        // Send the transaction - should fail with AlreadyInitialized
        let result = svm.send_transaction(tx);
        assert!(
            result.is_err(),
            "Expected transaction to fail with already initialized error"
        );

        // Check that the error contains the expected error message
        let error_string = format!("{:?}", result.unwrap_err());
        assert!(
            error_string.contains("AlreadyInitialized"),
            "Expected AlreadyInitialized error, got: {}",
            error_string
        );
    }

    #[test]
    fn test_initialize_call_buffer_max_size_exceeded() {
        let (mut svm, _payer, _bridge_pda) = setup_bridge_and_svm();

        // Create payer account
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), LAMPORTS_PER_SOL * 10).unwrap(); // Extra SOL for large account

        // Test parameters
        let ty = CallType::Call;
        let to = [1u8; 20];
        let value = 0u128;
        let initial_data = vec![0x12, 0x34];

        // Calculate a size that exceeds the maximum allowed size
        let excessive_size = 8 + CallBuffer::space(MAX_CALL_BUFFER_SIZE) + 1;

        // Create call buffer account with excessive size
        let call_buffer = create_call_buffer(&mut svm, &payer, excessive_size);

        // Build the InitializeCallBuffer instruction
        let accounts = accounts::InitializeCallBuffer {
            payer: payer.pubkey(),
            call_buffer: call_buffer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: InitializeCallBufferIx {
                ty,
                to,
                value,
                initial_data,
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&payer],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        // Send the transaction - should fail with MaxSizeExceeded
        let result = svm.send_transaction(tx);
        assert!(
            result.is_err(),
            "Expected transaction to fail with max size exceeded"
        );

        // Check that the error contains the expected error message
        let error_string = format!("{:?}", result.unwrap_err());
        assert!(
            error_string.contains("MaxSizeExceeded"),
            "Expected MaxSizeExceeded error, got: {}",
            error_string
        );
    }
}
