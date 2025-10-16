use anchor_lang::prelude::*;

use crate::base_to_solana::ProveBuffer;
use crate::BridgeError;

/// Append chunk of serialized `Message` data to the `ProveBuffer`.
#[derive(Accounts)]
pub struct AppendToProveBufferData<'info> {
    /// Owner authorized to modify the buffer
    pub owner: Signer<'info>,

    /// Prove buffer account to append data to
    #[account(
        mut,
        has_one = owner @ BridgeError::BufferUnauthorizedAppend,
    )]
    pub prove_buffer: Account<'info, ProveBuffer>,
}

pub fn append_to_prove_buffer_data_handler(
    ctx: Context<AppendToProveBufferData>,
    chunk: Vec<u8>,
) -> Result<()> {
    let buf = &mut ctx.accounts.prove_buffer;
    buf.data.extend_from_slice(&chunk);
    Ok(())
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
            AppendToProveBufferData as AppendToProveBufferDataIx, InitializeProveBuffer,
        },
        test_utils::{setup_bridge, SetupBridgeResult},
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
    fn test_append_to_prove_buffer_data_success() {
        let SetupBridgeResult { mut svm, .. } = setup_bridge();

        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        let prove_buffer = Keypair::new();
        setup_prove_buffer(&mut svm, &owner, &prove_buffer, 1024, 8);

        let chunk = vec![0x01, 0x02, 0x03];

        let accounts = accounts::AppendToProveBufferData {
            owner: owner.pubkey(),
            prove_buffer: prove_buffer.pubkey(),
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: AppendToProveBufferDataIx {
                chunk: chunk.clone(),
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&owner],
            Message::new(&[ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx)
            .expect("Failed to append to prove buffer data");

        let acct = svm.get_account(&prove_buffer.pubkey()).unwrap();
        let buf = ProveBuffer::try_deserialize(&mut &acct.data[..]).unwrap();
        assert_eq!(buf.data, chunk);
    }

    #[test]
    fn test_append_to_prove_buffer_data_unauthorized() {
        let SetupBridgeResult { mut svm, .. } = setup_bridge();

        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        let unauthorized = Keypair::new();
        svm.airdrop(&unauthorized.pubkey(), LAMPORTS_PER_SOL)
            .unwrap();

        let prove_buffer = Keypair::new();
        setup_prove_buffer(&mut svm, &owner, &prove_buffer, 256, 4);

        let accounts = accounts::AppendToProveBufferData {
            owner: unauthorized.pubkey(),
            prove_buffer: prove_buffer.pubkey(),
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: AppendToProveBufferDataIx { chunk: vec![0xAA] }.data(),
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
