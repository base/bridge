use anchor_lang::{prelude::*, solana_program::instruction::Instruction};

#[derive(InitSpace)]
#[account]
pub struct Message {
    /// Whether the message has been executed.
    pub is_executed: bool,
    /// Whether the message has failed.
    pub failed_message: bool,
    /// Whether the message has been successful.
    pub successful_message: bool,
    /// Remote sender of the message.
    pub remote_sender: [u8; 20],
    /// Sender of the message.
    pub sender: [u8; 20],
    /// Instructions to be executed by the wallet.
    #[max_len(10)]
    pub ixs: Vec<Ix>,
}

/// Instruction to be executed by the wallet.
/// Functionally equivalent to a Solana Instruction.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct Ix {
    /// Program that will process this instruction.
    pub program_id: Pubkey,
    /// Accounts required for this instruction.
    #[max_len(10)]
    pub accounts: Vec<IxAccount>,
    /// Instruction data.
    #[max_len(256)]
    pub data: Vec<u8>,
}

/// Account used in an instruction.
/// Identical to Solana's AccountMeta but implements AnchorSerialize and AnchorDeserialize.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct IxAccount {
    /// Public key of the account.
    pub pubkey: Pubkey,
    /// Whether the account is writable.
    pub is_writable: bool,
    /// Whether the account is a signer.
    pub is_signer: bool,
}

/// Converts a Ix to a Solana Instruction.
impl From<&Ix> for Instruction {
    fn from(ix: &Ix) -> Instruction {
        Instruction {
            program_id: ix.program_id,
            accounts: ix.accounts.iter().map(Into::into).collect(),
            data: ix.data.clone(),
        }
    }
}

/// Converts a IxAccount to a Solana AccountMeta.
impl From<&IxAccount> for AccountMeta {
    fn from(account: &IxAccount) -> AccountMeta {
        match account.is_writable {
            false => AccountMeta::new_readonly(account.pubkey, account.is_signer),
            true => AccountMeta::new(account.pubkey, account.is_signer),
        }
    }
}

#[derive(AnchorDeserialize)]
pub struct MessengerPayload {
    pub nonce: [u8; 32],
    pub sender: [u8; 20],
    pub message: Vec<u8>,
}
