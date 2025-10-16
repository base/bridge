use anchor_lang::prelude::*;

use crate::instructions::SetConfig;

pub fn set_guardian_handler(ctx: Context<SetConfig>, guardian: Pubkey) -> Result<()> {
    ctx.accounts.cfg.guardian = guardian;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::{solana_program::instruction::Instruction, InstructionData, ToAccountMetas};
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    use crate::{accounts, instruction, test_utils::*, Cfg, ID};

    #[test]
    fn test_set_guardian_with_current_guardian_succeeds() {
        let SetupRelayerResult {
            mut svm,
            payer,
            guardian,
            cfg_pda,
        } = setup_relayer();

        // Create a new guardian
        let new_guardian = Pubkey::new_unique();

        let accounts = accounts::SetConfig {
            cfg: cfg_pda,
            guardian: guardian.pubkey(),
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::SetGuardian { new_guardian }.data(),
        };

        let tx = Transaction::new(
            &[&payer, &guardian],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx)
            .expect("Current guardian should be able to update guardian");

        // Verify the guardian was updated
        let cfg_account = svm.get_account(&cfg_pda).unwrap();
        let cfg = Cfg::try_deserialize(&mut &cfg_account.data[..]).unwrap();
        assert_eq!(cfg.guardian, new_guardian);
    }

    #[test]
    fn test_set_guardian_with_non_guardian_fails() {
        let SetupRelayerResult {
            mut svm,
            payer,
            guardian: _,
            cfg_pda,
        } = setup_relayer();

        // Create a fake guardian (not the real one)
        let fake_guardian = solana_keypair::Keypair::new();
        svm.airdrop(&fake_guardian.pubkey(), 1_000_000_000).unwrap();

        let new_guardian = Pubkey::new_unique();

        let accounts = accounts::SetConfig {
            cfg: cfg_pda,
            guardian: fake_guardian.pubkey(),
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::SetGuardian { new_guardian }.data(),
        };

        let tx = Transaction::new(
            &[&payer, &fake_guardian],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        let result = svm.send_transaction(tx);
        assert!(result.is_err());

        // Verify it's the correct error
        let error_string = format!("{:?}", result.unwrap_err());
        assert!(error_string.contains("UnauthorizedConfigUpdate"));
    }
}
