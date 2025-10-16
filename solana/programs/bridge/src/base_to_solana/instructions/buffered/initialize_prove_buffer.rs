use anchor_lang::prelude::*;

use crate::{
    base_to_solana::ProveBuffer,
    common::{bridge::Bridge, BRIDGE_SEED, DISCRIMINATOR_LEN},
};

/// Accounts for initializing a `ProveBuffer` which can hold large prove inputs.
#[derive(Accounts)]
#[instruction(_max_data_len: u64, _max_proof_len: u64)]
pub struct InitializeProveBuffer<'info> {
    /// Payer funds the buffer account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Bridge for pause checks (future use); also a consistent pattern like call buffers
    #[account(
        seeds = [BRIDGE_SEED],
        bump
    )]
    pub bridge: Account<'info, Bridge>,

    /// Prove buffer to be created with capacity sized by the provided max lengths
    #[account(
        init,
        payer = payer,
        space = DISCRIMINATOR_LEN + ProveBuffer::space(_max_data_len as usize, _max_proof_len as usize),
    )]
    pub prove_buffer: Account<'info, ProveBuffer>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_prove_buffer_handler(
    ctx: Context<InitializeProveBuffer>,
    _max_data_len: u64,
    _max_proof_len: u64,
) -> Result<()> {
    *ctx.accounts.prove_buffer = ProveBuffer {
        owner: ctx.accounts.payer.key(),
        data: Vec::new(),
        proof: Vec::new(),
    };

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use anchor_lang::{solana_program::instruction::Instruction, system_program, InstructionData};
    use solana_keypair::Keypair;
    use solana_message::Message;
    use solana_signer::Signer as _;
    use solana_transaction::Transaction;

    use crate::{
        accounts,
        instruction::InitializeProveBuffer as InitializeProveBufferIx,
        test_utils::{setup_bridge, SetupBridgeResult},
        ID,
    };

    #[test]
    fn test_initialize_prove_buffer_success() {
        let SetupBridgeResult {
            mut svm,
            payer,
            bridge_pda,
            ..
        } = setup_bridge();

        // Prove buffer account
        let prove_buffer = Keypair::new();

        // Parameters
        let max_data_len: u64 = 1024;
        let max_proof_len: u64 = 8;

        // Accounts metas
        let accounts = accounts::InitializeProveBuffer {
            payer: payer.pubkey(),
            bridge: bridge_pda,
            prove_buffer: prove_buffer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: InitializeProveBufferIx {
                max_data_len,
                max_proof_len,
            }
            .data(),
        };

        // Transaction
        let tx = Transaction::new(
            &[&payer, &prove_buffer],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx)
            .expect("initialize_prove_buffer should succeed");

        // Verify account owner and state
        let acct = svm.get_account(&prove_buffer.pubkey()).unwrap();
        assert_eq!(acct.owner, ID);

        let buf = ProveBuffer::try_deserialize(&mut &acct.data[..]).unwrap();
        assert_eq!(buf.owner, payer.pubkey());
        assert!(buf.data.is_empty());
        assert!(buf.proof.is_empty());
    }

    #[test]
    fn test_initialize_prove_buffer_allocates_expected_space() {
        let SetupBridgeResult {
            mut svm,
            payer,
            bridge_pda,
            ..
        } = setup_bridge();

        // Prove buffer account
        let prove_buffer = Keypair::new();

        // Parameters
        let max_data_len: u64 = 512;
        let max_proof_len: u64 = 4;

        // Accounts metas
        let accounts = accounts::InitializeProveBuffer {
            payer: payer.pubkey(),
            bridge: bridge_pda,
            prove_buffer: prove_buffer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: InitializeProveBufferIx {
                max_data_len,
                max_proof_len,
            }
            .data(),
        };

        // Transaction
        let tx = Transaction::new(
            &[&payer, &prove_buffer],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx).unwrap();

        // Verify allocated size matches expectation
        let acct = svm.get_account(&prove_buffer.pubkey()).unwrap();
        let expected = crate::common::DISCRIMINATOR_LEN
            + ProveBuffer::space(max_data_len as usize, max_proof_len as usize);
        assert_eq!(acct.data.len(), expected);
    }
}
