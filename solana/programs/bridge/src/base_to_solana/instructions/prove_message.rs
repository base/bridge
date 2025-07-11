use anchor_lang::{prelude::*, solana_program::keccak};

use crate::base_to_solana::{
    constants::INCOMING_MESSAGE_SEED,
    internal::mmr::{self, Proof},
    state::{IncomingMessage, OutputRoot},
    Message,
};

#[derive(Accounts)]
#[instruction(nonce: u64, sender: [u8; 20], data: Vec<u8>, _proof: Proof, message_hash: [u8; 32])]
pub struct ProveMessage<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub output_root: Account<'info, OutputRoot>,

    #[account(
        init,
        payer = payer,
        space = 8 + IncomingMessage::space(data.len()),
        seeds = [INCOMING_MESSAGE_SEED, &message_hash],
        bump
    )]
    pub message: Account<'info, IncomingMessage>,

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
