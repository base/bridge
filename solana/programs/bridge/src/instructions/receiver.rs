use anchor_lang::{
    prelude::*,
    solana_program::{self, keccak},
};

use crate::{Ix, Message, MessengerPayload, OutputRoot, DEFAULT_SENDER, MESSAGE_SEED};

use super::messenger;

#[derive(Accounts)]
#[instruction(transaction_hash: [u8; 32])]
pub struct ProveTransaction<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Message::INIT_SPACE,
        seeds = [MESSAGE_SEED, &transaction_hash],
        bump
    )]
    pub message: Account<'info, Message>,

    pub output_root: Account<'info, OutputRoot>,

    #[account(mut)]
    payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn prove_transaction_handler(
    ctx: Context<ProveTransaction>,
    transaction_hash: &[u8; 32],
    remote_sender: &[u8; 20],
    ixs: Vec<Ix>,
    proof: Vec<[u8; 32]>,
) -> Result<()> {
    let message_hash = hash_ixs(remote_sender, &ixs);
    require!(
        message_hash == *transaction_hash,
        ReceiverError::InvalidTransactionHash
    );

    // Run merkle proof of proof against ctx.accounts.output_root.output_root
    require!(
        verify(&proof, &ctx.accounts.output_root.root, &message_hash),
        ReceiverError::InvalidProof
    );

    ctx.accounts.message.ixs = ixs;
    ctx.accounts.message.sender = DEFAULT_SENDER;
    ctx.accounts.message.remote_sender = *remote_sender;

    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeTransaction<'info> {
    #[account(mut)]
    pub message: Account<'info, Message>,
}

pub fn finalize_transaction_handler(ctx: Context<FinalizeTransaction>) -> Result<()> {
    require!(
        !ctx.accounts.message.is_executed,
        ReceiverError::AlreadyExecuted
    );

    ctx.accounts.message.is_executed = true;
    handle_ixs(
        ctx.program_id.as_ref(),
        &mut ctx.accounts.message,
        ctx.remaining_accounts,
    )
}

/**
 * @dev Returns true if a `leaf` can be proved to be a part of a Merkle tree
 * defined by `root`. For this, a `proof` must be provided, containing
 * sibling hashes on the branch from the leaf to the root of the tree. Each
 * pair of leaves and each pair of pre-images are assumed to be sorted.
 *
 * This version handles proofs in memory with the default hashing function.
 */
fn verify(proof: &[[u8; 32]], root: &[u8; 32], leaf: &[u8; 32]) -> bool {
    process_proof(proof, leaf) == *root
}

/**
 * @dev Returns the rebuilt hash obtained by traversing a Merkle tree up
 * from `leaf` using `proof`. A `proof` is valid if and only if the rebuilt
 * hash matches the root of the tree. When processing the proof, the pairs
 * of leaves & pre-images are assumed to be sorted.
 *
 * This version handles proofs in memory with the default hashing function.
 */
fn process_proof(proof: &[[u8; 32]], leaf: &[u8; 32]) -> [u8; 32] {
    let mut computed_hash = *leaf;

    for node in proof {
        computed_hash = commutative_keccak256(computed_hash, *node);
    }

    computed_hash
}

/**
 * @dev Commutative Keccak256 hash of a sorted pair of bytes32. Frequently used when working with merkle proofs.
 *
 * NOTE: Equivalent to the `standardNodeHash` in our https://github.com/OpenZeppelin/merkle-tree[JavaScript library].
 */
fn commutative_keccak256(a: [u8; 32], b: [u8; 32]) -> [u8; 32] {
    if a < b {
        efficient_keccak256(a, b)
    } else {
        efficient_keccak256(b, a)
    }
}

/**
 * @dev Implementation of keccak256(abi.encode(a, b)) that doesn't allocate or expand memory.
 */
fn efficient_keccak256(a: [u8; 32], b: [u8; 32]) -> [u8; 32] {
    let mut data_to_hash = Vec::new();
    data_to_hash.extend_from_slice(&a);
    data_to_hash.extend_from_slice(&b);
    keccak::hash(&data_to_hash).to_bytes()
}

/// Creates a hash of the instructions to identify the transaction.
fn hash_ixs(remote_sender: &[u8; 20], ixs: &[Ix]) -> [u8; 32] {
    // Create a canonical representation of the instructions.
    let mut data = Vec::new();

    data.extend_from_slice(remote_sender);

    // Add each instruction.
    for ix in ixs {
        // Add program ID.
        data.extend_from_slice(&ix.program_id.to_bytes());

        // Add each account.
        for account in &ix.accounts {
            data.extend_from_slice(&account.pubkey.to_bytes());
            data.push(account.is_writable as u8);
            data.push(account.is_signer as u8);
        }

        // Add data.
        data.extend_from_slice(&ix.data);
    }

    // Hash the data using keccak256.
    keccak::hash(&data).0
}

fn handle_ixs(
    program_id: &[u8],
    message_account: &mut Account<Message>,
    remaining_accounts: &[AccountInfo],
) -> Result<()> {
    for ix in &message_account.ixs.clone() {
        if ix.program_id == messenger::local_messenger_pubkey(program_id) {
            messenger::relay_message(
                program_id,
                message_account,
                remaining_accounts,
                MessengerPayload::try_from_slice(&ix.data)?,
            )?;
        } else {
            solana_program::program::invoke(&ix.into(), remaining_accounts)?;
        }
    }
    Ok(())
}

#[error_code]
pub enum ReceiverError {
    #[msg("Invalid transaction hash")]
    InvalidTransactionHash,
    #[msg("Invalid proof")]
    InvalidProof,
    #[msg("Already executed")]
    AlreadyExecuted,
}
