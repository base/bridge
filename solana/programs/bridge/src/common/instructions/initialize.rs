use anchor_lang::prelude::*;

use crate::common::{
    bridge::{
        Bridge, BufferConfig, Eip1559, Eip1559Config, GasConfig, GasCostConfig, ProtocolConfig,
    },
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

    /// The guardian account that will have administrative authority over the bridge.
    /// Must be a signer to ensure the initializer controls this account.
    pub guardian: Signer<'info>,

    /// System program required for creating new accounts.
    /// Used internally by Anchor for account initialization.
    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(
    ctx: Context<Initialize>,
    eip1559_config: Eip1559Config,
    gas_cost_config: GasCostConfig,
    gas_config: GasConfig,
    protocol_config: ProtocolConfig,
    buffer_config: BufferConfig,
) -> Result<()> {
    let current_timestamp = Clock::get()?.unix_timestamp;
    let minimum_base_fee = eip1559_config.minimum_base_fee;

    *ctx.accounts.bridge = Bridge {
        base_block_number: 0,
        base_last_relayed_nonce: 0,
        nonce: 1, // Starts the first nonce at 1 so that 0 can safely be used to initialize `base_last_relayed_nonce`
        guardian: ctx.accounts.guardian.key(),
        paused: false, // Initialize bridge as unpaused
        eip1559: Eip1559 {
            config: eip1559_config,
            current_base_fee: minimum_base_fee,
            current_window_gas_used: 0,
            window_start_time: current_timestamp,
        },
        gas_cost_config,
        gas_config,
        protocol_config,
        buffer_config,
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

        // Create guardian keypair
        let guardian = Keypair::new();
        let guardian_pk = guardian.pubkey();

        // Mock the clock to ensure we get a proper timestamp
        let timestamp = 1747440000; // May 16th, 2025
        mock_clock(&mut svm, timestamp);

        // Find the Bridge PDA
        let bridge_pda = Pubkey::find_program_address(&[BRIDGE_SEED], &ID).0;

        // Build the Initialize instruction accounts
        let accounts = accounts::Initialize {
            payer: payer_pk,
            bridge: bridge_pda,
            guardian: guardian_pk,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the Initialize instruction (no guardian parameter needed)
        let gas_fee_receiver = Pubkey::new_unique();
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: Initialize {
                eip1559_config: Eip1559Config::test_new(),
                gas_cost_config: GasCostConfig::test_new(gas_fee_receiver),
                gas_config: GasConfig::test_new(),
                protocol_config: ProtocolConfig::test_new(),
                buffer_config: BufferConfig::test_new(),
            }
            .data(),
        };

        // Build the transaction with both payer and guardian as signers
        let tx = Transaction::new(
            &[&payer, &guardian],
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
                base_last_relayed_nonce: 0,
                nonce: 1,
                guardian: guardian_pk,
                paused: false,
                eip1559: Eip1559 {
                    config: Eip1559Config::test_new(),
                    current_base_fee: 1,
                    current_window_gas_used: 0,
                    window_start_time: timestamp,
                },
                gas_cost_config: GasCostConfig::test_new(gas_fee_receiver),
                gas_config: GasConfig::test_new(),
                protocol_config: ProtocolConfig::test_new(),
                buffer_config: BufferConfig::test_new(),
            }
        );
    }
}
