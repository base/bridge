use anchor_lang::prelude::*;

use crate::common::{BaseOracleConfig, SetBridgeConfigFromUpgradeAuthority};

/// Set or update the oracle signer configuration.
///
/// Updates the `oracle_signers` account with a new approval `threshold` and a
/// new list of unique EVM signer addresses. This instruction is used to rotate
/// oracle keys or adjust the required threshold for output root attestations.
pub fn set_oracle_signers_handler(
    ctx: Context<SetBridgeConfigFromUpgradeAuthority>,
    cfg: BaseOracleConfig,
) -> Result<()> {
    cfg.validate()?;
    ctx.accounts.bridge.base_oracle_config = cfg;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::{
        solana_program::{bpf_loader_upgradeable, instruction::Instruction},
        InstructionData,
    };
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    use crate::{
        accounts, common::bridge::Bridge, instruction::SetOracleSigners, test_utils::*, ID,
        MAX_SIGNER_COUNT,
    };

    /// Helper to create a BaseOracleConfig for testing
    fn base_oracle_config(threshold: u8, signer_count: u8) -> BaseOracleConfig {
        let mut signers = [[0u8; 20]; MAX_SIGNER_COUNT as usize];
        for i in 0..signer_count {
            signers[i as usize] = [(i + 1); 20];
        }
        BaseOracleConfig {
            threshold,
            signer_count,
            signers,
        }
    }

    #[test]
    fn test_set_oracle_signers_with_upgrade_authority_succeeds() {
        let SetupBridgeResult {
            mut svm,
            payer,
            bridge_pda,
            ..
        } = setup_bridge();

        // Find the ProgramData account created by deploy_upgradeable_program
        let (program_data_pda, _) =
            Pubkey::find_program_address(&[ID.as_ref()], &bpf_loader_upgradeable::ID);

        // Build accounts - payer IS the upgrade authority
        let accounts = accounts::SetBridgeConfigFromUpgradeAuthority {
            upgrade_authority: payer.pubkey(),
            bridge: bridge_pda,
            program_data: program_data_pda,
            program: ID,
        }
        .to_account_metas(None);

        // New valid config with 2 signers and threshold 2
        let new_config = base_oracle_config(2, 2);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: SetOracleSigners { cfg: new_config }.data(),
        };

        let tx = Transaction::new(
            &[&payer],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        // Should succeed
        svm.send_transaction(tx)
            .expect("Transaction should succeed with upgrade authority");

        // Verify the config was updated
        let bridge_account = svm.get_account(&bridge_pda).unwrap();
        let bridge = Bridge::try_deserialize(&mut &bridge_account.data[..]).unwrap();
        assert_eq!(bridge.base_oracle_config.threshold, 2);
        assert_eq!(bridge.base_oracle_config.signer_count, 2);
    }

    #[test]
    fn test_set_oracle_signers_with_guardian_fails() {
        let SetupBridgeResult {
            mut svm,
            guardian,
            bridge_pda,
            ..
        } = setup_bridge();

        let (program_data_pda, _) =
            Pubkey::find_program_address(&[ID.as_ref()], &bpf_loader_upgradeable::ID);

        // Build accounts - trying with GUARDIAN instead of upgrade authority
        let accounts = accounts::SetBridgeConfigFromUpgradeAuthority {
            upgrade_authority: guardian.pubkey(),
            bridge: bridge_pda,
            program_data: program_data_pda,
            program: ID,
        }
        .to_account_metas(None);

        let new_config = base_oracle_config(2, 2);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: SetOracleSigners { cfg: new_config }.data(),
        };

        let tx = Transaction::new(
            &[&guardian],
            Message::new(&[ix], Some(&guardian.pubkey())),
            svm.latest_blockhash(),
        );

        // Should fail with UnauthorizedConfigUpdate
        let result = svm.send_transaction(tx);
        assert!(
            result.is_err(),
            "Expected transaction to fail when guardian tries to update config"
        );

        // Verify the specific error
        let error_string = format!("{:?}", result.unwrap_err());
        assert!(
            error_string.contains("UnauthorizedConfigUpdate"),
            "Expected UnauthorizedConfigUpdate error, got: {}",
            error_string
        );
    }

    #[test]
    fn test_set_oracle_signers_invalid_threshold_fails() {
        let SetupBridgeResult {
            mut svm,
            payer,
            bridge_pda,
            ..
        } = setup_bridge();

        let (program_data_pda, _) =
            Pubkey::find_program_address(&[ID.as_ref()], &bpf_loader_upgradeable::ID);

        let accounts = accounts::SetBridgeConfigFromUpgradeAuthority {
            upgrade_authority: payer.pubkey(),
            bridge: bridge_pda,
            program_data: program_data_pda,
            program: ID,
        }
        .to_account_metas(None);

        // Invalid config - threshold = 0
        let new_config = base_oracle_config(0, 2);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: SetOracleSigners { cfg: new_config }.data(),
        };

        let tx = Transaction::new(
            &[&payer],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        // Should fail with InvalidThreshold
        let result = svm.send_transaction(tx);
        assert!(
            result.is_err(),
            "Expected transaction to fail with invalid threshold"
        );

        // Verify the specific error
        let error_string = format!("{:?}", result.unwrap_err());
        assert!(
            error_string.contains("InvalidThreshold"),
            "Expected InvalidThreshold error, got: {}",
            error_string
        );
    }

    #[test]
    fn test_set_oracle_signers_duplicate_signer_fails() {
        let SetupBridgeResult {
            mut svm,
            payer,
            bridge_pda,
            ..
        } = setup_bridge();

        let (program_data_pda, _) =
            Pubkey::find_program_address(&[ID.as_ref()], &bpf_loader_upgradeable::ID);

        let accounts = accounts::SetBridgeConfigFromUpgradeAuthority {
            upgrade_authority: payer.pubkey(),
            bridge: bridge_pda,
            program_data: program_data_pda,
            program: ID,
        }
        .to_account_metas(None);

        // Invalid config - duplicate signers
        let mut signers = [[0u8; 20]; MAX_SIGNER_COUNT as usize];
        signers[0] = [1u8; 20];
        signers[1] = [1u8; 20]; // Same as signers[0]

        let new_config = BaseOracleConfig {
            threshold: 2,
            signer_count: 2,
            signers,
        };

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: SetOracleSigners { cfg: new_config }.data(),
        };

        let tx = Transaction::new(
            &[&payer],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        // Should fail with DuplicateSigner
        let result = svm.send_transaction(tx);
        assert!(
            result.is_err(),
            "Expected transaction to fail with duplicate signers"
        );

        // Verify the specific error
        let error_string = format!("{:?}", result.unwrap_err());
        assert!(
            error_string.contains("DuplicateSigner"),
            "Expected DuplicateSigner error, got: {}",
            error_string
        );
    }
}
