use anchor_lang::prelude::*;

use crate::common::config::SetBridgeConfigFromGuardian;

/// Transfer guardian authority to a new pubkey.
/// Only the current guardian can call this function.
///
/// Note: No additional validation is performed on `new_guardian` (it may be any pubkey).
pub fn transfer_guardian_handler(
    ctx: Context<SetBridgeConfigFromGuardian>,
    new_guardian: Pubkey,
) -> Result<()> {
    ctx.accounts.bridge.guardian = new_guardian;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use anchor_lang::{solana_program::instruction::Instruction, InstructionData};
    use solana_keypair::Keypair;
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    use crate::{
        accounts,
        common::bridge::Bridge,
        instruction::TransferGuardian as TransferGuardianIx,
        test_utils::{setup_bridge, SetupBridgeResult},
        ID,
    };

    #[test]
    fn test_transfer_guardian_success() {
        let SetupBridgeResult {
            mut svm,
            guardian,
            bridge_pda,
            ..
        } = setup_bridge();

        // Create a new guardian
        let new_guardian = Keypair::new();

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
            data: TransferGuardianIx {
                new_guardian: new_guardian.pubkey(),
            }
            .data(),
        };

        // Build and send the transaction
        let tx = Transaction::new(
            &[&guardian],
            Message::new(&[ix], Some(&guardian.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx)
            .expect("Failed to send transfer_guardian transaction");

        // Verify the guardian was updated
        let bridge_account = svm.get_account(&bridge_pda).unwrap();
        let bridge_data = Bridge::try_deserialize(&mut &bridge_account.data[..]).unwrap();

        assert_eq!(
            bridge_data.guardian,
            new_guardian.pubkey(),
            "Guardian should be updated to new guardian"
        );
    }

    #[test]
    fn test_transfer_guardian_unauthorized() {
        let SetupBridgeResult {
            mut svm,
            bridge_pda,
            ..
        } = setup_bridge();

        // Create a fake guardian (unauthorized)
        let fake_guardian = Keypair::new();
        svm.airdrop(&fake_guardian.pubkey(), 1_000_000_000).unwrap();

        // Create a new guardian to transfer to
        let new_guardian = Keypair::new();

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
            data: TransferGuardianIx {
                new_guardian: new_guardian.pubkey(),
            }
            .data(),
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
