use anchor_lang::prelude::*;

use crate::common::{PartnerOracleConfig, SetBridgeConfigFromUpgradeAuthority};

/// Set or update the oracle signer configuration.
///
/// Updates the `oracle_signers` account with a new approval `threshold` and a
/// new list of unique EVM signer addresses. This instruction is used to rotate
/// oracle keys or adjust the required threshold for output root attestations.
pub fn set_partner_config_handler(
    ctx: Context<SetBridgeConfigFromUpgradeAuthority>,
    partner_cfg: PartnerOracleConfig,
) -> Result<()> {
    partner_cfg.validate()?;
    ctx.accounts.bridge.partner_oracle_config = partner_cfg;
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
        accounts, common::bridge::Bridge, instruction::SetPartnerOracleConfig, test_utils::*, ID,
    };

    #[test]
    fn test_set_partner_config_with_upgrade_authority_succeeds() {
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

        // New valid config
        let new_config = PartnerOracleConfig {
            required_threshold: 3,
        };

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: SetPartnerOracleConfig { new_config }.data(),
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
        assert_eq!(bridge.partner_oracle_config.required_threshold, 3);
    }

    #[test]
    fn test_set_partner_config_with_guardian_fails() {
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

        let new_config = PartnerOracleConfig {
            required_threshold: 3,
        };

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: SetPartnerOracleConfig { new_config }.data(),
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
    fn test_set_partner_config_threshold_too_high_fails() {
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

        // Invalid config - threshold too high (> MAX_PARTNER_VALIDATOR_THRESHOLD = 5)
        let new_config = PartnerOracleConfig {
            required_threshold: 6,
        };

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: SetPartnerOracleConfig { new_config }.data(),
        };

        let tx = Transaction::new(
            &[&payer],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        // Should fail with InvalidPartnerThreshold
        let result = svm.send_transaction(tx);
        assert!(
            result.is_err(),
            "Expected transaction to fail when threshold exceeds maximum"
        );

        // Verify the specific error
        let error_string = format!("{:?}", result.unwrap_err());
        assert!(
            error_string.contains("InvalidPartnerThreshold"),
            "Expected InvalidPartnerThreshold error, got: {}",
            error_string
        );
    }
}
