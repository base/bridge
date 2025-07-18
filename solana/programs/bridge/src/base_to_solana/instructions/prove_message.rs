use anchor_lang::{prelude::*, solana_program::keccak};

use crate::base_to_solana::{
    constants::INCOMING_MESSAGE_SEED,
    internal::mmr::{self, Proof},
    state::{IncomingMessage, OutputRoot},
    Message,
};

/// Accounts struct for the prove_message instruction that verifies a message exists on Base.
/// This instruction creates a proven message account after validating the message against an MMR proof
/// and an output root. The proven message can later be relayed/executed on Solana.
#[derive(Accounts)]
#[instruction(nonce: u64, sender: [u8; 20], data: Vec<u8>, _proof: Proof, message_hash: [u8; 32])]
pub struct ProveMessage<'info> {
    /// The account that pays for the transaction and incoming message account creation.
    /// Must be mutable to deduct lamports for account rent.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The output root account containing the merkle root from Base.
    /// Used to verify that the message proof is valid against the committed state.
    /// This root must have been previously registered via register_output_root instruction.
    pub output_root: Account<'info, OutputRoot>,

    /// The incoming message account being created to store the proven message.
    /// - Uses PDA with INCOMING_MESSAGE_SEED and message hash for deterministic address
    /// - Payer funds the account creation
    /// - Space dynamically allocated based on message data length
    /// - Once created, this account can be used by relay instructions to execute the message
    #[account(
        init,
        payer = payer,
        space = 8 + IncomingMessage::space(data.len()),
        seeds = [INCOMING_MESSAGE_SEED, &message_hash],
        bump
    )]
    pub message: Account<'info, IncomingMessage>,

    /// System program required for creating new accounts.
    /// Used internally by Anchor for account initialization.
    pub system_program: Program<'info, System>,
}

pub fn prove_message_handler(
    ctx: Context<ProveMessage>,
    nonce: u64,
    sender: [u8; 20],
    data: Vec<u8>,
    proof: Proof,
    message_hash: [u8; 32],
) -> Result<()> {
    // Verify that the provided message hash matches the computed hash
    let computed_hash = hash_message(&nonce.to_be_bytes(), &sender, &data);
    require!(
        message_hash == computed_hash,
        ProveMessageError::InvalidMessageHash
    );

    // Verify the merkle proof to ensure the transaction exists on the source chain
    mmr::verify_proof(&ctx.accounts.output_root.root, &message_hash, &proof)?;

    *ctx.accounts.message = IncomingMessage {
        executed: false,
        sender,
        message: Message::try_from_slice(&data)?,
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
pub enum ProveMessageError {
    #[msg("Invalid message hash")]
    InvalidMessageHash,
}
