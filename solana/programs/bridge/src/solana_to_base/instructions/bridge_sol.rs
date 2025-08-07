use anchor_lang::prelude::*;

use crate::{
    common::{bridge::Bridge, BRIDGE_SEED, SOL_VAULT_SEED},
    solana_to_base::{internal::bridge_sol::bridge_sol_internal, Call, OutgoingMessage},
};

/// Accounts struct for the bridge_sol instruction that transfers native SOL from Solana to Base
/// along with an optional call that can be executed on Base.
///
/// The bridged SOLs are locked in a vault on Solana and an outgoing message is created to mint
/// the corresponding tokens and execute the optional call on Base.
#[derive(Accounts)]
#[instruction(_to: [u8; 20], remote_token: [u8; 20], _amount: u64, call: Option<Call>)]
pub struct BridgeSol<'info> {
    /// The account that pays for transaction fees and account creation.
    /// Must be mutable to deduct lamports for account rent and gas fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The account that owns the SOL tokens being bridged.
    /// Must sign the transaction to authorize the transfer of their SOL.
    #[account(mut)]
    pub from: Signer<'info>,

    /// The account that receives payment for the gas costs of bridging SOL to Base.
    /// CHECK: This account is validated to be the same as bridge.gas_cost_config.gas_fee_receiver
    #[account(mut, address = bridge.gas_cost_config.gas_fee_receiver @ BridgeSolError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    /// The SOL vault account that holds locked tokens for the specific remote token.
    /// - Uses PDA with SOL_VAULT_SEED and remote_token for deterministic address
    /// - Mutable to receive the locked SOL tokens
    /// - Each remote token has its own dedicated vault
    ///
    /// CHECK: This is the SOL vault account.
    #[account(
        mut,
        seeds = [SOL_VAULT_SEED, remote_token.as_ref()],
        bump,
    )]
    pub sol_vault: AccountInfo<'info>,

    /// The main bridge state account that tracks nonces and fee parameters.
    /// - Uses PDA with BRIDGE_SEED for deterministic address
    /// - Mutable to increment nonce and update EIP1559 fee data
    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    /// The outgoing message account that stores cross-chain transfer details.
    /// - Created fresh for each bridge operation
    /// - Payer funds the account creation
    /// - Space allocated dynamically based on optional call data size
    #[account(
        init,
        payer = payer,
        space = 8 + OutgoingMessage::space(call.as_ref().map(|c| c.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// System program required for SOL transfers and account creation.
    /// Used for transferring SOL from user to vault and creating outgoing message account.
    pub system_program: Program<'info, System>,
}

pub fn bridge_sol_handler(
    ctx: Context<BridgeSol>,
    to: [u8; 20],
    remote_token: [u8; 20],
    amount: u64,
    call: Option<Call>,
) -> Result<()> {
    // Check if bridge is paused
    require!(!ctx.accounts.bridge.paused, BridgeSolError::BridgePaused);

    bridge_sol_internal(
        &ctx.accounts.payer,
        &ctx.accounts.from,
        &ctx.accounts.gas_fee_receiver,
        &ctx.accounts.sol_vault,
        &mut ctx.accounts.bridge,
        &mut ctx.accounts.outgoing_message,
        &ctx.accounts.system_program,
        to,
        remote_token,
        amount,
        call,
    )
}

#[error_code]
pub enum BridgeSolError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
    #[msg("Only the owner can close this call buffer")]
    Unauthorized,
    #[msg("Bridge is currently paused")]
    BridgePaused,
}

#[cfg(test)]
mod tests {
    use super::*;

    use anchor_lang::{
        solana_program::{instruction::Instruction, native_token::LAMPORTS_PER_SOL},
        system_program, InstructionData,
    };
    use solana_keypair::Keypair;
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    use crate::{
        accounts,
        common::{bridge::Bridge, SOL_VAULT_SEED},
        instruction::BridgeSol as BridgeSolIx,
        solana_to_base::{Call, CallType, NATIVE_SOL_PUBKEY},
        test_utils::{setup_bridge_and_svm, TEST_GAS_FEE_RECEIVER},
        ID,
    };

    #[test]
    fn test_bridge_sol_success_without_call() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL * 5).unwrap();

        // Create outgoing message account
        let outgoing_message = Keypair::new();

        // Test parameters
        let to = [1u8; 20]; // Base address
        let remote_token = [2u8; 20]; // Remote token address
        let amount = LAMPORTS_PER_SOL; // 1 SOL

        // Find SOL vault PDA
        let sol_vault =
            Pubkey::find_program_address(&[SOL_VAULT_SEED, remote_token.as_ref()], &ID).0;

        // Build the BridgeSol instruction accounts
        let accounts = accounts::BridgeSol {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            sol_vault,
            bridge: bridge_pda,
            outgoing_message: outgoing_message.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeSol instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeSolIx {
                to,
                remote_token,
                amount,
                call: None,
            }
            .data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[&payer, &from, &outgoing_message],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        // Get initial balances
        let from_initial_balance = svm.get_account(&from.pubkey()).unwrap().lamports;
        let vault_initial_balance = svm
            .get_account(&sol_vault)
            .map(|acc| acc.lamports)
            .unwrap_or(0);

        // Send the transaction
        svm.send_transaction(tx)
            .expect("Failed to send bridge_sol transaction");

        // Verify the OutgoingMessage account was created correctly
        let outgoing_message_account = svm.get_account(&outgoing_message.pubkey()).unwrap();
        assert_eq!(outgoing_message_account.owner, ID);

        let outgoing_message_data =
            OutgoingMessage::try_deserialize(&mut &outgoing_message_account.data[..]).unwrap();

        // Verify the message fields
        assert_eq!(outgoing_message_data.nonce, 0);
        assert_eq!(outgoing_message_data.original_payer, payer.pubkey());
        assert_eq!(outgoing_message_data.sender, from.pubkey());

        // Verify the message content
        match outgoing_message_data.message {
            crate::solana_to_base::Message::Transfer(transfer) => {
                assert_eq!(transfer.to, to);
                assert_eq!(transfer.local_token, NATIVE_SOL_PUBKEY);
                assert_eq!(transfer.remote_token, remote_token);
                assert_eq!(transfer.amount, amount);
                assert!(transfer.call.is_none());
            }
            _ => panic!("Expected Transfer message"),
        }

        // Verify SOL was transferred from user to vault
        let from_final_balance = svm.get_account(&from.pubkey()).unwrap().lamports;
        let vault_final_balance = svm.get_account(&sol_vault).unwrap().lamports;

        assert_eq!(from_final_balance, from_initial_balance - amount);
        assert_eq!(vault_final_balance, vault_initial_balance + amount);

        // Verify bridge nonce was incremented
        let bridge_account = svm.get_account(&bridge_pda).unwrap();
        let bridge_data = Bridge::try_deserialize(&mut &bridge_account.data[..]).unwrap();
        assert_eq!(bridge_data.nonce, 1);
    }

    #[test]
    fn test_bridge_sol_success_with_call() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL * 5).unwrap();

        // Create outgoing message account
        let outgoing_message = Keypair::new();

        // Test parameters
        let to = [1u8; 20];
        let remote_token = [2u8; 20];
        let amount = LAMPORTS_PER_SOL / 2; // 0.5 SOL

        // Create test call data
        let call = Call {
            ty: CallType::Call,
            to: [3u8; 20],
            value: 100,
            data: vec![0xaa, 0xbb, 0xcc, 0xdd],
        };

        // Find SOL vault PDA
        let sol_vault =
            Pubkey::find_program_address(&[SOL_VAULT_SEED, remote_token.as_ref()], &ID).0;

        // Build the BridgeSol instruction accounts
        let accounts = accounts::BridgeSol {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            sol_vault,
            bridge: bridge_pda,
            outgoing_message: outgoing_message.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeSol instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeSolIx {
                to,
                remote_token,
                amount,
                call: Some(call.clone()),
            }
            .data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[&payer, &from, &outgoing_message],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        // Send the transaction
        svm.send_transaction(tx)
            .expect("Failed to send bridge_sol transaction with call");

        // Verify the OutgoingMessage account was created correctly
        let outgoing_message_account = svm.get_account(&outgoing_message.pubkey()).unwrap();
        let outgoing_message_data =
            OutgoingMessage::try_deserialize(&mut &outgoing_message_account.data[..]).unwrap();

        // Verify the message content including call
        match outgoing_message_data.message {
            crate::solana_to_base::Message::Transfer(transfer) => {
                assert_eq!(transfer.to, to);
                assert_eq!(transfer.local_token, NATIVE_SOL_PUBKEY);
                assert_eq!(transfer.remote_token, remote_token);
                assert_eq!(transfer.amount, amount);

                let transfer_call = transfer.call.expect("Expected call to be present");
                assert_eq!(transfer_call.ty, call.ty);
                assert_eq!(transfer_call.to, call.to);
                assert_eq!(transfer_call.value, call.value);
                assert_eq!(transfer_call.data, call.data);
            }
            _ => panic!("Expected Transfer message"),
        }
    }

    #[test]
    fn test_bridge_sol_incorrect_gas_fee_receiver() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL * 5).unwrap();

        // Create wrong gas fee receiver
        let wrong_gas_fee_receiver = Keypair::new();

        // Create outgoing message account
        let outgoing_message = Keypair::new();

        // Test parameters
        let to = [1u8; 20];
        let remote_token = [2u8; 20];
        let amount = LAMPORTS_PER_SOL;

        // Find SOL vault PDA
        let sol_vault =
            Pubkey::find_program_address(&[SOL_VAULT_SEED, remote_token.as_ref()], &ID).0;

        // Build the BridgeSol instruction accounts with wrong gas fee receiver
        let accounts = accounts::BridgeSol {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: wrong_gas_fee_receiver.pubkey(), // Wrong receiver
            sol_vault,
            bridge: bridge_pda,
            outgoing_message: outgoing_message.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeSol instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeSolIx {
                to,
                remote_token,
                amount,
                call: None,
            }
            .data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[&payer, &from, &outgoing_message],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        // Send the transaction - should fail
        let result = svm.send_transaction(tx);
        assert!(
            result.is_err(),
            "Expected transaction to fail with incorrect gas fee receiver"
        );

        // Check that the error contains the expected error message
        let error_string = format!("{:?}", result.unwrap_err());
        assert!(
            error_string.contains("IncorrectGasFeeReceiver"),
            "Expected IncorrectGasFeeReceiver error, got: {}",
            error_string
        );
    }

    #[test]
    fn test_bridge_sol_fails_when_paused() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Pause the bridge first
        let mut bridge_account = svm.get_account(&bridge_pda).unwrap();
        let mut bridge = Bridge::try_deserialize(&mut &bridge_account.data[..]).unwrap();
        bridge.paused = true;
        let mut new_data = Vec::new();
        bridge.try_serialize(&mut new_data).unwrap();
        bridge_account.data = new_data;
        svm.set_account(bridge_pda, bridge_account).unwrap();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL * 5).unwrap();

        // Create outgoing message account
        let outgoing_message = Keypair::new();

        // Test parameters
        let to = [1u8; 20];
        let remote_token = [2u8; 20];
        let amount = LAMPORTS_PER_SOL;

        // Find SOL vault PDA
        let sol_vault =
            Pubkey::find_program_address(&[SOL_VAULT_SEED, remote_token.as_ref()], &ID).0;

        // Build the BridgeSol instruction accounts
        let accounts = accounts::BridgeSol {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            sol_vault,
            bridge: bridge_pda,
            outgoing_message: outgoing_message.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeSol instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeSolIx {
                to,
                remote_token,
                amount,
                call: None,
            }
            .data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[&payer, &from, &outgoing_message],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        // Send the transaction - should fail
        let result = svm.send_transaction(tx);
        assert!(
            result.is_err(),
            "Expected transaction to fail when bridge is paused"
        );

        // Check that the error contains the expected error message
        let error_string = format!("{:?}", result.unwrap_err());
        assert!(
            error_string.contains("BridgePaused"),
            "Expected BridgePaused error, got: {}",
            error_string
        );
    }
}
