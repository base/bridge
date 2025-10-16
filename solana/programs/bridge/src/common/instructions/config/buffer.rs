use anchor_lang::prelude::*;

use crate::common::SetBridgeConfigFromGuardian;

/// Set the maximum call buffer size
pub fn set_max_call_buffer_size_handler(
    ctx: Context<SetBridgeConfigFromGuardian>,
    new_size: u64,
) -> Result<()> {
    ctx.accounts.bridge.buffer_config.max_call_buffer_size = new_size;

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
        instruction::SetMaxCallBufferSize as SetMaxCallBufferSizeIx,
        test_utils::{setup_bridge, SetupBridgeResult},
        ID,
    };

    #[test]
    fn test_set_max_call_buffer_size_success() {
        let SetupBridgeResult {
            mut svm,
            guardian,
            bridge_pda,
            ..
        } = setup_bridge();

        // New buffer size to set
        let new_size = 4096u64; // 4KB

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
            data: SetMaxCallBufferSizeIx { new_size }.data(),
        };

        // Build and send the transaction
        let tx = Transaction::new(
            &[&guardian],
            Message::new(&[ix], Some(&guardian.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx)
            .expect("Failed to send set_max_call_buffer_size transaction");

        // Verify the buffer size was updated
        let bridge_account = svm.get_account(&bridge_pda).unwrap();
        let bridge_data = Bridge::try_deserialize(&mut &bridge_account.data[..]).unwrap();

        assert_eq!(
            bridge_data.buffer_config.max_call_buffer_size, new_size,
            "Buffer size should be updated to {}",
            new_size
        );
    }

    #[test]
    fn test_set_max_call_buffer_size_unauthorized() {
        let SetupBridgeResult {
            mut svm,
            bridge_pda,
            ..
        } = setup_bridge();

        // Create a fake guardian (unauthorized)
        let fake_guardian = solana_keypair::Keypair::new();
        svm.airdrop(&fake_guardian.pubkey(), 1_000_000_000).unwrap();

        // New buffer size to set
        let new_size = 4096u64;

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
            data: SetMaxCallBufferSizeIx { new_size }.data(),
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
