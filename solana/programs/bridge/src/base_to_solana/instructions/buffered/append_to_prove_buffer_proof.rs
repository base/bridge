use anchor_lang::prelude::*;

use crate::base_to_solana::ProveBuffer;

/// Append chunk of MMR proof nodes to the `ProveBuffer`.
#[derive(Accounts)]
pub struct AppendToProveBufferProof<'info> {
    /// Owner authorized to modify the buffer
    pub owner: Signer<'info>,

    /// Prove buffer account to append proof nodes to
    #[account(
        mut,
        has_one = owner @ AppendToProveBufferProofError::Unauthorized,
    )]
    pub prove_buffer: Account<'info, ProveBuffer>,
}

pub fn append_to_prove_buffer_proof_handler(
    ctx: Context<AppendToProveBufferProof>,
    proof_chunk: Vec<[u8; 32]>,
) -> Result<()> {
    let buf = &mut ctx.accounts.prove_buffer;
    buf.proof.extend_from_slice(&proof_chunk);
    Ok(())
}

#[error_code]
pub enum AppendToProveBufferProofError {
    #[msg("Only the owner can modify this prove buffer")]
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
        instruction::{
            AppendToProveBufferProof as AppendToProveBufferProofIx, InitializeProveBuffer,
        },
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
    fn test_append_to_prove_buffer_proof_success() {
        let (mut svm, _payer, _bridge_pda) = setup_bridge_and_svm();

        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        let prove_buffer = Keypair::new();
        setup_prove_buffer(&mut svm, &owner, &prove_buffer, 1024, 8);

        let chunk = vec![[1u8; 32], [2u8; 32]];

        let accounts = accounts::AppendToProveBufferProof {
            owner: owner.pubkey(),
            prove_buffer: prove_buffer.pubkey(),
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: AppendToProveBufferProofIx {
                proof_chunk: chunk.clone(),
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&owner],
            Message::new(&[ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx)
            .expect("Failed to append to prove buffer proof");

        let acct = svm.get_account(&prove_buffer.pubkey()).unwrap();
        let buf = ProveBuffer::try_deserialize(&mut &acct.data[..]).unwrap();
        assert_eq!(buf.proof, chunk);
    }

    #[test]
    fn test_append_to_prove_buffer_proof_unauthorized() {
        let (mut svm, _payer, _bridge_pda) = setup_bridge_and_svm();

        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        let unauthorized = Keypair::new();
        svm.airdrop(&unauthorized.pubkey(), LAMPORTS_PER_SOL)
            .unwrap();

        let prove_buffer = Keypair::new();
        setup_prove_buffer(&mut svm, &owner, &prove_buffer, 256, 4);

        let accounts = accounts::AppendToProveBufferProof {
            owner: unauthorized.pubkey(),
            prove_buffer: prove_buffer.pubkey(),
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: AppendToProveBufferProofIx {
                proof_chunk: vec![[0xAAu8; 32]],
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&unauthorized],
            Message::new(&[ix], Some(&unauthorized.pubkey())),
            svm.latest_blockhash(),
        );

        let result = svm.send_transaction(tx);
        assert!(result.is_err(), "Expected unauthorized append to fail");
        let err = format!("{:?}", result.unwrap_err());
        assert!(err.contains("Unauthorized"), "Unexpected error: {}", err);
    }
}
