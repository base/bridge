use anchor_lang::prelude::*;

use crate::{
    common::{
        bridge::{Bridge, Eip1559},
        Config, BRIDGE_SEED, DISCRIMINATOR_LEN,
    },
    program::Bridge as BridgeProgram,
    BridgeError,
};

/// Accounts for the initialize instruction that sets up the bridge program's initial state.
/// This instruction creates the main bridge account for cross-chain operations between Base and
/// Solana, using the provided configuration values and initializing counters/state to zero.
/// Only the upgrade authority can initialize the bridge for security.
#[derive(Accounts)]
pub struct Initialize<'info> {
    /// The upgrade authority that is authorized to initialize the bridge.
    /// This ensures only the program deployer can set the initial configuration.
    pub upgrade_authority: Signer<'info>,

    /// The account that pays for the transaction and bridge account creation.
    /// Must be mutable to deduct lamports for account rent.
    /// Can be different from the upgrade_authority.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The bridge state account being initialized.
    /// - Uses PDA with BRIDGE_SEED for deterministic address
    /// - Payer funds the account creation
    /// - Space allocated for bridge state (DISCRIMINATOR_LEN + Bridge::INIT_SPACE)
    #[account(
        init,
        payer = payer,
        seeds = [BRIDGE_SEED],
        bump,
        space = DISCRIMINATOR_LEN + Bridge::INIT_SPACE
    )]
    pub bridge: Account<'info, Bridge>,

    /// Program data account containing the upgrade authority.
    /// Validates that the signer is indeed the upgrade authority.
    #[account(
        constraint = program_data.upgrade_authority_address == Some(upgrade_authority.key())
            @ BridgeError::UnauthorizedInitialization
    )]
    pub program_data: Account<'info, ProgramData>,

    /// The bridge program itself.
    /// Validates that program_data is the correct ProgramData account for this program.
    #[account(
        constraint = program.programdata_address()? == Some(program_data.key())
            @ BridgeError::IncorrectBridgeProgram
    )]
    pub program: Program<'info, BridgeProgram>,

    /// System program required for creating new accounts.
    /// Used internally by Anchor for account initialization.
    pub system_program: Program<'info, System>,
}

/// Initializes the `Bridge` state account with the provided configs, sets the guardian,
/// starts unpaused, zeros counters, sets the EIP-1559 base fee to `eip1559_config.minimum_base_fee`,
/// and records the current timestamp as the window start.
pub fn initialize_handler(ctx: Context<Initialize>, guardian: Pubkey, cfg: Config) -> Result<()> {
    let current_timestamp = Clock::get()?.unix_timestamp;
    let minimum_base_fee = cfg.eip1559_config.minimum_base_fee;

    cfg.validate()?;

    *ctx.accounts.bridge = Bridge {
        base_block_number: 0,
        nonce: 0,
        guardian,
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
        solana_program::{example_mocks::solana_sdk::system_program, instruction::Instruction},
        InstructionData,
    };
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
        test_utils::{deploy_bridge, mock_clock, DeployBridgeResult},
        ID,
    };

    const TEST_TIMESTAMP: i64 = 1747440000; // May 16th, 2025

    #[test]
    fn test_initialize_handler() {
        let DeployBridgeResult {
            mut svm,
            payer,
            guardian,
            bridge_pda,
            program_data_pda,
        } = deploy_bridge();
        let payer_pk = payer.pubkey();
        let guardian_pk = guardian.pubkey();

        // Mock the clock to ensure we get a proper timestamp
        mock_clock(&mut svm, TEST_TIMESTAMP);

        // Build the Initialize instruction accounts
        let accounts = accounts::Initialize {
            upgrade_authority: payer_pk,
            payer: payer_pk,
            bridge: bridge_pda,
            program_data: program_data_pda,
            program: ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the Initialize instruction
        let gas_fee_receiver = Pubkey::new_unique();
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: Initialize {
                guardian: guardian_pk,
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

        // Build the transaction with payer as upgrade authority
        let tx = Transaction::new(
            &[&payer],
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
        let DeployBridgeResult {
            mut svm,
            payer,
            guardian,
            bridge_pda,
            program_data_pda,
        } = deploy_bridge();
        let payer_pk = payer.pubkey();
        let guardian_pk = guardian.pubkey();

        // Build the Initialize instruction accounts
        let accounts = accounts::Initialize {
            upgrade_authority: payer_pk,
            payer: payer_pk,
            bridge: bridge_pda,
            program_data: program_data_pda,
            program: ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the Initialize instruction with an invalid partner threshold (> 5)
        let gas_fee_receiver = Pubkey::new_unique();
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: Initialize {
                guardian: guardian_pk,
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

        // Build the transaction with payer as upgrade authority
        let tx = Transaction::new(
            &[&payer],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );

        // Send the transaction and expect failure
        let result = svm.send_transaction(tx);
        assert!(result.is_err());
    }

    #[test]
    fn test_initialize_base_oracle_threshold_zero_fails() {
        let DeployBridgeResult {
            mut svm,
            payer,
            guardian,
            bridge_pda,
            program_data_pda,
        } = deploy_bridge();
        let payer_pk = payer.pubkey();
        let guardian_pk = guardian.pubkey();

        // Build the Initialize instruction accounts
        let accounts = accounts::Initialize {
            upgrade_authority: payer_pk,
            payer: payer_pk,
            bridge: bridge_pda,
            program_data: program_data_pda,
            program: ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the Initialize instruction with an invalid base oracle threshold (== 0)
        let gas_fee_receiver = Pubkey::new_unique();
        let mut base_oracle_config = BaseOracleConfig::test_new();
        base_oracle_config.threshold = 0;

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: Initialize {
                guardian: guardian_pk,
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

        // Build the transaction with payer as upgrade authority
        let tx = Transaction::new(
            &[&payer],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );

        // Send the transaction and expect failure
        let result = svm.send_transaction(tx);
        assert!(result.is_err());
    }

    #[test]
    fn test_initialize_base_oracle_threshold_gt_signer_count_fails() {
        let DeployBridgeResult {
            mut svm,
            payer,
            guardian,
            bridge_pda,
            program_data_pda,
        } = deploy_bridge();
        let payer_pk = payer.pubkey();
        let guardian_pk = guardian.pubkey();

        // Build the Initialize instruction accounts
        let accounts = accounts::Initialize {
            upgrade_authority: payer_pk,
            payer: payer_pk,
            bridge: bridge_pda,
            program_data: program_data_pda,
            program: ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the Initialize instruction with threshold > signer_count
        let gas_fee_receiver = Pubkey::new_unique();
        let mut base_oracle_config = BaseOracleConfig::test_new();
        base_oracle_config.threshold = base_oracle_config.signer_count + 1; // 2 > 1

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: Initialize {
                guardian: guardian_pk,
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

        // Build the transaction with payer as upgrade authority
        let tx = Transaction::new(
            &[&payer],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );

        // Send the transaction and expect failure
        let result = svm.send_transaction(tx);
        assert!(result.is_err());
    }

    #[test]
    fn test_initialize_base_oracle_signer_count_exceeds_array_len_fails() {
        let DeployBridgeResult {
            mut svm,
            payer,
            guardian,
            bridge_pda,
            program_data_pda,
        } = deploy_bridge();
        let payer_pk = payer.pubkey();
        let guardian_pk = guardian.pubkey();

        // Build the Initialize instruction accounts
        let accounts = accounts::Initialize {
            upgrade_authority: payer_pk,
            payer: payer_pk,
            bridge: bridge_pda,
            program_data: program_data_pda,
            program: ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the Initialize instruction with signer_count > signers.len()
        let gas_fee_receiver = Pubkey::new_unique();
        let mut base_oracle_config = BaseOracleConfig::test_new();
        base_oracle_config.signer_count = (base_oracle_config.signers.len() + 1) as u8; // exceed fixed array length
        base_oracle_config.threshold = 1; // keep valid threshold

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: Initialize {
                guardian: guardian_pk,
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

        // Build the transaction with payer as upgrade authority
        let tx = Transaction::new(
            &[&payer],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );

        // Send the transaction and expect failure
        let result = svm.send_transaction(tx);
        assert!(result.is_err());
    }

    #[test]
    fn test_initialize_base_oracle_duplicate_signers_fails() {
        let DeployBridgeResult {
            mut svm,
            payer,
            guardian,
            bridge_pda,
            program_data_pda,
        } = deploy_bridge();
        let payer_pk = payer.pubkey();
        let guardian_pk = guardian.pubkey();

        // Build the Initialize instruction accounts
        let accounts = accounts::Initialize {
            upgrade_authority: payer_pk,
            payer: payer_pk,
            bridge: bridge_pda,
            program_data: program_data_pda,
            program: ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

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
                guardian: guardian_pk,
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

        // Build the transaction with payer as upgrade authority
        let tx = Transaction::new(
            &[&payer],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );

        // Send the transaction and expect failure due to duplicate signer detection
        let result = svm.send_transaction(tx);
        assert!(result.is_err());
    }

    #[test]
    fn test_initialize_unauthorized_caller_fails() {
        let DeployBridgeResult {
            mut svm,
            guardian,
            bridge_pda,
            program_data_pda,
            ..
        } = deploy_bridge();
        let guardian_pk = guardian.pubkey();

        // Create an unauthorized user (not the upgrade authority)
        let unauthorized = solana_keypair::Keypair::new();
        svm.airdrop(&unauthorized.pubkey(), 10_000_000_000)
            .expect("Failed to airdrop to unauthorized user");

        // Build the Initialize instruction accounts with unauthorized user
        let accounts = accounts::Initialize {
            upgrade_authority: unauthorized.pubkey(), // Wrong upgrade authority
            payer: unauthorized.pubkey(),
            bridge: bridge_pda,
            program_data: program_data_pda,
            program: ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the Initialize instruction
        let gas_fee_receiver = Pubkey::new_unique();
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: Initialize {
                guardian: guardian_pk,
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

        // Build the transaction with unauthorized user
        let tx = Transaction::new(
            &[&unauthorized],
            Message::new(&[ix], Some(&unauthorized.pubkey())),
            svm.latest_blockhash(),
        );

        // Send the transaction and expect failure with UnauthorizedInitialization error
        let result = svm.send_transaction(tx);
        assert!(
            result.is_err(),
            "Expected transaction to fail with unauthorized caller"
        );

        // Verify the error message contains "UnauthorizedInitialization"
        let error_string = format!("{:?}", result.unwrap_err());
        assert!(
            error_string.contains("UnauthorizedInitialization") || error_string.contains("7000"), // Error code for UnauthorizedInitialization
            "Expected UnauthorizedInitialization error, got: {}",
            error_string
        );
    }
}
