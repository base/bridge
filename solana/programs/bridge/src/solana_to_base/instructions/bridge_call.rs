use anchor_lang::prelude::*;

use crate::{
    common::{bridge::{Bridge, BridgeError}, BRIDGE_SEED},
    solana_to_base::{check_and_pay_for_gas, check_call, Call, OutgoingMessage, GAS_FEE_RECEIVER},
};

#[derive(Accounts)]
#[instruction(_gas_limit: u64, call: Call)]
pub struct BridgeCall<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub from: Signer<'info>,

    /// CHECK: This is the hardcoded gas fee receiver account.
    #[account(mut, address = GAS_FEE_RECEIVER @ BridgeCallError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    #[account(
        init,
        payer = payer,
        space = 8 + OutgoingMessage::space(Some(call.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    pub system_program: Program<'info, System>,
}

pub fn bridge_call_handler(ctx: Context<BridgeCall>, gas_limit: u64, call: Call) -> Result<()> {
    // Check if bridge is paused
    require!(!ctx.accounts.bridge.paused, BridgeError::BridgePaused);
    
    check_call(&call)?;

    let message = OutgoingMessage::new_call(
        ctx.accounts.bridge.nonce,
        ctx.accounts.from.key(),
        gas_limit,
        call,
    );

    check_and_pay_for_gas(
        &ctx.accounts.system_program,
        &ctx.accounts.payer,
        &ctx.accounts.gas_fee_receiver,
        &mut ctx.accounts.bridge.eip1559,
        gas_limit,
        message.relay_messages_tx_size(),
    )?;

    *ctx.accounts.outgoing_message = message;
    ctx.accounts.bridge.nonce += 1;

    Ok(())
}

#[error_code]
pub enum BridgeCallError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::{
        solana_program::{
            example_mocks::solana_sdk::system_program, instruction::Instruction,
            native_token::LAMPORTS_PER_SOL,
        },
        InstructionData,
    };
    use litesvm::LiteSVM;
    use solana_keypair::Keypair;
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    use crate::{
        accounts,
        instruction,
        solana_to_base::CallType,
        test_utils::mock_clock,
        ID,
    };

    fn setup_bridge_with_guardian(svm: &mut LiteSVM, owner: &Keypair, guardian: &Keypair) -> Pubkey {
        let payer = Keypair::new();
        let payer_pk = payer.pubkey();
        svm.airdrop(&payer_pk, LAMPORTS_PER_SOL).unwrap();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();
        svm.airdrop(&guardian.pubkey(), LAMPORTS_PER_SOL).unwrap();

        let timestamp = 1747440000;
        mock_clock(svm, timestamp);

        let bridge_pda = Pubkey::find_program_address(&[BRIDGE_SEED], &ID).0;

        // Initialize bridge
        let accounts = accounts::Initialize {
            payer: payer_pk,
            owner: owner.pubkey(),
            bridge: bridge_pda,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::Initialize {}.data(),
        };

        let tx = Transaction::new(
            &[&payer, owner],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx).unwrap();

        // Add guardian
        let accounts = accounts::AddGuardian {
            payer: owner.pubkey(),
            owner: owner.pubkey(),
            bridge: bridge_pda,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::AddGuardian {
                guardian: guardian.pubkey(),
            }
            .data(),
        };

        let tx = Transaction::new(
            &[owner],
            Message::new(&[ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx).unwrap();

        bridge_pda
    }

    #[test]
    fn test_bridge_call_blocked_when_paused() {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(ID, "../../target/deploy/bridge.so")
            .unwrap();

        let owner = Keypair::new();
        let guardian = Keypair::new();
        let bridge_pda = setup_bridge_with_guardian(&mut svm, &owner, &guardian);

        // Pause the bridge
        let accounts = accounts::PauseSwitch {
            payer: guardian.pubkey(),
            guardian: guardian.pubkey(),
            bridge: bridge_pda,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::PauseSwitch {}.data(),
        };

        let tx = Transaction::new(
            &[&guardian],
            Message::new(&[ix], Some(&guardian.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx).unwrap();

        // Try to use bridge_call when paused
        let user = Keypair::new();
        svm.airdrop(&user.pubkey(), LAMPORTS_PER_SOL).unwrap();

        let outgoing_message = Keypair::new();
        let call = Call {
            ty: CallType::Call,
            to: [0; 20],
            value: 0,
            data: vec![],
        };

        let accounts = accounts::BridgeCall {
            payer: user.pubkey(),
            from: user.pubkey(),
            gas_fee_receiver: crate::solana_to_base::GAS_FEE_RECEIVER,
            bridge: bridge_pda,
            outgoing_message: outgoing_message.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::BridgeCall {
                gas_limit: 1000000,
                call,
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&user, &outgoing_message],
            Message::new(&[ix], Some(&user.pubkey())),
            svm.latest_blockhash(),
        );

        // Should fail with BridgePaused error
        assert!(svm.send_transaction(tx).is_err());
    }

    #[test]
    fn test_bridge_call_works_when_unpaused() {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(ID, "../../target/deploy/bridge.so")
            .unwrap();

        let owner = Keypair::new();
        let guardian = Keypair::new();
        let bridge_pda = setup_bridge_with_guardian(&mut svm, &owner, &guardian);

        // Bridge is unpaused by default, try bridge_call
        let user = Keypair::new();
        svm.airdrop(&user.pubkey(), LAMPORTS_PER_SOL).unwrap();

        let outgoing_message = Keypair::new();
        let call = Call {
            ty: CallType::Call,
            to: [0; 20],
            value: 0,
            data: vec![],
        };

        let accounts = accounts::BridgeCall {
            payer: user.pubkey(),
            from: user.pubkey(),
            gas_fee_receiver: crate::solana_to_base::GAS_FEE_RECEIVER,
            bridge: bridge_pda,
            outgoing_message: outgoing_message.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::BridgeCall {
                gas_limit: 1000000,
                call,
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&user, &outgoing_message],
            Message::new(&[ix], Some(&user.pubkey())),
            svm.latest_blockhash(),
        );

        // Should succeed when unpaused
        svm.send_transaction(tx).unwrap();
    }
}
