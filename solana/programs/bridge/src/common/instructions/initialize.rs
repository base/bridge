use anchor_lang::prelude::*;

use crate::common::{
    bridge::{Bridge, Eip1559},
    Config, BRIDGE_SEED,
};

/// Accounts for the initialize instruction that sets up the bridge program's initial state.
/// This instruction creates the main bridge account for cross-chain operations between Base and
/// Solana, using the provided configuration values and initializing counters/state to zero.
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
    /// Must be a signer to prove ownership of the guardian key. The payer and guardian
    /// may be distinct signers.
    pub guardian: Signer<'info>,

    /// System program required for creating new accounts.
    /// Used internally by Anchor for account initialization.
    pub system_program: Program<'info, System>,
}

/// Initializes the `Bridge` state account with the provided configs, sets the guardian to the
/// provided signer, starts unpaused, zeros counters, sets the EIP-1559 base fee to
/// `eip1559_config.minimum_base_fee`, and records the current timestamp as the window start.
pub fn initialize_handler(ctx: Context<Initialize>, cfg: Config) -> Result<()> {
    let current_timestamp = Clock::get()?.unix_timestamp;
    let minimum_base_fee = cfg.eip1559_config.minimum_base_fee;

    cfg.validate()?;

    *ctx.accounts.bridge = Bridge {
        base_block_number: 0,
        nonce: 0,
        guardian: ctx.accounts.guardian.key(),
        paused: false, // Initialize bridge as unpaused
        eip1559: Eip1559 {
            config: cfg.eip1559_config,
            current_base_fee: minimum_base_fee,
            current_window_gas_used: 0,
            window_start_time: current_timestamp,
        },
        gas_config: cfg.gas_config,
        protocol_config: cfg.protocol_config,
        buffer_config: cfg.buffer_config,
        partner_oracle_config: cfg.partner_oracle_config,
        base_oracle_config: cfg.base_oracle_config,
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

    use crate::{
        accounts,
        common::{
            bridge::{BufferConfig, Eip1559Config, GasConfig, PartnerOracleConfig, ProtocolConfig},
            BaseOracleConfig,
        },
        instruction::Initialize,
        test_utils::mock_clock,
        ID,
    };

    const TEST_TIMESTAMP: i64 = 1747440000; // May 16th, 2025

    fn setup_env() -> (LiteSVM, Keypair, Keypair, Pubkey, Vec<AccountMeta>) {
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
        mock_clock(&mut svm, TEST_TIMESTAMP);

        // Find the PDAs
        let bridge_pda = Pubkey::find_program_address(&[BRIDGE_SEED], &ID).0;

        // Build the Initialize instruction accounts
        let accounts = accounts::Initialize {
            payer: payer_pk,
            bridge: bridge_pda,
            guardian: guardian_pk,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        (svm, payer, guardian, bridge_pda, accounts)
    }

    #[test]
    fn test_initialize_handler() {
        let (mut svm, payer, guardian, bridge_pda, accounts) = setup_env();
        let payer_pk = payer.pubkey();
        let guardian_pk = guardian.pubkey();

        // Build the Initialize instruction (no guardian parameter needed)
        let gas_fee_receiver = Pubkey::new_unique();
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: Initialize {
                cfg: Config {
                    eip1559_config: Eip1559Config::test_new(),
                    gas_config: GasConfig::test_new(gas_fee_receiver),
                    protocol_config: ProtocolConfig::test_new(),
                    buffer_config: BufferConfig::test_new(),
                    partner_oracle_config: PartnerOracleConfig::default(),
                    base_oracle_config: BaseOracleConfig::test_new(),
                },
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
                nonce: 0,
                guardian: guardian_pk,
                paused: false,
                eip1559: Eip1559 {
                    config: Eip1559Config::test_new(),
                    current_base_fee: 1,
                    current_window_gas_used: 0,
                    window_start_time: TEST_TIMESTAMP,
                },
                gas_config: GasConfig::test_new(gas_fee_receiver),
                protocol_config: ProtocolConfig::test_new(),
                buffer_config: BufferConfig::test_new(),
                partner_oracle_config: PartnerOracleConfig::default(),
                base_oracle_config: BaseOracleConfig::test_new(),
            }
        );
    }

    #[test]
    fn test_initialize_partner_threshold_too_high_fails() {
        let (mut svm, payer, guardian, _bridge_pda, accounts) = setup_env();
        let payer_pk = payer.pubkey();

        // Build the Initialize instruction with an invalid partner threshold (> 5)
        let gas_fee_receiver = Pubkey::new_unique();
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: Initialize {
                cfg: Config {
                    eip1559_config: Eip1559Config::test_new(),
                    gas_config: GasConfig::test_new(gas_fee_receiver),
                    protocol_config: ProtocolConfig::test_new(),
                    buffer_config: BufferConfig::test_new(),
                    partner_oracle_config: PartnerOracleConfig {
                        required_threshold: 6,
                    },
                    base_oracle_config: BaseOracleConfig::test_new(),
                },
            }
            .data(),
        };

        // Build the transaction with both payer and guardian as signers
        let tx = Transaction::new(
            &[&payer, &guardian],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );

        // Send the transaction and expect failure
        let result = svm.send_transaction(tx);
        assert!(result.is_err());
    }

    #[test]
    fn test_initialize_base_oracle_threshold_zero_fails() {
        let (mut svm, payer, guardian, _bridge_pda, accounts) = setup_env();
        let payer_pk = payer.pubkey();

        // Build the Initialize instruction with an invalid base oracle threshold (== 0)
        let gas_fee_receiver = Pubkey::new_unique();
        let mut base_oracle_config = BaseOracleConfig::test_new();
        base_oracle_config.threshold = 0;

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: Initialize {
                cfg: Config {
                    eip1559_config: Eip1559Config::test_new(),
                    gas_config: GasConfig::test_new(gas_fee_receiver),
                    protocol_config: ProtocolConfig::test_new(),
                    buffer_config: BufferConfig::test_new(),
                    partner_oracle_config: PartnerOracleConfig::default(),
                    base_oracle_config,
                },
            }
            .data(),
        };

        // Build the transaction with both payer and guardian as signers
        let tx = Transaction::new(
            &[&payer, &guardian],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );

        // Send the transaction and expect failure
        let result = svm.send_transaction(tx);
        assert!(result.is_err());
    }

    #[test]
    fn test_initialize_base_oracle_threshold_gt_signer_count_fails() {
        let (mut svm, payer, guardian, _bridge_pda, accounts) = setup_env();
        let payer_pk = payer.pubkey();

        // Build the Initialize instruction with threshold > signer_count
        let gas_fee_receiver = Pubkey::new_unique();
        let mut base_oracle_config = BaseOracleConfig::test_new();
        base_oracle_config.threshold = base_oracle_config.signer_count + 1; // 2 > 1

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: Initialize {
                cfg: Config {
                    eip1559_config: Eip1559Config::test_new(),
                    gas_config: GasConfig::test_new(gas_fee_receiver),
                    protocol_config: ProtocolConfig::test_new(),
                    buffer_config: BufferConfig::test_new(),
                    partner_oracle_config: PartnerOracleConfig::default(),
                    base_oracle_config,
                },
            }
            .data(),
        };

        // Build the transaction with both payer and guardian as signers
        let tx = Transaction::new(
            &[&payer, &guardian],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );

        // Send the transaction and expect failure
        let result = svm.send_transaction(tx);
        assert!(result.is_err());
    }

    #[test]
    fn test_initialize_base_oracle_signer_count_exceeds_array_len_fails() {
        let (mut svm, payer, guardian, _bridge_pda, accounts) = setup_env();
        let payer_pk = payer.pubkey();

        // Build the Initialize instruction with signer_count > signers.len()
        let gas_fee_receiver = Pubkey::new_unique();
        let mut base_oracle_config = BaseOracleConfig::test_new();
        base_oracle_config.signer_count = (base_oracle_config.signers.len() + 1) as u8; // exceed fixed array length
        base_oracle_config.threshold = 1; // keep valid threshold

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: Initialize {
                cfg: Config {
                    eip1559_config: Eip1559Config::test_new(),
                    gas_config: GasConfig::test_new(gas_fee_receiver),
                    protocol_config: ProtocolConfig::test_new(),
                    buffer_config: BufferConfig::test_new(),
                    partner_oracle_config: PartnerOracleConfig::default(),
                    base_oracle_config,
                },
            }
            .data(),
        };

        // Build the transaction with both payer and guardian as signers
        let tx = Transaction::new(
            &[&payer, &guardian],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );

        // Send the transaction and expect failure
        let result = svm.send_transaction(tx);
        assert!(result.is_err());
    }

    #[test]
    fn test_initialize_base_oracle_duplicate_signers_fails() {
        let (mut svm, payer, guardian, _bridge_pda, accounts) = setup_env();
        let payer_pk = payer.pubkey();

        // Build the Initialize instruction with duplicate signer addresses among the provided entries
        let gas_fee_receiver = Pubkey::new_unique();
        let mut base_oracle_config = BaseOracleConfig::test_new();
        base_oracle_config.signer_count = 2; // consider first two entries
        base_oracle_config.threshold = 1; // keep valid threshold

        // Force a duplicate among the first `signer_count` addresses
        base_oracle_config.signers[1] = base_oracle_config.signers[0];

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: Initialize {
                cfg: Config {
                    eip1559_config: Eip1559Config::test_new(),
                    gas_config: GasConfig::test_new(gas_fee_receiver),
                    protocol_config: ProtocolConfig::test_new(),
                    buffer_config: BufferConfig::test_new(),
                    partner_oracle_config: PartnerOracleConfig::default(),
                    base_oracle_config,
                },
            }
            .data(),
        };

        // Build the transaction with both payer and guardian as signers
        let tx = Transaction::new(
            &[&payer, &guardian],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );

        // Send the transaction and expect failure due to duplicate signer detection
        let result = svm.send_transaction(tx);
        assert!(result.is_err());
    }
}
