use anchor_lang::{prelude::*, solana_program::instruction::Instruction};

/// Instruction to be executed by the wallet.
/// Functionally equivalent to a Solana Instruction.
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
/// Identical to Solana's AccountMeta but implements AnchorSerialize and AnchorDeserialize.
#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub struct IxAccount {
    /// Public key of the account.
    pub pubkey_or_pda: PubkeyOrPda,
    /// Whether the account is writable.
    pub is_writable: bool,
    /// Whether the account is a signer.
    pub is_signer: bool,
}

#[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
pub enum PubkeyOrPda {
    Pubkey(Pubkey),
    Pda {
        seeds: Vec<Vec<u8>>,
        program_id: Pubkey,
    },
}

/// Converts a Ix to a Solana Instruction.
impl From<Ix> for Instruction {
    fn from(ix: Ix) -> Instruction {
        Instruction {
            program_id: ix.program_id,
            accounts: ix.accounts.into_iter().map(Into::into).collect(),
            data: ix.data.clone(),
        }
    }
}

/// Converts a IxAccount to a Solana AccountMeta.
impl From<IxAccount> for AccountMeta {
    fn from(account: IxAccount) -> AccountMeta {
        let pubkey = match account.pubkey_or_pda {
            PubkeyOrPda::Pubkey(pubkey) => pubkey,
            PubkeyOrPda::Pda { seeds, program_id } => {
                let seeds: Vec<&[u8]> = seeds.iter().map(|v| v.as_slice()).collect();
                let (pubkey, _) = Pubkey::find_program_address(seeds.as_slice(), &program_id);
                pubkey
            }
        };

        match account.is_writable {
            false => AccountMeta::new_readonly(pubkey, account.is_signer),
            true => AccountMeta::new(pubkey, account.is_signer),
        }
    }
}

/// Converts a Solana Instruction to a Ix.
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

/// Converts a Solana AccountMeta to a IxAccount.
/// NOTE: Only used in tests.
impl From<AccountMeta> for IxAccount {
    fn from(account: AccountMeta) -> IxAccount {
        IxAccount {
            pubkey_or_pda: PubkeyOrPda::Pubkey(account.pubkey),
            is_writable: account.is_writable,
            is_signer: account.is_signer,
        }
    }
}
