use anchor_lang::prelude::*;

use crate::{instructions::SetConfig, internal::Eip1559Config};

pub fn set_eip1559_config_handler(
    ctx: Context<SetConfig>,
    eip1559_config: Eip1559Config,
) -> Result<()> {
    ctx.accounts.cfg.eip1559.config = eip1559_config;
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
    fn test_set_eip1559_config_with_guardian_succeeds() {
        let SetupRelayerResult {
            mut svm,
            payer,
            guardian,
            cfg_pda,
        } = setup_relayer();

        // Create new config with different values
        let new_config = Eip1559Config {
            target: 10_000_000,
            denominator: 4,
            window_duration_seconds: 10,
            minimum_base_fee: 5,
        };

        let accounts = accounts::SetConfig {
            cfg: cfg_pda,
            guardian: guardian.pubkey(),
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::SetEip1559Config {
                eip1559_config: new_config.clone(),
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&payer, &guardian],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx)
            .expect("Guardian should be able to update eip1559 config");

        // Verify the config was updated
        let cfg_account = svm.get_account(&cfg_pda).unwrap();
        let cfg = Cfg::try_deserialize(&mut &cfg_account.data[..]).unwrap();
        assert_eq!(cfg.eip1559.config, new_config);
    }

    #[test]
    fn test_set_eip1559_config_with_non_guardian_fails() {
        let SetupRelayerResult {
            mut svm,
            payer,
            guardian: _,
            cfg_pda,
        } = setup_relayer();

        // Create a fake guardian (not the real one)
        let fake_guardian = solana_keypair::Keypair::new();
        svm.airdrop(&fake_guardian.pubkey(), 1_000_000_000).unwrap();

        let new_config = Eip1559Config {
            target: 10_000_000,
            denominator: 4,
            window_duration_seconds: 10,
            minimum_base_fee: 5,
        };

        let accounts = accounts::SetConfig {
            cfg: cfg_pda,
            guardian: fake_guardian.pubkey(),
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::SetEip1559Config {
                eip1559_config: new_config,
            }
            .data(),
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
