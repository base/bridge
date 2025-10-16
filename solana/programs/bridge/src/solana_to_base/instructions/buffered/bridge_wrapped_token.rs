use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{Mint, TokenAccount},
};

use crate::{
    common::{bridge::Bridge, BRIDGE_SEED, DISCRIMINATOR_LEN},
    solana_to_base::{
        internal::bridge_wrapped_token::bridge_wrapped_token_internal, Call, CallBuffer,
        OutgoingMessage, Transfer, OUTGOING_MESSAGE_SEED,
    },
    BridgeError,
};

/// Accounts for bridging wrapped tokens from Solana to Base with a buffered call.
///
/// The wrapped tokens are burned from the user's token account on Solana and an outgoing
/// message is created to transfer the equivalent tokens and execute the call on Base. The
/// call buffer account is consumed (closed) and its rent is returned to the owner.
#[derive(Accounts)]
#[instruction(outgoing_message_salt: [u8; 32])]
pub struct BridgeWrappedTokenWithBufferedCall<'info> {
    /// The account that pays for transaction fees, gas fees, and outgoing message account creation.
    /// Must be mutable to deduct lamports for account rent and gas fees (sent to `gas_fee_receiver`).
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The token owner who is bridging their wrapped tokens back to Base.
    /// Must sign the transaction to authorize burning their tokens.
    pub from: Signer<'info>,

    /// The account that receives payment for the gas costs of bridging the wrapped token to Base.
    /// Mutable because lamports are transferred to this account.
    /// CHECK: Enforced to match `bridge.gas_config.gas_fee_receiver` by the account constraint.
    #[account(
        mut,
        address = bridge.gas_config.gas_fee_receiver @ BridgeError::IncorrectGasFeeReceiver
    )]
    pub gas_fee_receiver: AccountInfo<'info>,

    /// The wrapped token mint account representing the original Base token.
    /// - Contains metadata linking to the original token on Base
    /// - Supply will be reduced by burning tokens from the user's token account for this mint
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The user's token account holding the wrapped tokens to be bridged.
    /// - Must contain sufficient token balance for the bridge amount
    /// - Tokens will be burned from this account
    /// - The burn authority must be the `from` signer (or a valid delegate)
    #[account(mut)]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,

    /// The main bridge state account storing global bridge configuration.
    /// - Uses PDA with `BRIDGE_SEED` for deterministic address
    /// - Tracks `nonce` for message ordering and maintains EIP-1559 fee state
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
        has_one = owner @ BridgeError::BufferUnauthorizedClose,
    )]
    pub call_buffer: Account<'info, CallBuffer>,

    /// The outgoing message account that stores the cross-chain transfer details.
    /// Space is sized based on the current call buffer length so the call data fits.
    #[account(
        init,
        payer = payer,
        seeds = [OUTGOING_MESSAGE_SEED, outgoing_message_salt.as_ref()],
        bump,
        space = DISCRIMINATOR_LEN + OutgoingMessage::space::<Transfer>(call_buffer.data.len()),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// Token2022 program used for burning the wrapped tokens (burn_checked).
    pub token_program: Program<'info, Token2022>,

    /// System program required for creating the outgoing message account and transferring gas fees.
    pub system_program: Program<'info, System>,
}

pub fn bridge_wrapped_token_with_buffered_call_handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, BridgeWrappedTokenWithBufferedCall<'info>>,
    _outgoing_message_salt: [u8; 32],
    to: [u8; 20],
    amount: u64,
) -> Result<()> {
    // Check if bridge is paused
    require!(!ctx.accounts.bridge.paused, BridgeError::BridgePaused);

    let call_buffer = &ctx.accounts.call_buffer;
    let call = Some(Call {
        ty: call_buffer.ty,
        to: call_buffer.to,
        value: call_buffer.value,
        data: call_buffer.data.clone(),
    });

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
        to,
        amount,
        call,
    )
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
        instruction::{
            BridgeWrappedTokenWithBufferedCall as BridgeWrappedTokenWithBufferedCallIx,
            InitializeCallBuffer,
        },
        solana_to_base::CallType,
        test_utils::{
            create_mock_token_account, create_mock_wrapped_mint, create_outgoing_message,
            setup_bridge, SetupBridgeResult, TEST_GAS_FEE_RECEIVER,
        },
        ID,
    };

    #[test]
    fn test_bridge_wrapped_token_with_buffered_call_success() {
        let SetupBridgeResult {
            mut svm,
            payer,
            bridge_pda,
            ..
        } = setup_bridge();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL * 5).unwrap();

        // Create owner account (who owns the call buffer)
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Create test wrapped token metadata
        let partial_token_metadata = PartialTokenMetadata {
            name: "Test Token".to_string(),
            symbol: "TEST".to_string(),
            remote_token: [1u8; 20],
            scaler_exponent: 0,
        };

        // Create wrapped token mint
        let initial_amount = 1_000_000u64; // 1 token with 6 decimals
        let wrapped_mint =
            create_mock_wrapped_mint(&mut svm, initial_amount, 6, &partial_token_metadata);

        // Create token account for the from user
        let from_token_account = Keypair::new().pubkey();
        create_mock_token_account(
            &mut svm,
            from_token_account,
            wrapped_mint,
            from.pubkey(),
            initial_amount,
        );

        // Create call buffer account
        let call_buffer = Keypair::new();

        // Test parameters
        let to = [1u8; 20];
        let amount = 500_000u64; // 0.5 tokens

        // Create test call data
        let call_ty = CallType::Call;
        let call_to = [3u8; 20];
        let call_value = 200u128;
        let call_data = vec![0x11, 0x22, 0x33, 0x44];
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

        // Now create the bridge_wrapped_token_with_buffered_call instruction
        let (outgoing_message_salt, outgoing_message) = create_outgoing_message();

        // Build the BridgeWrappedTokenWithBufferedCall instruction accounts
        let accounts = accounts::BridgeWrappedTokenWithBufferedCall {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            mint: wrapped_mint,
            from_token_account,
            bridge: bridge_pda,
            owner: owner.pubkey(),
            call_buffer: call_buffer.pubkey(),
            outgoing_message,
            token_program: anchor_spl::token_2022::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeWrappedTokenWithBufferedCall instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeWrappedTokenWithBufferedCallIx {
                outgoing_message_salt,
                to,
                amount,
            }
            .data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[&payer, &from, &owner],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        // Send the transaction
        svm.send_transaction(tx)
            .expect("Failed to send bridge_wrapped_token_with_buffered_call transaction");

        // Verify the OutgoingMessage account was created correctly
        let outgoing_message_account = svm.get_account(&outgoing_message).unwrap();
        assert_eq!(outgoing_message_account.owner, ID);

        let outgoing_message_data =
            OutgoingMessage::try_deserialize(&mut &outgoing_message_account.data[..]).unwrap();

        // Verify the message fields
        assert_eq!(outgoing_message_data.nonce, 0);
        assert_eq!(outgoing_message_data.sender, from.pubkey());

        // Verify the message content matches the call buffer data
        match outgoing_message_data.message {
            crate::solana_to_base::Message::Transfer(transfer) => {
                assert_eq!(transfer.to, to);
                assert_eq!(transfer.local_token, wrapped_mint);
                assert_eq!(transfer.amount, amount);

                let transfer_call = transfer.call.expect("Expected call to be present");
                assert_eq!(transfer_call.ty, call_ty);
                assert_eq!(transfer_call.to, call_to);
                assert_eq!(transfer_call.value, call_value);
                assert_eq!(transfer_call.data, call_data);
            }
            _ => panic!("Expected Transfer message"),
        }

        // Verify tokens were burned from user account
        let from_final_balance = svm.get_account(&from_token_account).unwrap();
        let from_final_amount = TokenAccount::try_deserialize(&mut &from_final_balance.data[..])
            .unwrap()
            .amount;
        assert_eq!(from_final_amount, initial_amount - amount);

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
    fn test_bridge_wrapped_token_with_buffered_call_unauthorized() {
        let SetupBridgeResult {
            mut svm,
            payer,
            bridge_pda,
            ..
        } = setup_bridge();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL * 5).unwrap();

        // Create owner account (who owns the call buffer)
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Create unauthorized account (not the owner)
        let unauthorized = Keypair::new();
        svm.airdrop(&unauthorized.pubkey(), LAMPORTS_PER_SOL)
            .unwrap();

        // Create test wrapped token metadata
        let partial_token_metadata = PartialTokenMetadata {
            name: "Test Token".to_string(),
            symbol: "TEST".to_string(),
            remote_token: [1u8; 20],
            scaler_exponent: 0,
        };

        // Create wrapped token mint
        let initial_amount = 1_000_000u64; // 1 token with 6 decimals
        let wrapped_mint =
            create_mock_wrapped_mint(&mut svm, initial_amount, 6, &partial_token_metadata);

        // Create token account for the from user
        let from_token_account = Keypair::new().pubkey();
        let initial_amount = 1_000_000u64;
        create_mock_token_account(
            &mut svm,
            from_token_account,
            wrapped_mint,
            from.pubkey(),
            initial_amount,
        );

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

        // Now try to use bridge_wrapped_token_with_buffered_call with unauthorized account as owner
        let (outgoing_message_salt, outgoing_message) = create_outgoing_message();

        let to = [1u8; 20];
        let amount = 500_000u64;

        // Build the BridgeWrappedTokenWithBufferedCall instruction accounts with unauthorized owner
        let accounts = accounts::BridgeWrappedTokenWithBufferedCall {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            mint: wrapped_mint,
            from_token_account,
            bridge: bridge_pda,
            owner: unauthorized.pubkey(), // Wrong owner
            call_buffer: call_buffer.pubkey(),
            outgoing_message,
            token_program: anchor_spl::token_2022::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeWrappedTokenWithBufferedCall instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeWrappedTokenWithBufferedCallIx {
                outgoing_message_salt,
                to,
                amount,
            }
            .data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[&payer, &from, &unauthorized],
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
    fn test_bridge_wrapped_token_with_buffered_call_incorrect_gas_fee_receiver() {
        let SetupBridgeResult {
            mut svm,
            payer,
            bridge_pda,
            ..
        } = setup_bridge();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL * 5).unwrap();

        // Create owner account
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

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
        let wrapped_mint =
            create_mock_wrapped_mint(&mut svm, initial_amount, 6, &partial_token_metadata);

        // Create token account for the from user
        let from_token_account = Keypair::new().pubkey();
        create_mock_token_account(
            &mut svm,
            from_token_account,
            wrapped_mint,
            from.pubkey(),
            initial_amount,
        );

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

        // Now try bridge_wrapped_token_with_buffered_call with wrong gas fee receiver
        let (outgoing_message_salt, outgoing_message) = create_outgoing_message();

        let to = [1u8; 20];
        let amount = 500_000u64;

        // Build the BridgeWrappedTokenWithBufferedCall instruction accounts with wrong gas fee receiver
        let accounts = accounts::BridgeWrappedTokenWithBufferedCall {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: wrong_gas_fee_receiver.pubkey(), // Wrong receiver
            mint: wrapped_mint,
            from_token_account,
            bridge: bridge_pda,
            owner: owner.pubkey(),
            call_buffer: call_buffer.pubkey(),
            outgoing_message,
            token_program: anchor_spl::token_2022::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeWrappedTokenWithBufferedCall instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeWrappedTokenWithBufferedCallIx {
                outgoing_message_salt,
                to,
                amount,
            }
            .data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[&payer, &from, &owner],
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
