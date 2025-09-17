use anchor_lang::{prelude::*, solana_program::keccak};

use crate::{
    base_to_solana::{
        constants::INCOMING_MESSAGE_SEED, internal::mmr, state::IncomingMessage, Message,
        OutputRoot, ProveBuffer,
    },
    common::{bridge::Bridge, BRIDGE_SEED, DISCRIMINATOR_LEN},
};

/// Buffered variant of `prove_message` that reads data/proof from a `ProveBuffer` and closes it.
#[derive(Accounts)]
#[instruction(nonce: u64, sender: [u8; 20], message_hash: [u8; 32])]
pub struct ProveMessageBuffered<'info> {
    /// Payer funds the IncomingMessage account
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Output root to verify the proof against
    pub output_root: Account<'info, OutputRoot>,

    /// The incoming message account created if proof verifies
    #[account(
        init,
        payer = payer,
        space = DISCRIMINATOR_LEN + IncomingMessage::space(prove_buffer.data.len()),
        seeds = [INCOMING_MESSAGE_SEED, &message_hash],
        bump
    )]
    pub message: Account<'info, IncomingMessage>,

    /// Bridge for pause check
    #[account(seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    /// Owner receives rent when buffer is closed
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Prove buffer containing data and proof; closed on success
    #[account(
        mut,
        close = owner,
        has_one = owner @ ProveMessageBufferedError::Unauthorized,
    )]
    pub prove_buffer: Account<'info, ProveBuffer>,

    pub system_program: Program<'info, System>,
}

pub fn prove_message_buffered_handler(
    ctx: Context<ProveMessageBuffered>,
    nonce: u64,
    sender: [u8; 20],
    message_hash: [u8; 32],
) -> Result<()> {
    // Pause
    require!(
        !ctx.accounts.bridge.paused,
        ProveMessageBufferedError::BridgePaused
    );

    // Verify hash
    let data = &ctx.accounts.prove_buffer.data;
    let computed_hash = hash_message(&nonce.to_be_bytes(), &sender, data);
    require!(
        message_hash == computed_hash,
        ProveMessageBufferedError::InvalidMessageHash
    );

    // Verify proof
    mmr::verify_proof(
        &ctx.accounts.output_root.root,
        &message_hash,
        &nonce,
        &ctx.accounts.prove_buffer.proof,
        ctx.accounts.output_root.total_leaf_count,
    )?;

    // Deserialize and save
    let message_enum = Message::try_from_slice(data)?;
    *ctx.accounts.message = IncomingMessage {
        executed: false,
        sender,
        message: message_enum,
    };

    Ok(())
}

fn hash_message(nonce: &[u8], sender: &[u8; 20], data: &[u8]) -> [u8; 32] {
    let mut data_to_hash = Vec::new();
    data_to_hash.extend_from_slice(nonce);
    data_to_hash.extend_from_slice(sender);
    data_to_hash.extend_from_slice(data);
    keccak::hash(&data_to_hash).0
}

#[error_code]
pub enum ProveMessageBufferedError {
    #[msg("Invalid message hash")]
    InvalidMessageHash,
    #[msg("Only the owner can close this prove buffer")]
    Unauthorized,
    #[msg("Bridge is currently paused")]
    BridgePaused,
}

#[cfg(test)]
mod tests {
    use super::*;

    use anchor_lang::prelude::Pubkey;
    use anchor_lang::solana_program::keccak::hash as keccak_hash;
    use anchor_lang::{solana_program::instruction::Instruction, system_program, InstructionData};
    use litesvm::LiteSVM;
    use solana_account::Account as SvmAccount;
    use solana_keypair::Keypair;
    use solana_message::Message as SolMessage;
    use solana_signer::Signer as _;
    use solana_transaction::Transaction;

    use crate::{
        accounts,
        base_to_solana::{state::IncomingMessage, Message as BridgeMessage},
        common::bridge::Bridge,
        instruction::{
            AppendToProveBufferData, AppendToProveBufferProof, InitializeProveBuffer,
            ProveMessageBuffered as ProveMessageBufferedIx,
        },
        test_utils::setup_bridge_and_svm,
        ID,
    };

    fn create_output_root_account(
        svm: &mut LiteSVM,
        root_pk: Pubkey,
        root: [u8; 32],
        total_leaf_count: u64,
    ) {
        let output_root = crate::base_to_solana::state::OutputRoot {
            root,
            total_leaf_count,
        };
        let mut data = Vec::new();
        output_root.try_serialize(&mut data).unwrap();
        svm.set_account(
            root_pk,
            SvmAccount {
                lamports: 1_000_000,
                data,
                owner: ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
    }

    fn compute_message_hash(nonce: u64, sender: [u8; 20], data: &[u8]) -> [u8; 32] {
        let mut v = Vec::new();
        v.extend_from_slice(&nonce.to_be_bytes());
        v.extend_from_slice(&sender);
        v.extend_from_slice(data);
        keccak_hash(&v).0
    }

    fn buffered_message_setup(
        svm: &mut LiteSVM,
        bridge_pda: Pubkey,
    ) -> ([u8; 32], Pubkey, Keypair, Keypair, u64, [u8; 20], Vec<u8>) {
        // Owner of the prove buffer
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();

        // Create prove buffer account via initialize
        let prove_buffer = Keypair::new();
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
                max_data_len: 1024,
                max_proof_len: 8,
            }
            .data(),
        };

        let init_tx = Transaction::new(
            &[&owner, &prove_buffer],
            SolMessage::new(&[init_ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );
        svm.send_transaction(init_tx)
            .expect("initialize_prove_buffer should succeed");

        // Build message data and append to buffer
        let message = BridgeMessage::Call(vec![]);
        let message_bytes = message.try_to_vec().unwrap();

        let append_data_accounts = accounts::AppendToProveBufferData {
            owner: owner.pubkey(),
            prove_buffer: prove_buffer.pubkey(),
        }
        .to_account_metas(None);

        let append_data_ix = Instruction {
            program_id: ID,
            accounts: append_data_accounts,
            data: AppendToProveBufferData {
                chunk: message_bytes.clone(),
            }
            .data(),
        };
        let append_data_tx = Transaction::new(
            &[&owner],
            SolMessage::new(&[append_data_ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );
        svm.send_transaction(append_data_tx)
            .expect("append data should succeed");

        // Append empty proof (MMR with one leaf)
        let append_proof_accounts = accounts::AppendToProveBufferProof {
            owner: owner.pubkey(),
            prove_buffer: prove_buffer.pubkey(),
        }
        .to_account_metas(None);
        let append_proof_ix = Instruction {
            program_id: ID,
            accounts: append_proof_accounts,
            data: AppendToProveBufferProof {
                proof_chunk: vec![],
            }
            .data(),
        };
        let append_proof_tx = Transaction::new(
            &[&owner],
            SolMessage::new(&[append_proof_ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );
        svm.send_transaction(append_proof_tx)
            .expect("append proof should succeed");

        // Create OutputRoot account with root = message_hash for total_leaf_count = 1
        let nonce = 0u64;
        let sender = [7u8; 20];
        let message_hash = compute_message_hash(nonce, sender, &message_bytes);
        let output_root_pk = Keypair::new().pubkey();
        create_output_root_account(svm, output_root_pk, message_hash, 1);

        (
            message_hash,
            output_root_pk,
            owner,
            prove_buffer,
            nonce,
            sender,
            message_bytes,
        )
    }

    #[test]
    fn test_prove_message_buffered_success_creates_incoming_message_and_closes_buffer() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        let (message_hash, output_root_pk, owner, prove_buffer, nonce, sender, message_bytes) =
            buffered_message_setup(&mut svm, bridge_pda);

        // Incoming message PDA derived from seed and message_hash
        let incoming_pda = Pubkey::find_program_address(
            &[
                crate::base_to_solana::constants::INCOMING_MESSAGE_SEED,
                &message_hash,
            ],
            &ID,
        )
        .0;

        // Prove using buffered data
        let prove_accounts = accounts::ProveMessageBuffered {
            payer: payer.pubkey(),
            output_root: output_root_pk,
            message: incoming_pda,
            bridge: bridge_pda,
            owner: owner.pubkey(),
            prove_buffer: prove_buffer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let prove_ix = Instruction {
            program_id: ID,
            accounts: prove_accounts,
            data: ProveMessageBufferedIx {
                nonce,
                sender,
                message_hash,
            }
            .data(),
        };

        let prove_tx = Transaction::new(
            &[&payer, &owner],
            SolMessage::new(&[prove_ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );
        svm.send_transaction(prove_tx)
            .expect("prove_message_buffered should succeed");

        // Verify IncomingMessage account contents
        let msg_account = svm.get_account(&incoming_pda).unwrap();
        assert_eq!(msg_account.owner, ID);
        let incoming = IncomingMessage::try_deserialize(&mut &msg_account.data[..]).unwrap();
        assert!(!incoming.executed);
        assert_eq!(incoming.sender, sender);
        let stored_bytes = incoming.message.clone().try_to_vec().unwrap();
        assert_eq!(stored_bytes, message_bytes);

        // Verify the prove buffer was closed
        let buffer_account = svm.get_account(&prove_buffer.pubkey()).unwrap();
        assert_eq!(buffer_account.lamports, 0);
        assert_eq!(buffer_account.data.len(), 0);
        assert_eq!(buffer_account.owner, system_program::ID);
    }

    #[test]
    fn test_prove_message_buffered_fails_with_unauthorized_owner() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        let (message_hash, output_root_pk, _, prove_buffer, nonce, sender, _) =
            buffered_message_setup(&mut svm, bridge_pda);

        let incoming_pda = Pubkey::find_program_address(
            &[
                crate::base_to_solana::constants::INCOMING_MESSAGE_SEED,
                &message_hash,
            ],
            &ID,
        )
        .0;

        let unauthorized = Keypair::new();
        svm.airdrop(&unauthorized.pubkey(), 1_000_000_000).unwrap();

        // Attempt prove with wrong owner
        let prove_accounts = accounts::ProveMessageBuffered {
            payer: payer.pubkey(),
            output_root: output_root_pk,
            message: incoming_pda,
            bridge: bridge_pda,
            owner: unauthorized.pubkey(), // wrong owner
            prove_buffer: prove_buffer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let prove_ix = Instruction {
            program_id: ID,
            accounts: prove_accounts,
            data: ProveMessageBufferedIx {
                nonce,
                sender,
                message_hash,
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&payer, &unauthorized],
            SolMessage::new(&[prove_ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );
        let result = svm.send_transaction(tx);
        assert!(result.is_err(), "expected unauthorized error");
        let err = format!("{:?}", result.unwrap_err());
        assert!(err.contains("Unauthorized"), "unexpected error: {}", err);
    }

    #[test]
    fn test_prove_message_buffered_fails_with_invalid_message_hash() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();

        let prove_buffer = Keypair::new();
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
                max_data_len: 16,
                max_proof_len: 0,
            }
            .data(),
        };
        let init_tx = Transaction::new(
            &[&owner, &prove_buffer],
            SolMessage::new(&[init_ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );
        svm.send_transaction(init_tx).unwrap();

        // Put some data into buffer
        let message = BridgeMessage::Call(vec![]);
        let message_bytes = message.try_to_vec().unwrap();
        let append_accounts = accounts::AppendToProveBufferData {
            owner: owner.pubkey(),
            prove_buffer: prove_buffer.pubkey(),
        }
        .to_account_metas(None);
        let append_ix = Instruction {
            program_id: ID,
            accounts: append_accounts,
            data: AppendToProveBufferData {
                chunk: message_bytes,
            }
            .data(),
        };
        let append_tx = Transaction::new(
            &[&owner],
            SolMessage::new(&[append_ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );
        svm.send_transaction(append_tx).unwrap();

        // Create OutputRoot (values won't matter; hash check fails first)
        let output_root_pk = Keypair::new().pubkey();
        create_output_root_account(&mut svm, output_root_pk, [9u8; 32], 1);

        let bad_message_hash = [0u8; 32];
        let incoming_pda = Pubkey::find_program_address(
            &[
                crate::base_to_solana::constants::INCOMING_MESSAGE_SEED,
                &bad_message_hash,
            ],
            &ID,
        )
        .0;

        let prove_accounts = accounts::ProveMessageBuffered {
            payer: payer.pubkey(),
            output_root: output_root_pk,
            message: incoming_pda,
            bridge: bridge_pda,
            owner: owner.pubkey(),
            prove_buffer: prove_buffer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let prove_ix = Instruction {
            program_id: ID,
            accounts: prove_accounts,
            data: ProveMessageBufferedIx {
                nonce: 0,
                sender: [1u8; 20],
                message_hash: bad_message_hash,
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&payer, &owner],
            SolMessage::new(&[prove_ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );
        let result = svm.send_transaction(tx);
        assert!(result.is_err(), "expected InvalidMessageHash error");
        let err = format!("{:?}", result.unwrap_err());
        assert!(err.contains("InvalidMessageHash"));
    }

    #[test]
    fn test_prove_message_buffered_fails_when_bridge_paused() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        let (_, output_root_pk, owner, prove_buffer, _, _, _) =
            buffered_message_setup(&mut svm, bridge_pda);

        // Pause the bridge
        let mut bridge_acc = svm.get_account(&bridge_pda).unwrap();
        let mut bridge = Bridge::try_deserialize(&mut &bridge_acc.data[..]).unwrap();
        bridge.paused = true;
        let mut new_data = Vec::new();
        bridge.try_serialize(&mut new_data).unwrap();
        bridge_acc.data = new_data;
        svm.set_account(bridge_pda, bridge_acc).unwrap();

        let incoming_pda = Pubkey::find_program_address(
            &[
                crate::base_to_solana::constants::INCOMING_MESSAGE_SEED,
                &[0u8; 32],
            ],
            &ID,
        )
        .0;

        let prove_accounts = accounts::ProveMessageBuffered {
            payer: payer.pubkey(),
            output_root: output_root_pk,
            message: incoming_pda,
            bridge: bridge_pda,
            owner: owner.pubkey(),
            prove_buffer: prove_buffer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let prove_ix = Instruction {
            program_id: ID,
            accounts: prove_accounts,
            data: ProveMessageBufferedIx {
                nonce: 0,
                sender: [0u8; 20],
                message_hash: [0u8; 32],
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&payer, &owner],
            SolMessage::new(&[prove_ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );
        let result = svm.send_transaction(tx);
        assert!(result.is_err(), "expected failure when bridge is paused");
        let err = format!("{:?}", result.unwrap_err());
        assert!(err.contains("BridgePaused"), "unexpected error: {}", err);
    }
}
