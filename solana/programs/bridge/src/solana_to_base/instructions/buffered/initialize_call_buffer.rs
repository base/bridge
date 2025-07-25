use anchor_lang::prelude::*;

use crate::solana_to_base::{CallBuffer, CallType, MAX_CALL_BUFFER_SIZE};

/// Accounts struct for initializing a call buffer account that can store large call data.
/// This account can be used to build up call data over multiple transactions before bridging.
#[derive(Accounts)]
#[instruction(_ty: CallType, _to: [u8; 20], _value: u128, _initial_data: Vec<u8>, max_data_len: usize)]
pub struct InitializeCallBuffer<'info> {
    /// The account paying for the transaction fees and the call buffer account creation.
    /// It is set as the owner of the call buffer account.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The call buffer account being created.
    #[account(
        init,
        payer = payer,
        space = CallBuffer::space(max_data_len),
    )]
    pub call_buffer: Account<'info, CallBuffer>,

    /// System program for account creation.
    pub system_program: Program<'info, System>,
}

pub fn initialize_call_buffer_handler(
    ctx: Context<InitializeCallBuffer>,
    ty: CallType,
    to: [u8; 20],
    value: u128,
    initial_data: Vec<u8>,
    max_data_len: usize,
) -> Result<()> {
    // Verify that the max data length doesn't exceed the max allowed size.
    require!(
        max_data_len <= MAX_CALL_BUFFER_SIZE,
        InitializeCallBufferError::MaxSizeExceeded
    );

    *ctx.accounts.call_buffer = CallBuffer {
        owner: ctx.accounts.payer.key(),
        ty,
        to,
        value,
        data: initial_data,
    };

    Ok(())
}

#[error_code]
pub enum InitializeCallBufferError {
    #[msg("Call buffer size exceeds maximum allowed size of 64KB")]
    MaxSizeExceeded,
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
        accounts, instruction::InitializeCallBuffer as InitializeCallBufferIx,
        solana_to_base::CallType, test_utils::setup_bridge_and_svm, ID,
    };

    #[test]
    fn test_initialize_call_buffer_success() {
        let (mut svm, _payer, _bridge_pda) = setup_bridge_and_svm();

        // Create payer account
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Create call buffer account
        let call_buffer = Keypair::new();

        // Test parameters
        let ty = CallType::Call;
        let to = [1u8; 20];
        let value = 100u128;
        let initial_data = vec![0x12, 0x34, 0x56, 0x78];
        let max_data_len = 1024;

        // Build the InitializeCallBuffer instruction accounts
        let accounts = accounts::InitializeCallBuffer {
            payer: payer.pubkey(),
            call_buffer: call_buffer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the InitializeCallBuffer instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: InitializeCallBufferIx {
                ty,
                to,
                value,
                initial_data: initial_data.clone(),
                max_data_len,
            }
            .data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[&payer, &call_buffer],
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

    // TODO: Uncomment once we implemented proper realloc to allow reaching the max size
    //       https://stackoverflow.com/a/70156099
    // #[test]
    // fn test_initialize_call_buffer_max_size_exceeded() {
    //     let (mut svm, _payer, _bridge_pda) = setup_bridge_and_svm();

    //     // Create payer account
    //     let payer = Keypair::new();
    //     svm.airdrop(&payer.pubkey(), LAMPORTS_PER_SOL).unwrap();

    //     // Create call buffer account
    //     let call_buffer = Keypair::new();

    //     // Test parameters with max_data_len exceeding MAX_CALL_BUFFER_SIZE
    //     let ty = CallType::Call;
    //     let to = [1u8; 20];
    //     let value = 0u128;
    //     let initial_data = vec![0x12, 0x34];
    //     let max_data_len = MAX_CALL_BUFFER_SIZE + 1; // Exceed the limit

    //     // Build the InitializeCallBuffer instruction accounts
    //     let accounts = accounts::InitializeCallBuffer {
    //         payer: payer.pubkey(),
    //         call_buffer: call_buffer.pubkey(),
    //         system_program: system_program::ID,
    //     }
    //     .to_account_metas(None);

    //     // Build the InitializeCallBuffer instruction
    //     let ix = Instruction {
    //         program_id: ID,
    //         accounts,
    //         data: InitializeCallBufferIx {
    //             ty,
    //             to,
    //             value,
    //             initial_data,
    //             max_data_len,
    //         }
    //         .data(),
    //     };

    //     // Build the transaction
    //     let tx = Transaction::new(
    //         &[&payer, &call_buffer],
    //         Message::new(&[ix], Some(&payer.pubkey())),
    //         svm.latest_blockhash(),
    //     );

    //     // Send the transaction - should fail
    //     let result = svm.send_transaction(tx);
    //     assert!(
    //         result.is_err(),
    //         "Expected transaction to fail with max size exceeded"
    //     );

    //     // Check that the error contains the expected error message
    //     let error_string = format!("{:?}", result.unwrap_err());
    //     assert!(
    //         error_string.contains("MaxSizeExceeded"),
    //         "Expected MaxSizeExceeded error, got: {}",
    //         error_string
    //     );
    // }
}
