use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{Mint, TokenAccount},
};

use crate::{
    common::{bridge::Bridge, BRIDGE_SEED},
    solana_to_base::{
        internal::bridge_wrapped_token::bridge_wrapped_token_internal, Call, OutgoingMessage,
    },
};

/// Accounts struct for the bridge wrapped token instruction that transfers wrapped tokens from Solana to Base
/// along with an optional call that can be executed on Base.
///
/// This instruction burns wrapped tokens on Solana and creates an outgoing message to transfer equivalent
/// tokens and execute the optional call on Base.
#[derive(Accounts)]
#[instruction(_gas_limit: u64, _to: [u8; 20], _amount: u64, call: Option<Call>)]
pub struct BridgeWrappedToken<'info> {
    /// The account that pays for transaction fees and outgoing message account creation.
    /// Must be mutable to deduct lamports for account rent and gas fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The token owner who is bridging their wrapped tokens back to Base.
    /// Must sign the transaction to authorize burning their tokens.
    pub from: Signer<'info>,

    /// The account that receives payment for the gas costs of bridging the token on Base.
    /// CHECK: This account is validated to be the same as bridge.gas_cost_config.gas_fee_receiver
    #[account(mut, address = bridge.gas_cost_config.gas_fee_receiver @ BridgeWrappedTokenError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    /// The wrapped token mint account representing the original Base token.
    /// - Contains metadata linking to the original token on Base
    /// - Tokens will be burned from this mint
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The user's token account holding the wrapped tokens to be bridged.
    /// - Must contain sufficient token balance for the bridge amount
    /// - Tokens will be burned from this account
    #[account(mut)]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,

    /// The main bridge state account storing global bridge configuration.
    /// - Uses PDA with BRIDGE_SEED for deterministic address
    /// - Tracks nonce for message ordering and EIP-1559 gas pricing
    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    /// The outgoing message account being created to store bridge transfer data.
    /// - Contains transfer details and optional call data for Base execution
    /// - Space allocated based on call data size
    /// - Will be read by Base relayers to complete the bridge operation
    #[account(
        init,       
        payer = payer,
        space = 8 + OutgoingMessage::space(call.as_ref().map(|c| c.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// Token2022 program used for burning the wrapped tokens.
    /// Required for all token operations including burn_checked.
    pub token_program: Program<'info, Token2022>,

    /// System program required for creating the outgoing message account.
    pub system_program: Program<'info, System>,
}

pub fn bridge_wrapped_token_handler(
    ctx: Context<BridgeWrappedToken>,
    gas_limit: u64,
    to: [u8; 20],
    amount: u64,
    call: Option<Call>,
) -> Result<()> {
    // Check if bridge is paused
    require!(!ctx.accounts.bridge.paused, BridgeWrappedTokenError::BridgePaused);

    bridge_wrapped_token_internal(
        &ctx.accounts.payer,
        &ctx.accounts.from,
        &ctx.accounts.gas_fee_receiver,
        &ctx.accounts.mint,
        &ctx.accounts.from_token_account,
        &mut ctx.accounts.bridge,
        &mut ctx.accounts.outgoing_message,
        &ctx.accounts.token_program,
        &ctx.accounts.system_program,
        gas_limit,
        to,
        amount,
        call,
    )
}

#[error_code]
pub enum BridgeWrappedTokenError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
    #[msg("Mint is a wrapped token")]
    MintIsWrappedToken,
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
    use anchor_spl::token_interface::TokenAccount;
    use solana_keypair::Keypair;
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    use crate::{
        accounts,
        common::{bridge::Bridge, PartialTokenMetadata},
        instruction::BridgeWrappedToken as BridgeWrappedTokenIx,
        solana_to_base::{Call, CallType},
        test_utils::{
            create_mock_wrapped_mint, create_mock_token_account, setup_bridge_and_svm,
            TEST_GAS_FEE_RECEIVER,
        },
        ID,
    };

    #[test]
    fn test_bridge_wrapped_token_success_without_call() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL * 5).unwrap();



        // Create test wrapped token metadata
        let partial_token_metadata = PartialTokenMetadata {
            name: "Test Token".to_string(),
            symbol: "TEST".to_string(),
            remote_token: [1u8; 20],
            scaler_exponent: 0,
        };

        // Create wrapped token mint
        let initial_amount = 1_000_000u64; // 1 token with 6 decimals
        let wrapped_mint = create_mock_wrapped_mint(&mut svm, initial_amount, 6, &partial_token_metadata);

        // Create token account for the from user
        let from_token_account = Keypair::new().pubkey();
        create_mock_token_account(
            &mut svm,
            from_token_account,
            wrapped_mint,
            from.pubkey(),
            initial_amount,
        );

        // Create outgoing message account
        let outgoing_message = Keypair::new();

        // Test parameters
        let gas_limit = 1_000_000u64;
        let to = [1u8; 20]; // Base address
        let amount = 500_000u64; // 0.5 tokens

        // Build the BridgeWrappedToken instruction accounts
        let accounts = accounts::BridgeWrappedToken {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            mint: wrapped_mint,
            from_token_account,
            bridge: bridge_pda,
            outgoing_message: outgoing_message.pubkey(),
            token_program: anchor_spl::token_2022::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeWrappedToken instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeWrappedTokenIx {
                gas_limit,
                to,
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

        // Send the transaction
        svm.send_transaction(tx)
            .expect("Failed to send bridge_wrapped_token transaction");

        // Verify the OutgoingMessage account was created correctly
        let outgoing_message_account = svm.get_account(&outgoing_message.pubkey()).unwrap();
        assert_eq!(outgoing_message_account.owner, ID);

        let outgoing_message_data =
            OutgoingMessage::try_deserialize(&mut &outgoing_message_account.data[..]).unwrap();

        // Verify the message fields
        assert_eq!(outgoing_message_data.nonce, 1);
        assert_eq!(outgoing_message_data.original_payer, payer.pubkey());
        assert_eq!(outgoing_message_data.sender, from.pubkey());
        assert_eq!(outgoing_message_data.gas_limit, gas_limit);

        // Verify the message content
        match outgoing_message_data.message {
            crate::solana_to_base::Message::Transfer(transfer) => {
                assert_eq!(transfer.to, to);
                assert_eq!(transfer.local_token, wrapped_mint);
                assert_eq!(transfer.remote_token, partial_token_metadata.remote_token);
                assert_eq!(transfer.amount, amount);
                assert!(transfer.call.is_none());
            }
            _ => panic!("Expected Transfer message"),
        }

        // Verify tokens were burned from user account
        let from_final_balance = svm.get_account(&from_token_account).unwrap();
        let from_final_amount = TokenAccount::try_deserialize(&mut &from_final_balance.data[..])
            .unwrap()
            .amount;
        assert_eq!(from_final_amount, initial_amount - amount);

        // Verify bridge nonce was incremented
        let bridge_account = svm.get_account(&bridge_pda).unwrap();
        let bridge_data = Bridge::try_deserialize(&mut &bridge_account.data[..]).unwrap();
        assert_eq!(bridge_data.nonce, 2);
    }

    #[test]
    fn test_bridge_wrapped_token_success_with_call() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL * 5).unwrap();

        // Create test wrapped token metadata
        let partial_token_metadata = PartialTokenMetadata {
            name: "Test Token".to_string(),
            symbol: "TEST".to_string(),
            remote_token: [2u8; 20], // Different remote token
            scaler_exponent: 0,
        };

        // Create wrapped token mint
        let initial_amount = 1_000_000u64; // 1 token with 6 decimals
        let wrapped_mint = create_mock_wrapped_mint(&mut svm, initial_amount, 6, &partial_token_metadata);

        // Create token account for the from user
        let from_token_account = Keypair::new().pubkey();
        create_mock_token_account(
            &mut svm,
            from_token_account,
            wrapped_mint,
            from.pubkey(),
            initial_amount,
        );

        // Create outgoing message account
        let outgoing_message = Keypair::new();

        // Test parameters
        let gas_limit = 1_000_000u64;
        let to = [1u8; 20];
        let amount = 250_000u64; // 0.25 tokens

        // Create test call data
        let call = Call {
            ty: CallType::Call,
            to: [3u8; 20],
            value: 100,
            data: vec![0xaa, 0xbb, 0xcc, 0xdd],
        };

        // Build the BridgeWrappedToken instruction accounts
        let accounts = accounts::BridgeWrappedToken {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            mint: wrapped_mint,
            from_token_account,
            bridge: bridge_pda,
            outgoing_message: outgoing_message.pubkey(),
            token_program: anchor_spl::token_2022::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeWrappedToken instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeWrappedTokenIx {
                gas_limit,
                to,
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
            .expect("Failed to send bridge_wrapped_token transaction with call");

        // Verify the OutgoingMessage account was created correctly
        let outgoing_message_account = svm.get_account(&outgoing_message.pubkey()).unwrap();
        let outgoing_message_data =
            OutgoingMessage::try_deserialize(&mut &outgoing_message_account.data[..]).unwrap();

        // Verify the message content including call
        match outgoing_message_data.message {
            crate::solana_to_base::Message::Transfer(transfer) => {
                assert_eq!(transfer.to, to);
                assert_eq!(transfer.local_token, wrapped_mint);
                assert_eq!(transfer.remote_token, partial_token_metadata.remote_token);
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
    fn test_bridge_wrapped_token_incorrect_gas_fee_receiver() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL * 5).unwrap();

        // Create wrong gas fee receiver
        let wrong_gas_fee_receiver = Keypair::new();

        // Create test wrapped token metadata
        let partial_token_metadata = PartialTokenMetadata {
            name: "Test Token".to_string(),
            symbol: "TEST".to_string(),
            remote_token: [1u8; 20],
            scaler_exponent: 0,
        };

        // Create wrapped token mint
        let initial_amount = 1_000_000u64; // 1 token with 6 decimals
        let wrapped_mint = create_mock_wrapped_mint(&mut svm, initial_amount, 6, &partial_token_metadata);

        // Create token account for the from user
        let from_token_account = Keypair::new().pubkey();
        create_mock_token_account(
            &mut svm,
            from_token_account,
            wrapped_mint,
            from.pubkey(),
            initial_amount,
        );

        // Create outgoing message account
        let outgoing_message = Keypair::new();

        // Test parameters
        let gas_limit = 1_000_000u64;
        let to = [1u8; 20];
        let amount = 500_000u64;

        // Build the BridgeWrappedToken instruction accounts with wrong gas fee receiver
        let accounts = accounts::BridgeWrappedToken {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: wrong_gas_fee_receiver.pubkey(), // Wrong receiver
            mint: wrapped_mint,
            from_token_account,
            bridge: bridge_pda,
            outgoing_message: outgoing_message.pubkey(),
            token_program: anchor_spl::token_2022::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeWrappedToken instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeWrappedTokenIx {
                gas_limit,
                to,
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
    fn test_bridge_wrapped_token_fails_when_paused() {
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

        // Create test wrapped token metadata
        let partial_token_metadata = PartialTokenMetadata {
            name: "Test Token".to_string(),
            symbol: "TEST".to_string(),
            remote_token: [1u8; 20],
            scaler_exponent: 0,
        };

        // Create wrapped token mint
        let initial_amount = 1_000_000u64;
        let wrapped_mint = create_mock_wrapped_mint(&mut svm, initial_amount, 6, &partial_token_metadata);

        // Create token account for the from user
        let from_token_account = Keypair::new().pubkey();
        create_mock_token_account(
            &mut svm,
            from_token_account,
            wrapped_mint,
            from.pubkey(),
            initial_amount,
        );

        // Create outgoing message account
        let outgoing_message = Keypair::new();

        // Test parameters
        let gas_limit = 1_000_000u64;
        let to = [1u8; 20];
        let amount = 500_000u64;

        // Build the BridgeWrappedToken instruction accounts
        let accounts = accounts::BridgeWrappedToken {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            mint: wrapped_mint,
            from_token_account,
            bridge: bridge_pda,
            outgoing_message: outgoing_message.pubkey(),
            token_program: anchor_spl::token_2022::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeWrappedToken instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeWrappedTokenIx {
                gas_limit,
                to,
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
