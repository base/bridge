use anchor_lang::prelude::*;

use crate::{
    constants::{CFG_SEED, MTR_SEED},
    state::{Cfg, MessageToRelay},
    RelayerError,
};

#[derive(Accounts)]
#[instruction(mtr_salt: [u8; 32])]
pub struct CloseMessageToRelay<'info> {
    #[account(
        seeds = [CFG_SEED],
        bump,
        has_one = guardian @ RelayerError::UnauthorizedConfigUpdate
    )]
    pub cfg: Account<'info, Cfg>,

    pub guardian: Signer<'info>,

    #[account(
        mut,
        close = recipient,
        seeds = [MTR_SEED, mtr_salt.as_ref()],
        bump
    )]
    pub message_to_relay: Account<'info, MessageToRelay>,

    /// CHECK: Any recipient is allowed; guardian authorizes this close.
    #[account(mut)]
    pub recipient: AccountInfo<'info>,
}

pub fn close_message_to_relay_handler(
    _ctx: Context<CloseMessageToRelay>,
    _mtr_salt: [u8; 32],
) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::{setup_relayer, SetupRelayerResult, TEST_GAS_FEE_RECEIVER};
    use crate::{accounts, instruction};
    use anchor_lang::{
        solana_program::{instruction::Instruction, system_program},
        InstructionData, ToAccountMetas,
    };
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    #[test]
    fn close_message_to_relay_reclaims_rent_for_guardian_recipient() {
        let SetupRelayerResult {
            mut svm,
            payer,
            guardian,
            cfg_pda,
        } = setup_relayer();
        let payer_pk = payer.pubkey();
        let guardian_pk = guardian.pubkey();

        // Ensure the configured gas fee receiver exists.
        svm.airdrop(&TEST_GAS_FEE_RECEIVER, 1).unwrap();

        // Create a MessageToRelay account via PayForRelay.
        let outgoing_message = Pubkey::new_unique();
        let gas_limit: u64 = 123_456;
        let mtr_salt = Pubkey::new_unique().to_bytes();
        let (message_to_relay, _) = Pubkey::find_program_address(
            &[crate::constants::MTR_SEED, mtr_salt.as_ref()],
            &crate::ID,
        );

        let pay_accounts = accounts::PayForRelay {
            payer: payer_pk,
            cfg: cfg_pda,
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            message_to_relay,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let pay_ix = Instruction {
            program_id: crate::ID,
            accounts: pay_accounts,
            data: instruction::PayForRelay {
                mtr_salt,
                outgoing_message,
                gas_limit,
            }
            .data(),
        };

        let pay_tx = Transaction::new(
            &[&payer],
            Message::new(&[pay_ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );
        svm.send_transaction(pay_tx)
            .expect("failed to create message_to_relay");

        let recipient_before = svm.get_account(&guardian_pk).unwrap().lamports;
        let mtr_rent = svm.get_account(&message_to_relay).unwrap().lamports;

        // Close and reclaim rent to guardian.
        let close_accounts = accounts::CloseMessageToRelay {
            cfg: cfg_pda,
            guardian: guardian_pk,
            message_to_relay,
            recipient: guardian_pk,
        }
        .to_account_metas(None);

        let close_ix = Instruction {
            program_id: crate::ID,
            accounts: close_accounts,
            data: instruction::CloseMessageToRelay { mtr_salt }.data(),
        };

        let close_tx = Transaction::new(
            &[&guardian],
            Message::new(&[close_ix], Some(&guardian_pk)),
            svm.latest_blockhash(),
        );
        svm.send_transaction(close_tx)
            .expect("failed to close message_to_relay");

        assert!(
            svm.get_account(&message_to_relay).is_none(),
            "message_to_relay account should be closed"
        );

        let recipient_after = svm.get_account(&guardian_pk).unwrap().lamports;
        assert!(
            recipient_after >= recipient_before + mtr_rent,
            "recipient should recover at least closed account rent"
        );
    }
}
