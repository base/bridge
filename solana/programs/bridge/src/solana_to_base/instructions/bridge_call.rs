use anchor_lang::prelude::*;

use crate::{
    common::{bridge::Bridge, BRIDGE_SEED},
    solana_to_base::{internal::bridge_call::bridge_call_internal, Call, OutgoingMessage},
};

/// Accounts struct for the bridge_call instruction that enables arbitrary function calls
/// from Solana to Base. This instruction creates an outgoing message containing
/// the call data and handles gas fee payment for cross-chain execution.
#[derive(Accounts)]
#[instruction(call: Call)]
pub struct BridgeCall<'info> {
    /// The account that pays for the transaction fees and outgoing message account creation.
    /// Must be mutable to deduct lamports for account rent and gas fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The account initiating the bridge call on Solana.
    /// This account's public key will be used as the sender in the cross-chain message.
    pub from: Signer<'info>,

    /// The account that receives payment for the gas costs of bridging the call to Base.
    /// CHECK: This account is validated to be the same as bridge.gas_cost_config.gas_fee_receiver
    #[account(mut, address = bridge.gas_cost_config.gas_fee_receiver @ BridgeCallError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    /// The main bridge state account containing global bridge configuration.
    /// - Uses PDA with BRIDGE_SEED for deterministic address
    /// - Mutable to increment the nonce and update EIP-1559 gas pricing
    /// - Provides the current nonce for message ordering
    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    /// The outgoing message account that stores the cross-chain call data.
    /// - Created fresh for each bridge call with unique address
    /// - Payer funds the account creation
    /// - Space calculated dynamically based on call data length (8-byte discriminator + message data)
    /// - Contains all information needed for execution on Base
    #[account(
        init,
        payer = payer,
        space = 8 + OutgoingMessage::space(Some(call.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// System program required for creating the outgoing message account.
    /// Used internally by Anchor for account initialization.
    pub system_program: Program<'info, System>,
}

pub fn bridge_call_handler(ctx: Context<BridgeCall>, call: Call) -> Result<()> {
    // Check if bridge is paused
    require!(!ctx.accounts.bridge.paused, BridgeCallError::BridgePaused);
    bridge_call_internal(
        &ctx.accounts.payer,
        &ctx.accounts.from,
        &ctx.accounts.gas_fee_receiver,
        &mut ctx.accounts.bridge,
        &mut ctx.accounts.outgoing_message,
        &ctx.accounts.system_program,
        call,
    )
}

#[error_code]
pub enum BridgeCallError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
    #[msg("Only the owner can close this call buffer")]
    Unauthorized,
    #[msg("Bridge is paused")]
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
        common::bridge::Bridge,
        instruction::BridgeCall as BridgeCallIx,
        solana_to_base::CallType,
        test_utils::{setup_bridge_and_svm, TEST_GAS_FEE_RECEIVER},
        ID,
    };

    #[test]
    fn test_bridge_call_success() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Airdrop to gas fee receiver
        svm.airdrop(&TEST_GAS_FEE_RECEIVER, LAMPORTS_PER_SOL)
            .unwrap();

        // Create outgoing message account
        let outgoing_message = Keypair::new();

        // Create test call data
        let call = Call {
            ty: CallType::Call,
            to: [1u8; 20], // Some test address
            value: 0,
            data: vec![0x12, 0x34, 0x56, 0x78], // Some test calldata
        };

        // Build the BridgeCall instruction accounts
        let accounts = accounts::BridgeCall {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            bridge: bridge_pda,
            outgoing_message: outgoing_message.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeCall instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeCallIx { call: call.clone() }.data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[&payer, &from, &outgoing_message],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        // Send the transaction
        svm.send_transaction(tx)
            .expect("Failed to send bridge_call transaction");

        // Assert the OutgoingMessage account was created correctly
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
            crate::solana_to_base::Message::Call(message_call) => {
                assert_eq!(message_call.ty, call.ty);
                assert_eq!(message_call.to, call.to);
                assert_eq!(message_call.value, call.value);
                assert_eq!(message_call.data, call.data);
            }
            _ => panic!("Expected Call message"),
        }

        // Verify bridge nonce was incremented
        let bridge_account = svm.get_account(&bridge_pda).unwrap();
        let bridge_data = Bridge::try_deserialize(&mut &bridge_account.data[..]).unwrap();
        assert_eq!(bridge_data.nonce, 1);
    }

    #[test]
    fn test_bridge_call_incorrect_gas_fee_receiver() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Create wrong gas fee receiver (not the hardcoded one)
        let wrong_gas_fee_receiver = Keypair::new();
        svm.airdrop(&wrong_gas_fee_receiver.pubkey(), LAMPORTS_PER_SOL)
            .unwrap();

        // Create outgoing message account
        let outgoing_message = Keypair::new();

        // Create test call data
        let call = Call {
            ty: CallType::Call,
            to: [1u8; 20],
            value: 0,
            data: vec![0x12, 0x34, 0x56, 0x78],
        };

        // Build the BridgeCall instruction accounts with wrong gas fee receiver
        let accounts = accounts::BridgeCall {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: wrong_gas_fee_receiver.pubkey(), // Wrong receiver
            bridge: bridge_pda,
            outgoing_message: outgoing_message.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeCall instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeCallIx { call }.data(),
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
    fn test_bridge_call_fails_when_paused() {
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
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Create outgoing message account
        let outgoing_message = Keypair::new();

        // Test parameters
        let call = Call {
            ty: CallType::Call,
            to: [1u8; 20],
            value: 0u128,
            data: vec![1, 2, 3, 4],
        };

        // Build the BridgeCall instruction accounts
        let accounts = accounts::BridgeCall {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            bridge: bridge_pda,
            outgoing_message: outgoing_message.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeCall instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeCallIx { call }.data(),
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
