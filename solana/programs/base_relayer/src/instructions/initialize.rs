use anchor_lang::prelude::*;

use crate::{
    constants::{CFG_SEED, DISCRIMINATOR_LEN},
    internal::{Eip1559, Eip1559Config, GasConfig},
    program::BaseRelayer as BaseRelayerProgram,
    Cfg, RelayerError,
};

/// Accounts for the initialize instruction that sets up the base relayer's initial state.
/// This instruction creates the main config account for the relayer program.
/// Only the upgrade authority can initialize the relayer for security.
#[derive(Accounts)]
pub struct Initialize<'info> {
    /// The upgrade authority that is authorized to initialize the relayer.
    /// This ensures only the program deployer can set the initial configuration.
    pub upgrade_authority: Signer<'info>,

    /// The account that pays for the transaction and config account creation.
    /// Must be mutable to deduct lamports for account rent.
    /// Can be different from the upgrade_authority.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The relayer config state account that tracks fee parameters.
    /// - Uses PDA with CFG_SEED for deterministic address
    /// - Payer funds the account creation
    /// - Space allocated for config state (DISCRIMINATOR_LEN + Cfg::INIT_SPACE)
    #[account(init, payer = payer, seeds = [CFG_SEED], bump, space = DISCRIMINATOR_LEN + Cfg::INIT_SPACE)]
    pub cfg: Account<'info, Cfg>,

    /// Program data account containing the upgrade authority.
    /// Validates that the signer is indeed the upgrade authority.
    #[account(
        constraint = program_data.upgrade_authority_address == Some(upgrade_authority.key())
            @ RelayerError::UnauthorizedInitialization
    )]
    pub program_data: Account<'info, ProgramData>,

    /// The base_relayer program itself.
    /// Validates that program_data is the correct ProgramData account for this program.
    #[account(
        constraint = program.programdata_address()? == Some(program_data.key())
            @ RelayerError::IncorrectRelayerProgram
    )]
    pub program: Program<'info, BaseRelayerProgram>,

    /// System program required for creating new accounts.
    /// Used internally by Anchor for account initialization.
    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(
    ctx: Context<Initialize>,
    guardian: Pubkey,
    eip1559_config: Eip1559Config,
    gas_config: GasConfig,
) -> Result<()> {
    let current_timestamp = Clock::get()?.unix_timestamp;
    let minimum_base_fee = eip1559_config.minimum_base_fee;

    *ctx.accounts.cfg = Cfg {
        guardian,
        eip1559: Eip1559 {
            config: eip1559_config,
            current_base_fee: minimum_base_fee,
            current_window_gas_used: 0,
            window_start_time: current_timestamp,
        },
        gas_config,
        nonce: 0,
    };

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::{
        solana_program::{instruction::Instruction, system_program},
        InstructionData,
    };
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    use crate::{accounts, instruction, internal::Eip1559Config, test_utils::*, Cfg, ID};

    const TEST_TIMESTAMP: i64 = 1747440000; // May 16th, 2025

    #[test]
    fn test_initialize_handler() {
        let DeployRelayerResult {
            mut svm,
            payer,
            guardian,
            cfg_pda,
            program_data_pda,
        } = deploy_relayer();
        let payer_pk = payer.pubkey();
        let guardian_pk = guardian.pubkey();

        // Ensure clock is mocked
        mock_clock(&mut svm, TEST_TIMESTAMP);

        // Build the Initialize instruction
        let accounts = accounts::Initialize {
            upgrade_authority: payer_pk,
            payer: payer_pk,
            cfg: cfg_pda,
            program_data: program_data_pda,
            program: ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let gas_fee_receiver = Pubkey::new_unique();
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::Initialize {
                new_guardian: guardian_pk,
                eip1559_config: Eip1559Config::test_new(),
                gas_config: GasConfig::test_new(gas_fee_receiver),
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&payer],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx)
            .expect("Failed to send transaction");

        // Assert the Cfg account state is correctly initialized
        let cfg_account = svm.get_account(&cfg_pda).unwrap();
        assert_eq!(cfg_account.owner, ID);
        let cfg = Cfg::try_deserialize(&mut &cfg_account.data[..]).unwrap();

        // Verify all fields
        assert_eq!(cfg.guardian, guardian_pk);
        assert_eq!(cfg.nonce, 0);
        assert_eq!(cfg.eip1559.config, Eip1559Config::test_new());
        assert_eq!(cfg.eip1559.current_base_fee, 1); // minimum_base_fee from test config
        assert_eq!(cfg.eip1559.current_window_gas_used, 0);
        assert_eq!(cfg.eip1559.window_start_time, TEST_TIMESTAMP);
        assert_eq!(cfg.gas_config, GasConfig::test_new(gas_fee_receiver));
    }

    #[test]
    fn test_initialize_unauthorized_caller_fails() {
        let DeployRelayerResult {
            mut svm,
            guardian,
            cfg_pda,
            program_data_pda,
            ..
        } = deploy_relayer();
        let guardian_pk = guardian.pubkey();

        // Create an unauthorized user (not the upgrade authority)
        let unauthorized = solana_keypair::Keypair::new();
        svm.airdrop(&unauthorized.pubkey(), 10_000_000_000)
            .expect("Failed to airdrop to unauthorized user");

        // Build the Initialize instruction accounts with unauthorized user
        let accounts = accounts::Initialize {
            upgrade_authority: unauthorized.pubkey(), // Wrong upgrade authority
            payer: unauthorized.pubkey(),
            cfg: cfg_pda,
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
            data: instruction::Initialize {
                new_guardian: guardian_pk,
                eip1559_config: Eip1559Config::test_new(),
                gas_config: GasConfig::test_new(gas_fee_receiver),
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
            error_string.contains("UnauthorizedInitialization") || error_string.contains("6000"), // Error code for UnauthorizedInitialization
            "Expected UnauthorizedInitialization error, got: {}",
            error_string
        );
    }
}
