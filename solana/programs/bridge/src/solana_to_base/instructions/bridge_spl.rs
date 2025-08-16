use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{
    common::{bridge::Bridge, BRIDGE_SEED, TOKEN_VAULT_SEED},
    solana_to_base::{internal::bridge_spl::bridge_spl_internal, Call, OutgoingMessage},
};

/// Accounts struct for the bridge_spl instruction that transfers SPL tokens from Solana to Base along
/// with an optional call that can be executed on Base.
///
/// This instruction locks SPL tokens in a vault on Solana and creates an outgoing message
/// to mint corresponding tokens and execute the optional call on Base. If the token charges
/// transfer fees, the outgoing message records the net amount actually received by the vault.
#[derive(Accounts)]
#[instruction(_to: [u8; 20], remote_token: [u8; 20], _amount: u64, call: Option<Call>)]
pub struct BridgeSpl<'info> {
    /// The account that pays for transaction fees and account creation.
    /// Must be mutable to deduct lamports for gas fees and new account rent.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The token authority authorizing the transfer of SPL tokens.
    /// This signer must be the owner or an approved delegate for the source token account.
    #[account(mut)]
    pub from: Signer<'info>,

    /// The account that receives payment for the gas costs of bridging the SPL token to Base.
    /// CHECK: This account is validated to be the same as bridge.gas_config.gas_fee_receiver
    #[account(mut, address = bridge.gas_config.gas_fee_receiver @ BridgeSplError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    /// The SPL token mint account for the token being bridged.
    /// - Must not be a wrapped token (wrapped tokens use bridge_wrapped_token)
    /// - Used to read token decimals and validate it is not a wrapped token
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The user's token account containing the SPL tokens to be bridged.
    /// - Must be owned by, or delegated to, the `from` signer (transfer authority)
    /// - Tokens will be transferred from this account to the token vault
    #[account(mut)]
    pub from_token_account: InterfaceAccount<'info, TokenAccount>,

    /// The main bridge state account containing global bridge configuration.
    /// - PDA with BRIDGE_SEED for deterministic address
    /// - Tracks nonce for message ordering and EIP-1559 gas pricing
    /// - Nonce is incremented after successful bridge operations
    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    /// The token vault account that holds locked SPL tokens during the bridge process.
    /// - PDA derived from TOKEN_VAULT_SEED, mint pubkey, and remote_token address
    /// - Created if it doesn't exist for this mint/remote_token pair
    /// - Token account authority is set to this vault PDA; the program signs using the PDA seeds
    /// - Acts as the custody account for tokens being bridged to Base
    #[account(
        init_if_needed,
        payer = payer,
        seeds = [TOKEN_VAULT_SEED, mint.key().as_ref(), remote_token.as_ref()],
        bump,
        token::mint = mint,
        token::authority = token_vault
    )]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,

    /// The outgoing message account that represents this bridge operation.
    /// - Contains transfer details and optional call data for the destination chain
    /// - Space is calculated based on the size of optional call data
    /// - Used by relayers to execute the bridge operation on Base
    /// - The recorded transfer amount equals the net increase in `token_vault` balance
    #[account(
        init,
        payer = payer,
        space = 8 + OutgoingMessage::space(call.as_ref().map(|c| c.data.len())),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// The SPL Token program interface for executing token transfers.
    /// Used for the transfer_checked operation to move tokens to the vault.
    pub token_program: Interface<'info, TokenInterface>,

    /// System program required for creating the outgoing message account and
    /// initializing the token vault when needed.
    pub system_program: Program<'info, System>,
}

pub fn bridge_spl_handler(
    ctx: Context<BridgeSpl>,
    to: [u8; 20],
    remote_token: [u8; 20],
    amount: u64,
    call: Option<Call>,
) -> Result<()> {
    // Check if bridge is paused
    require!(!ctx.accounts.bridge.paused, BridgeSplError::BridgePaused);

    bridge_spl_internal(
        &ctx.accounts.payer,
        &ctx.accounts.from,
        &ctx.accounts.gas_fee_receiver,
        &ctx.accounts.mint,
        &ctx.accounts.from_token_account,
        &mut ctx.accounts.bridge,
        &mut ctx.accounts.token_vault,
        &mut ctx.accounts.outgoing_message,
        &ctx.accounts.token_program,
        &ctx.accounts.system_program,
        to,
        remote_token,
        amount,
        call,
    )
}

#[error_code]
pub enum BridgeSplError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
    #[msg("Mint is a wrapped token")]
    MintIsWrappedToken,
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
        common::{bridge::Bridge, TOKEN_VAULT_SEED},
        instruction::BridgeSpl as BridgeSplIx,
        solana_to_base::{Call, CallType},
        test_utils::{
            create_mock_mint, create_mock_token_account, setup_bridge_and_svm,
            TEST_GAS_FEE_RECEIVER,
        },
        ID,
    };

    #[test]
    fn test_bridge_spl_success_without_call() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL * 5).unwrap();

        // Create a test SPL token mint
        let mint = Keypair::new().pubkey();
        create_mock_mint(
            &mut svm,
            mint,
            6,
            anchor_spl::token_interface::spl_token_2022::ID,
        );

        // Create token account for the from user
        let from_token_account = Keypair::new().pubkey();
        let initial_amount = 1_000_000u64; // 1 token with 6 decimals
        create_mock_token_account(
            &mut svm,
            from_token_account,
            mint,
            from.pubkey(),
            initial_amount,
        );

        // Create outgoing message account
        let outgoing_message = Keypair::new();

        // Test parameters
        let to = [1u8; 20]; // Base address
        let remote_token = [2u8; 20]; // Remote token address
        let amount = 500_000u64; // 0.5 tokens

        // Find token vault PDA
        let token_vault = Pubkey::find_program_address(
            &[TOKEN_VAULT_SEED, mint.as_ref(), remote_token.as_ref()],
            &ID,
        )
        .0;

        // Build the BridgeSpl instruction accounts
        let accounts = accounts::BridgeSpl {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            mint,
            from_token_account,
            bridge: bridge_pda,
            token_vault,
            outgoing_message: outgoing_message.pubkey(),
            token_program: anchor_spl::token_interface::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeSpl instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeSplIx {
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

        // Send the transaction
        svm.send_transaction(tx)
            .expect("Failed to send bridge_spl transaction");

        // Verify the OutgoingMessage account was created correctly
        let outgoing_message_account = svm.get_account(&outgoing_message.pubkey()).unwrap();
        assert_eq!(outgoing_message_account.owner, ID);

        let outgoing_message_data =
            OutgoingMessage::try_deserialize(&mut &outgoing_message_account.data[..]).unwrap();

        // Verify the message fields
        assert_eq!(outgoing_message_data.nonce, 0);
        assert_eq!(outgoing_message_data.sender, from.pubkey());

        // Verify the message content
        match outgoing_message_data.message {
            crate::solana_to_base::Message::Transfer(transfer) => {
                assert_eq!(transfer.to, to);
                assert_eq!(transfer.local_token, mint);
                assert_eq!(transfer.remote_token, remote_token);
                assert_eq!(transfer.amount, amount);
                assert!(transfer.call.is_none());
            }
            _ => panic!("Expected Transfer message"),
        }

        // Verify tokens were transferred from user to vault
        let from_final_balance = svm.get_account(&from_token_account).unwrap();
        let from_final_amount = TokenAccount::try_deserialize(&mut &from_final_balance.data[..])
            .unwrap()
            .amount;
        assert_eq!(from_final_amount, initial_amount - amount);

        let vault_balance = svm.get_account(&token_vault).unwrap();
        let vault_amount = TokenAccount::try_deserialize(&mut &vault_balance.data[..])
            .unwrap()
            .amount;
        assert_eq!(vault_amount, amount);

        // Verify bridge nonce was incremented
        let bridge_account = svm.get_account(&bridge_pda).unwrap();
        let bridge_data = Bridge::try_deserialize(&mut &bridge_account.data[..]).unwrap();
        assert_eq!(bridge_data.nonce, 1);
    }

    #[test]
    fn test_bridge_spl_success_with_call() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL * 5).unwrap();

        // Create a test SPL token mint
        let mint = Keypair::new().pubkey();
        create_mock_mint(
            &mut svm,
            mint,
            6,
            anchor_spl::token_interface::spl_token_2022::ID,
        );

        // Create token account for the from user
        let from_token_account = Keypair::new().pubkey();
        let initial_amount = 1_000_000u64;
        create_mock_token_account(
            &mut svm,
            from_token_account,
            mint,
            from.pubkey(),
            initial_amount,
        );

        // Create outgoing message account
        let outgoing_message = Keypair::new();

        // Test parameters
        let to = [1u8; 20];
        let remote_token = [2u8; 20];
        let amount = 250_000u64; // 0.25 tokens

        // Create test call data
        let call = Call {
            ty: CallType::Call,
            to: [3u8; 20],
            value: 100,
            data: vec![0xaa, 0xbb, 0xcc, 0xdd],
        };

        // Find token vault PDA
        let token_vault = Pubkey::find_program_address(
            &[TOKEN_VAULT_SEED, mint.as_ref(), remote_token.as_ref()],
            &ID,
        )
        .0;

        // Build the BridgeSpl instruction accounts
        let accounts = accounts::BridgeSpl {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            mint,
            from_token_account,
            bridge: bridge_pda,
            token_vault,
            outgoing_message: outgoing_message.pubkey(),
            token_program: anchor_spl::token_interface::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeSpl instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeSplIx {
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
            .expect("Failed to send bridge_spl transaction with call");

        // Verify the OutgoingMessage account was created correctly
        let outgoing_message_account = svm.get_account(&outgoing_message.pubkey()).unwrap();
        let outgoing_message_data =
            OutgoingMessage::try_deserialize(&mut &outgoing_message_account.data[..]).unwrap();

        // Verify the message content including call
        match outgoing_message_data.message {
            crate::solana_to_base::Message::Transfer(transfer) => {
                assert_eq!(transfer.to, to);
                assert_eq!(transfer.local_token, mint);
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
    fn test_bridge_spl_incorrect_gas_fee_receiver() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL * 5).unwrap();

        // Create wrong gas fee receiver
        let wrong_gas_fee_receiver = Keypair::new();

        // Create a test SPL token mint
        let mint = Keypair::new().pubkey();
        create_mock_mint(
            &mut svm,
            mint,
            6,
            anchor_spl::token_interface::spl_token_2022::ID,
        );

        // Create token account for the from user
        let from_token_account = Keypair::new().pubkey();
        let initial_amount = 1_000_000u64;
        create_mock_token_account(
            &mut svm,
            from_token_account,
            mint,
            from.pubkey(),
            initial_amount,
        );

        // Create outgoing message account
        let outgoing_message = Keypair::new();

        // Test parameters
        let to = [1u8; 20];
        let remote_token = [2u8; 20];
        let amount = 500_000u64;

        // Find token vault PDA
        let token_vault = Pubkey::find_program_address(
            &[TOKEN_VAULT_SEED, mint.as_ref(), remote_token.as_ref()],
            &ID,
        )
        .0;

        // Build the BridgeSpl instruction accounts with wrong gas fee receiver
        let accounts = accounts::BridgeSpl {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: wrong_gas_fee_receiver.pubkey(), // Wrong receiver
            mint,
            from_token_account,
            bridge: bridge_pda,
            token_vault,
            outgoing_message: outgoing_message.pubkey(),
            token_program: anchor_spl::token_interface::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeSpl instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeSplIx {
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
    fn test_bridge_spl_fails_when_paused() {
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

        // Create a test SPL token mint
        let mint = Keypair::new().pubkey();
        create_mock_mint(
            &mut svm,
            mint,
            6,
            anchor_spl::token_interface::spl_token_2022::ID,
        );

        // Create token account for the from user
        let from_token_account = Keypair::new().pubkey();
        let initial_amount = 1_000_000u64;
        create_mock_token_account(
            &mut svm,
            from_token_account,
            mint,
            from.pubkey(),
            initial_amount,
        );

        // Create outgoing message account
        let outgoing_message = Keypair::new();

        // Test parameters
        let to = [1u8; 20];
        let remote_token = [2u8; 20];
        let amount = 500_000u64;

        // Find token vault PDA
        let token_vault = Pubkey::find_program_address(
            &[TOKEN_VAULT_SEED, mint.as_ref(), remote_token.as_ref()],
            &ID,
        )
        .0;

        // Build the BridgeSpl instruction accounts
        let accounts = accounts::BridgeSpl {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            from_token_account,
            token_vault,
            mint,
            bridge: bridge_pda,
            outgoing_message: outgoing_message.pubkey(),
            token_program: anchor_spl::token_interface::spl_token_2022::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeSpl instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeSplIx {
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
