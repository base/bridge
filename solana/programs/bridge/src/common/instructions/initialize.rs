use anchor_lang::prelude::*;

use crate::common::{
    bridge::{Bridge, Eip1559},
    BRIDGE_SEED,
};

/// Accounts struct for the initialize instruction that sets up the bridge program's initial state.
/// This instruction creates the main bridge account with default values for cross-chain operations
/// between Base and Solana.
#[derive(Accounts)]
pub struct Initialize<'info> {
    /// The account that pays for the transaction and bridge account creation.
    /// Must be mutable to deduct lamports for account rent.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The bridge state account being initialized.
    /// - Uses PDA with BRIDGE_SEED for deterministic address
    /// - Payer funds the account creation
    /// - Space allocated for bridge state (8-byte discriminator + Bridge::INIT_SPACE)
    #[account(
        init,
        payer = payer,
        seeds = [BRIDGE_SEED],
        bump,
        space = 8 + Bridge::INIT_SPACE
    )]
    pub bridge: Account<'info, Bridge>,

    /// System program required for creating new accounts.
    /// Used internally by Anchor for account initialization.
    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(ctx: Context<Initialize>) -> Result<()> {
    let current_timestamp = Clock::get()?.unix_timestamp;

    *ctx.accounts.bridge = Bridge {
        base_block_number: 0,
        nonce: 0,
        eip1559: Eip1559::new(current_timestamp),
    };

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use anchor_lang::{
        solana_program::{
            example_mocks::solana_sdk::system_program, instruction::Instruction,
            native_token::LAMPORTS_PER_SOL,
        },
        InstructionData,
    };
    use litesvm::LiteSVM;
    use solana_keypair::Keypair;
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    use crate::{accounts, instruction::Initialize, test_utils::mock_clock, ID};

    #[test]
    fn test_initialize_handler() {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(ID, "../../target/deploy/bridge.so")
            .unwrap();

        // Create test accounts
        let payer = Keypair::new();
        let payer_pk = payer.pubkey();
        svm.airdrop(&payer_pk, LAMPORTS_PER_SOL).unwrap();

        // Mock the clock to ensure we get a proper timestamp
        let timestamp = 1747440000; // May 16th, 2025
        mock_clock(&mut svm, timestamp);

        // Find the Bridge PDA
        let bridge_pda = Pubkey::find_program_address(&[BRIDGE_SEED], &ID).0;

        // Build the Initialize instruction accounts
        let accounts = accounts::Initialize {
            payer: payer_pk,
            bridge: bridge_pda,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the Initialize instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: Initialize {}.data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[payer],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );

        // Send the transaction
        svm.send_transaction(tx)
            .expect("Failed to send transaction");

        // Assert the Bridge account state is correctly initialized
        let bridge = svm.get_account(&bridge_pda).unwrap();
        assert_eq!(bridge.owner, ID);
        let bridge = Bridge::try_deserialize(&mut &bridge.data[..]).unwrap();

        // Assert the Bridge state is correctly initialized
        assert_eq!(
            bridge,
            Bridge {
                base_block_number: 0,
                nonce: 0,
                eip1559: Eip1559::new(timestamp),
            }
        );
    }
}
