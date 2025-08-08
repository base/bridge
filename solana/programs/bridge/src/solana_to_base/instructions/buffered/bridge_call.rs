use anchor_lang::prelude::*;

use crate::{
    common::{bridge::Bridge, BRIDGE_SEED},
    solana_to_base::{
        internal::bridge_call::bridge_call_internal, Call, CallBuffer, OutgoingMessage,
    },
};

/// Accounts struct for the bridge_call_buffered instruction that enables arbitrary function calls
/// from Solana to Base. This instruction falls back to the same logic as bridge_call, but it reads
/// the call data from a call buffer account instead of the instruction data.
#[derive(Accounts)]
pub struct BridgeCallBuffered<'info> {
    /// The account that pays for the transaction fees and outgoing message account creation.
    /// Must be mutable to deduct lamports for account rent and gas fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The account initiating the bridge call on Solana.
    /// This account's public key will be used as the sender in the cross-chain message.
    pub from: Signer<'info>,

    /// The account that receives payment for the gas costs of bridging the call to Base.
    /// CHECK: This account is validated to be the same as bridge.gas_cost_config.gas_fee_receiver
    #[account(mut, address = bridge.gas_cost_config.gas_fee_receiver @ BridgeCallBufferedError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    /// The main bridge state account containing global bridge configuration.
    /// - Uses PDA with BRIDGE_SEED for deterministic address
    /// - Mutable to increment the nonce and update EIP-1559 gas pricing
    /// - Provides the current nonce for message ordering
    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    /// The owner of the call buffer who will receive the rent refund.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The call buffer account that stores the call data.
    /// This account will be closed and rent returned to the owner.
    #[account(
        mut,
        close = owner,
        has_one = owner @ BridgeCallBufferedError::Unauthorized,
    )]
    pub call_buffer: Account<'info, CallBuffer>,

    /// The outgoing message account that stores the cross-chain call data.
    /// - Created fresh for each bridge call with unique address
    /// - Payer funds the account creation
    /// - Space calculated dynamically based on call data length (8-byte discriminator + message data)
    /// - Contains all information needed for execution on Base
    #[account(
        init,
        payer = payer,
        space = 8 + OutgoingMessage::space(Some(call_buffer.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// System program required for creating the outgoing message account.
    /// Used internally by Anchor for account initialization.
    pub system_program: Program<'info, System>,
}

pub fn bridge_call_buffered_handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, BridgeCallBuffered<'info>>,
) -> Result<()> {
    // Check if bridge is paused
    require!(
        !ctx.accounts.bridge.paused,
        BridgeCallBufferedError::BridgePaused
    );

    let call_buffer = &ctx.accounts.call_buffer;
    let call = Call {
        ty: call_buffer.ty,
        to: call_buffer.to,
        value: call_buffer.value,
        data: call_buffer.data.clone(),
    };

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
pub enum BridgeCallBufferedError {
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
        common::bridge::Bridge,
        instruction::{BridgeCallBuffered as BridgeCallBufferedIx, InitializeCallBuffer},
        solana_to_base::CallType,
        test_utils::{setup_bridge_and_svm, TEST_GAS_FEE_RECEIVER},
        ID,
    };

    #[test]
    fn test_bridge_call_buffered_success() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create owner account (who owns the call buffer)
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Create call buffer account
        let call_buffer = Keypair::new();

        // Create test call data
        let call_ty = CallType::Call;
        let call_to = [1u8; 20];
        let call_value = 0u128;
        let call_data = vec![0x12, 0x34, 0x56, 0x78];
        let max_data_len = 1024;

        // First, initialize the call buffer
        let init_accounts = accounts::InitializeCallBuffer {
            payer: owner.pubkey(),
            bridge: bridge_pda,
            call_buffer: call_buffer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let init_ix = Instruction {
            program_id: ID,
            accounts: init_accounts,
            data: InitializeCallBuffer {
                ty: call_ty,
                to: call_to,
                value: call_value,
                initial_data: call_data.clone(),
                max_data_len,
            }
            .data(),
        };

        let init_tx = Transaction::new(
            &[&owner, &call_buffer],
            Message::new(&[init_ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(init_tx)
            .expect("Failed to initialize call buffer");

        // Now create the bridge call buffered instruction
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL).unwrap();

        let outgoing_message = Keypair::new();

        // Build the BridgeCallBuffered instruction accounts
        let accounts = accounts::BridgeCallBuffered {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            bridge: bridge_pda,
            owner: owner.pubkey(),
            call_buffer: call_buffer.pubkey(),
            outgoing_message: outgoing_message.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeCallBuffered instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeCallBufferedIx {}.data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[&payer, &from, &owner, &outgoing_message],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        // Send the transaction
        svm.send_transaction(tx)
            .expect("Failed to send bridge_call_buffered transaction");

        // Assert the OutgoingMessage account was created correctly
        let outgoing_message_account = svm.get_account(&outgoing_message.pubkey()).unwrap();
        assert_eq!(outgoing_message_account.owner, ID);

        let outgoing_message_data =
            OutgoingMessage::try_deserialize(&mut &outgoing_message_account.data[..]).unwrap();

        // Verify the message fields
        assert_eq!(outgoing_message_data.nonce, 0);
        assert_eq!(outgoing_message_data.sender, from.pubkey());

        // Verify the message content matches the call buffer data
        match outgoing_message_data.message {
            crate::solana_to_base::Message::Call(message_call) => {
                assert_eq!(message_call.ty, call_ty);
                assert_eq!(message_call.to, call_to);
                assert_eq!(message_call.value, call_value);
                assert_eq!(message_call.data, call_data);
            }
            _ => panic!("Expected Call message"),
        }

        // Verify the call buffer account was closed (should have 0 lamports and 0 data)
        let call_buffer_account = svm.get_account(&call_buffer.pubkey()).unwrap();
        assert_eq!(
            call_buffer_account.lamports, 0,
            "Call buffer should have 0 lamports after being closed"
        );
        assert_eq!(
            call_buffer_account.data.len(),
            0,
            "Call buffer should have 0 data length after being closed"
        );
        assert_eq!(
            call_buffer_account.owner,
            system_program::ID,
            "Call buffer should be owned by system program after being closed"
        );

        // Verify bridge nonce was incremented
        let bridge_account = svm.get_account(&bridge_pda).unwrap();
        let bridge_data = Bridge::try_deserialize(&mut &bridge_account.data[..]).unwrap();
        assert_eq!(bridge_data.nonce, 1);
    }

    #[test]
    fn test_bridge_call_buffered_unauthorized() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create owner account (who owns the call buffer)
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Create unauthorized account (not the owner)
        let unauthorized = Keypair::new();
        svm.airdrop(&unauthorized.pubkey(), LAMPORTS_PER_SOL)
            .unwrap();

        // Create call buffer account
        let call_buffer = Keypair::new();

        // First, initialize the call buffer with owner
        let init_accounts = accounts::InitializeCallBuffer {
            payer: owner.pubkey(),
            bridge: bridge_pda,
            call_buffer: call_buffer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let init_ix = Instruction {
            program_id: ID,
            accounts: init_accounts,
            data: InitializeCallBuffer {
                ty: CallType::Call,
                to: [1u8; 20],
                value: 0,
                initial_data: vec![0x12, 0x34],
                max_data_len: 1024,
            }
            .data(),
        };

        let init_tx = Transaction::new(
            &[&owner, &call_buffer],
            Message::new(&[init_ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(init_tx)
            .expect("Failed to initialize call buffer");

        // Now try to use bridge_call_buffered with unauthorized account as owner
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL).unwrap();

        let outgoing_message = Keypair::new();

        // Build the BridgeCallBuffered instruction accounts with unauthorized owner
        let accounts = accounts::BridgeCallBuffered {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            bridge: bridge_pda,
            owner: unauthorized.pubkey(), // Wrong owner
            call_buffer: call_buffer.pubkey(),
            outgoing_message: outgoing_message.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeCallBuffered instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeCallBufferedIx {}.data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[&payer, &from, &unauthorized, &outgoing_message],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        // Send the transaction - should fail
        let result = svm.send_transaction(tx);
        assert!(
            result.is_err(),
            "Expected transaction to fail with unauthorized owner"
        );

        // Check that the error contains the expected error message
        let error_string = format!("{:?}", result.unwrap_err());
        assert!(
            error_string.contains("Unauthorized"),
            "Expected Unauthorized error, got: {}",
            error_string
        );
    }

    #[test]
    fn test_bridge_call_buffered_incorrect_gas_fee_receiver() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create owner account
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Create wrong gas fee receiver
        let wrong_gas_fee_receiver = Keypair::new();

        // Create call buffer account
        let call_buffer = Keypair::new();

        // Initialize the call buffer
        let init_accounts = accounts::InitializeCallBuffer {
            payer: owner.pubkey(),
            bridge: bridge_pda,
            call_buffer: call_buffer.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let init_ix = Instruction {
            program_id: ID,
            accounts: init_accounts,
            data: InitializeCallBuffer {
                ty: CallType::Call,
                to: [1u8; 20],
                value: 0,
                initial_data: vec![0x12, 0x34],
                max_data_len: 1024,
            }
            .data(),
        };

        let init_tx = Transaction::new(
            &[&owner, &call_buffer],
            Message::new(&[init_ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(init_tx)
            .expect("Failed to initialize call buffer");

        // Now try bridge_call_buffered with wrong gas fee receiver
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL).unwrap();

        let outgoing_message = Keypair::new();

        // Build the BridgeCallBuffered instruction accounts with wrong gas fee receiver
        let accounts = accounts::BridgeCallBuffered {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: wrong_gas_fee_receiver.pubkey(), // Wrong receiver
            bridge: bridge_pda,
            owner: owner.pubkey(),
            call_buffer: call_buffer.pubkey(),
            outgoing_message: outgoing_message.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeCallBuffered instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeCallBufferedIx {}.data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[&payer, &from, &owner, &outgoing_message],
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
}
