use anchor_lang::{prelude::*, solana_program::instruction::Instruction};

/// Instruction to be executed by the bridge program via signed CPI during message relay.
/// Functionally equivalent to a Solana `Instruction`, but serialized with Anchor for cross-program messaging.
#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct Ix {
    /// Program that will process this instruction.
    pub program_id: Pubkey,
    /// Accounts required for this instruction.
    pub accounts: Vec<IxAccount>,
    /// Instruction data.
    pub data: Vec<u8>,
}

/// Account used in an instruction.
/// Similar to Solana's `AccountMeta`, but serializable with Anchor and supports PDAs via `PubkeyOrPda`.
#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct IxAccount {
    /// Public key of the account.
    pub pubkey: Pubkey,
    /// Whether the account is writable.
    pub is_writable: bool,
    /// Whether the account is a signer.
    pub is_signer: bool,
}

/// Converts an Ix to a Solana Instruction.
impl From<Ix> for Instruction {
    fn from(ix: Ix) -> Instruction {
        Instruction {
            program_id: ix.program_id,
            accounts: ix.accounts.into_iter().map(Into::into).collect(),
            data: ix.data.clone(),
        }
    }
}

/// Converts an IxAccount to a Solana AccountMeta.
impl From<IxAccount> for AccountMeta {
    fn from(account: IxAccount) -> AccountMeta {
        match account.is_writable {
            false => AccountMeta::new_readonly(account.pubkey, account.is_signer),
            true => AccountMeta::new(account.pubkey, account.is_signer),
        }
    }
}

/// Converts a Solana Instruction to an Ix.
/// NOTE: Only used in tests.
impl From<Instruction> for Ix {
    fn from(ix: Instruction) -> Ix {
        Ix {
            program_id: ix.program_id,
            accounts: ix.accounts.into_iter().map(Into::into).collect(),
            data: ix.data.clone(),
        }
    }
}

/// Converts a Solana AccountMeta to an IxAccount.
/// NOTE: Only used in tests.
impl From<AccountMeta> for IxAccount {
    fn from(account: AccountMeta) -> IxAccount {
        IxAccount {
            pubkey: account.pubkey,
            is_writable: account.is_writable,
            is_signer: account.is_signer,
        }
    }
}
