use anchor_lang::prelude::*;

use crate::{constants::CFG_SEED, state::Cfg};

/// Accounts struct for configuration setter instructions
/// Only the guardian can update these parameters
#[derive(Accounts)]
pub struct SetConfig<'info> {
    /// The bridge account containing configuration
    #[account(
        mut,
        has_one = guardian @ ConfigError::UnauthorizedConfigUpdate,
        seeds = [CFG_SEED],
        bump
    )]
    pub cfg: Account<'info, Cfg>,

    /// The guardian account authorized to update configuration
    pub guardian: Signer<'info>,
}

pub fn set_config_handler(ctx: Context<SetConfig>, cfg: Cfg) -> Result<()> {
    ctx.accounts.cfg.guardian = cfg.guardian;
    ctx.accounts.cfg.eip1559 = cfg.eip1559;
    ctx.accounts.cfg.gas_config = cfg.gas_config;
    Ok(())
}

/// Error codes for configuration updates
#[error_code]
pub enum ConfigError {
    #[msg("Unauthorized to update configuration")]
    UnauthorizedConfigUpdate = 6000,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::internal::{Eip1559, Eip1559Config, GasConfig};
    use crate::test_utils::setup_program_and_svm;
    use crate::{accounts, instruction};
    use anchor_lang::solana_program::instruction::Instruction;
    use anchor_lang::InstructionData;
    use solana_keypair::Keypair;
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    fn fetch_cfg(svm: &litesvm::LiteSVM, cfg_pk: &Pubkey) -> Cfg {
        let account = svm.get_account(cfg_pk).unwrap();
        Cfg::try_deserialize(&mut &account.data[..]).unwrap()
    }

    #[test]
    fn updates_guardian_field() {
        let (mut svm, payer, guardian, cfg_pda) = setup_program_and_svm();

        let original = fetch_cfg(&svm, &cfg_pda);
        let new_guardian = Pubkey::new_unique();
        let new_cfg = Cfg {
            guardian: new_guardian,
            eip1559: original.eip1559.clone(),
            gas_config: original.gas_config.clone(),
        };

        let accounts = accounts::SetConfig {
            cfg: cfg_pda,
            guardian: guardian.pubkey(),
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: crate::ID,
            accounts,
            data: instruction::SetConfig { cfg: new_cfg }.data(),
        };

        let tx = Transaction::new(
            &[&payer, &guardian],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx).unwrap();

        let updated = fetch_cfg(&svm, &cfg_pda);
        assert_eq!(updated.guardian, new_guardian);
    }

    #[test]
    fn updates_eip1559_field() {
        let (mut svm, payer, guardian, cfg_pda) = setup_program_and_svm();
        let original = fetch_cfg(&svm, &cfg_pda);

        let new_eip1559 = Eip1559 {
            config: Eip1559Config {
                target: 7_000_000,
                denominator: 3,
                window_duration_seconds: 2,
                minimum_base_fee: 42,
            },
            current_base_fee: 42,
            current_window_gas_used: 0,
            window_start_time: 1,
        };

        let new_cfg = Cfg {
            guardian: original.guardian,
            eip1559: new_eip1559.clone(),
            gas_config: original.gas_config.clone(),
        };

        let accounts = accounts::SetConfig {
            cfg: cfg_pda,
            guardian: guardian.pubkey(),
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: crate::ID,
            accounts,
            data: instruction::SetConfig { cfg: new_cfg }.data(),
        };

        let tx = Transaction::new(
            &[&payer, &guardian],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );
        svm.send_transaction(tx).unwrap();

        let updated = fetch_cfg(&svm, &cfg_pda);
        assert_eq!(updated.eip1559, new_eip1559);
    }

    #[test]
    fn updates_gas_config_field() {
        let (mut svm, payer, guardian, cfg_pda) = setup_program_and_svm();
        let original = fetch_cfg(&svm, &cfg_pda);

        let new_receiver = Pubkey::new_unique();
        let mut new_gas: GasConfig = original.gas_config.clone();
        new_gas.gas_fee_receiver = new_receiver;

        let new_cfg = Cfg {
            guardian: original.guardian,
            eip1559: original.eip1559.clone(),
            gas_config: new_gas.clone(),
        };

        let accounts = accounts::SetConfig {
            cfg: cfg_pda,
            guardian: guardian.pubkey(),
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: crate::ID,
            accounts,
            data: instruction::SetConfig { cfg: new_cfg }.data(),
        };

        let tx = Transaction::new(
            &[&payer, &guardian],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );
        svm.send_transaction(tx).unwrap();

        let updated = fetch_cfg(&svm, &cfg_pda);
        assert_eq!(updated.gas_config, new_gas);
    }

    #[test]
    fn unauthorized_guardian_cannot_update() {
        let (mut svm, payer, _guardian, cfg_pda) = setup_program_and_svm();
        let original = fetch_cfg(&svm, &cfg_pda);

        let unauthorized = Keypair::new();
        let new_cfg = Cfg {
            guardian: Pubkey::new_unique(),
            eip1559: original.eip1559.clone(),
            gas_config: original.gas_config.clone(),
        };

        let accounts = accounts::SetConfig {
            cfg: cfg_pda,
            guardian: unauthorized.pubkey(),
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: crate::ID,
            accounts,
            data: instruction::SetConfig { cfg: new_cfg }.data(),
        };

        let tx = Transaction::new(
            &[&payer, &unauthorized],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        let res = svm.send_transaction(tx);
        assert!(res.is_err());
    }
}
