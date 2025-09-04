use anchor_lang::prelude::*;

use crate::state::Cfg;

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct GasConfig {
    /// Maximum gas limit per cross-chain message
    pub max_gas_limit_per_message: u64,
    /// Scaling factor for gas cost calculations
    pub gas_cost_scaler: u64,
    /// Decimal precision for gas cost calculations
    pub gas_cost_scaler_dp: u64,
    /// Account that receives gas fees
    pub gas_fee_receiver: Pubkey,
}

pub fn check_and_pay_for_gas<'info>(
    system_program: &Program<'info, System>,
    payer: &Signer<'info>,
    gas_fee_receiver: &AccountInfo<'info>,
    cfg: &mut Cfg,
    gas_limit: u64,
) -> Result<()> {
    check_gas_limit(gas_limit, cfg)?;
    pay_for_gas(system_program, payer, gas_fee_receiver, cfg, gas_limit)
}

fn check_gas_limit(gas_limit: u64, cfg: &Cfg) -> Result<()> {
    require!(
        gas_limit <= cfg.gas_config.max_gas_limit_per_message,
        GasConfigError::GasLimitExceeded
    );

    Ok(())
}

fn pay_for_gas<'info>(
    system_program: &Program<'info, System>,
    payer: &Signer<'info>,
    gas_fee_receiver: &AccountInfo<'info>,
    cfg: &mut Cfg,
    gas_limit: u64,
) -> Result<()> {
    // Get the base fee for the current window
    let current_timestamp = Clock::get()?.unix_timestamp;
    let base_fee = cfg.eip1559.refresh_base_fee(current_timestamp);

    // Record gas usage for this transaction
    cfg.eip1559.add_gas_usage(gas_limit);

    let gas_cost =
        gas_limit * base_fee * cfg.gas_config.gas_cost_scaler / cfg.gas_config.gas_cost_scaler_dp;

    let cpi_ctx = CpiContext::new(
        system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: payer.to_account_info(),
            to: gas_fee_receiver.to_account_info(),
        },
    );

    anchor_lang::system_program::transfer(cpi_ctx, gas_cost)?;

    Ok(())
}

#[error_code]
pub enum GasConfigError {
    #[msg("Gas limit exceeded")]
    GasLimitExceeded,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::internal::{Eip1559, Eip1559Config};
    use crate::state::Cfg;
    use crate::test_utils::{mock_clock, setup_program_and_svm, TEST_GAS_FEE_RECEIVER};
    use crate::{accounts, instruction};
    use anchor_lang::solana_program::{instruction::Instruction, system_program};
    use anchor_lang::InstructionData;
    use solana_keypair::Keypair;
    use solana_message::Message;
    use solana_signer::Signer as _;
    use solana_transaction::Transaction;

    fn fetch_cfg(svm: &litesvm::LiteSVM, cfg_pk: &Pubkey) -> Cfg {
        let account = svm.get_account(cfg_pk).unwrap();
        Cfg::try_deserialize(&mut &account.data[..]).unwrap()
    }

    fn new_eip() -> Eip1559 {
        Eip1559 {
            config: Eip1559Config::test_new(),
            current_base_fee: 100,
            current_window_gas_used: 0,
            window_start_time: 0,
        }
    }

    #[test]
    fn check_gas_limit_allows_equal_limit() {
        let mut cfg = Cfg {
            guardian: Pubkey::new_unique(),
            eip1559: new_eip(),
            gas_config: GasConfig::test_new(TEST_GAS_FEE_RECEIVER),
            nonce: 0,
        };
        cfg.gas_config.max_gas_limit_per_message = 100;

        let res = super::check_gas_limit(100, &cfg);
        assert!(res.is_ok());
    }

    #[test]
    fn check_gas_limit_errors_above_limit() {
        let mut cfg = Cfg {
            guardian: Pubkey::new_unique(),
            eip1559: new_eip(),
            gas_config: GasConfig::test_new(TEST_GAS_FEE_RECEIVER),
            nonce: 0,
        };
        cfg.gas_config.max_gas_limit_per_message = 100;

        let res = super::check_gas_limit(101, &cfg);
        assert!(res.is_err());
    }

    #[test]
    fn check_and_pay_transfers_scaled_amount() {
        let (mut svm, payer, guardian, cfg_pda) = setup_program_and_svm();
        let payer_pk = payer.pubkey();

        // Ensure receiver exists for transfer
        svm.airdrop(&TEST_GAS_FEE_RECEIVER, 1).unwrap();
        let initial_receiver_balance = svm.get_account(&TEST_GAS_FEE_RECEIVER).unwrap().lamports;

        // Double the gas cost via scaler/decimal
        let original = fetch_cfg(&svm, &cfg_pda);
        let mut new_gas = original.gas_config.clone();
        new_gas.gas_cost_scaler = 2;
        new_gas.gas_cost_scaler_dp = 1;

        let accounts = accounts::SetConfig {
            cfg: cfg_pda,
            guardian: guardian.pubkey(),
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: crate::ID,
            accounts,
            data: instruction::SetGasConfig {
                gas_config: new_gas,
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&payer, &guardian],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );
        svm.send_transaction(tx).unwrap();

        // Now pay for relay with gas_limit=123; base_fee=1 => transfer=246
        let message_to_relay = Keypair::new();
        let accounts = accounts::PayForRelay {
            payer: payer_pk,
            cfg: cfg_pda,
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            message_to_relay: message_to_relay.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let gas_limit = 123u64;
        let ix = Instruction {
            program_id: crate::ID,
            accounts,
            data: crate::instruction::PayForRelay {
                outgoing_message: Pubkey::new_unique(),
                gas_limit,
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&payer, &message_to_relay],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );
        svm.send_transaction(tx).unwrap();

        let final_receiver_balance = svm.get_account(&TEST_GAS_FEE_RECEIVER).unwrap().lamports;
        assert_eq!(final_receiver_balance - initial_receiver_balance, 246);
    }

    #[test]
    fn check_and_pay_uses_refreshed_base_fee_after_window_expiry() {
        let (mut svm, payer, guardian, cfg_pda) = setup_program_and_svm();
        let payer_pk = payer.pubkey();

        // Ensure receiver exists
        svm.airdrop(&TEST_GAS_FEE_RECEIVER, 1).unwrap();
        let initial_receiver_balance = svm.get_account(&TEST_GAS_FEE_RECEIVER).unwrap().lamports;

        // Configure EIP-1559 so that after one expired window base_fee halves from 100 -> 50
        let original = fetch_cfg(&svm, &cfg_pda);
        let start_time = original.eip1559.window_start_time;
        let new_eip = crate::internal::Eip1559Config {
            target: 5_000_000,
            denominator: 2,
            window_duration_seconds: 1,
            minimum_base_fee: 1,
        };

        let mut new_gas = original.gas_config.clone();
        new_gas.gas_cost_scaler = 1;
        new_gas.gas_cost_scaler_dp = 1;

        let accounts = accounts::SetConfig {
            cfg: cfg_pda,
            guardian: guardian.pubkey(),
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: crate::ID,
            accounts: accounts.clone(),
            data: instruction::SetGasConfig {
                gas_config: new_gas,
            }
            .data(),
        };
        let new_eip_ix = Instruction {
            program_id: crate::ID,
            accounts,
            data: instruction::SetEip1559Config {
                eip1559_config: new_eip,
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&payer, &guardian],
            Message::new(&[ix, new_eip_ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );
        svm.send_transaction(tx).unwrap();

        // Advance clock by one window so refresh_base_fee applies 100 -> 50
        mock_clock(&mut svm, start_time + 1);

        let gas_limit = 1_000u64;
        let message_to_relay = Keypair::new();
        let accounts = accounts::PayForRelay {
            payer: payer_pk,
            cfg: cfg_pda,
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            message_to_relay: message_to_relay.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: crate::ID,
            accounts,
            data: crate::instruction::PayForRelay {
                outgoing_message: Pubkey::new_unique(),
                gas_limit,
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&payer, &message_to_relay],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );
        svm.send_transaction(tx).unwrap();

        let final_receiver_balance = svm.get_account(&TEST_GAS_FEE_RECEIVER).unwrap().lamports;
        // base_fee 1 * gas_limit 1000 = 1_000
        assert_eq!(final_receiver_balance - initial_receiver_balance, 1_000);

        // Validate EIP-1559 state was updated for the new window and usage accounted
        let updated = fetch_cfg(&svm, &cfg_pda);
        assert_eq!(updated.eip1559.current_base_fee, 1);
        assert_eq!(updated.eip1559.current_window_gas_used, gas_limit);
        assert_eq!(updated.eip1559.window_start_time, start_time + 1);
    }
}
