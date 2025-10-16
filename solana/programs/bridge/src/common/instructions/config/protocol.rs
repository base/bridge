use anchor_lang::prelude::*;

use crate::common::SetBridgeConfigFromGuardian;

/// Set the block interval requirement
pub fn set_block_interval_requirement_handler(
    ctx: Context<SetBridgeConfigFromGuardian>,
    new_interval: u64,
) -> Result<()> {
    ctx.accounts
        .bridge
        .protocol_config
        .block_interval_requirement = new_interval;

    ctx.accounts.bridge.protocol_config.validate()?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use anchor_lang::{solana_program::instruction::Instruction, InstructionData};
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    use crate::{
        accounts,
        common::bridge::Bridge,
        instruction::SetBlockIntervalRequirement as SetBlockIntervalRequirementIx,
        test_utils::{setup_bridge, SetupBridgeResult},
        ID,
    };

    #[test]
    fn test_set_block_interval_requirement_success() {
        let SetupBridgeResult {
            mut svm,
            guardian,
            bridge_pda,
            ..
        } = setup_bridge();

        // New block interval requirement
        let new_interval = 600u64;

        // Build the instruction accounts
        let accounts = accounts::SetBridgeConfigFromGuardian {
            bridge: bridge_pda,
            guardian: guardian.pubkey(),
        }
        .to_account_metas(None);

        // Build the instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: SetBlockIntervalRequirementIx { new_interval }.data(),
        };

        // Build and send the transaction
        let tx = Transaction::new(
            &[&guardian],
            Message::new(&[ix], Some(&guardian.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx)
            .expect("Failed to send set_block_interval_requirement transaction");

        // Verify the block interval requirement was updated
        let bridge_account = svm.get_account(&bridge_pda).unwrap();
        let bridge_data = Bridge::try_deserialize(&mut &bridge_account.data[..]).unwrap();

        assert_eq!(
            bridge_data.protocol_config.block_interval_requirement, new_interval,
            "Block interval requirement should be updated to {}",
            new_interval
        );
    }

    #[test]
    fn test_set_block_interval_requirement_unauthorized() {
        let SetupBridgeResult {
            mut svm,
            bridge_pda,
            ..
        } = setup_bridge();

        // Create a fake guardian (unauthorized)
        let fake_guardian = solana_keypair::Keypair::new();
        svm.airdrop(&fake_guardian.pubkey(), 1_000_000_000).unwrap();

        // New block interval requirement
        let new_interval = 600u64;

        // Build the instruction accounts with fake guardian
        let accounts = accounts::SetBridgeConfigFromGuardian {
            bridge: bridge_pda,
            guardian: fake_guardian.pubkey(), // Wrong guardian
        }
        .to_account_metas(None);

        // Build the instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: SetBlockIntervalRequirementIx { new_interval }.data(),
        };

        // Build and send the transaction with fake guardian
        let tx = Transaction::new(
            &[&fake_guardian],
            Message::new(&[ix], Some(&fake_guardian.pubkey())),
            svm.latest_blockhash(),
        );

        // Send the transaction - should fail
        let result = svm.send_transaction(tx);
        assert!(
            result.is_err(),
            "Expected transaction to fail with unauthorized guardian"
        );

        // Check that the error contains the expected error message
        let error_string = format!("{:?}", result.unwrap_err());
        assert!(
            error_string.contains("UnauthorizedConfigUpdate"),
            "Expected UnauthorizedConfigUpdate error, got: {}",
            error_string
        );
    }
}
