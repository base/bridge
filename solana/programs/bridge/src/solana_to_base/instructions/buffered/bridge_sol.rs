use anchor_lang::prelude::*;

use crate::{
    common::{bridge::Bridge, BRIDGE_SEED, SOL_VAULT_SEED},
    solana_to_base::{
        internal::bridge_sol::bridge_sol_internal, Call, CallBuffer, OutgoingMessage,
        GAS_FEE_RECEIVER,
    },
};

/// Accounts struct for the bridge_sol_with_buffered_call instruction that transfers native SOL
/// from Solana to Base along with a call (read from a call buffer account) to execute on Base.
///
/// The bridged SOLs are locked in a vault on Solana and an outgoing message is created to mint
/// the corresponding tokens and execute the call on Base. The call buffer account is closed and
/// rent returned to the owner.
#[derive(Accounts)]
#[instruction(_gas_limit: u64, _to: [u8; 20], remote_token: [u8; 20])]
pub struct BridgeSolWithBufferedCall<'info> {
    /// The account that pays for transaction fees and account creation.
    /// Must be mutable to deduct lamports for account rent and gas fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The account that owns the SOL tokens being bridged.
    /// Must sign the transaction to authorize the transfer of their SOL.
    #[account(mut)]
    pub from: Signer<'info>,

    /// The hardcoded account that receives gas fees for cross-chain operations.
    /// - Must match the predefined GAS_FEE_RECEIVER address
    /// - Mutable to receive gas fee payments
    ///
    /// CHECK: This account is validated at runtime to match bridge.gas_config.gas_fee_receiver
    #[account(mut)]
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

    /// The owner of the call buffer who will receive the rent refund.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// The call buffer account that stores the call data.
    /// This account will be closed and rent returned to the owner.
    #[account(
        mut,
        close = owner,
        has_one = owner @ BridgeSolWithBufferedCallError::Unauthorized,
    )]
    pub call_buffer: Account<'info, CallBuffer>,

    /// The outgoing message account that stores the cross-chain transfer details.
    #[account(init, payer = payer, space = 8 + OutgoingMessage::space(Some(call_buffer.data.len())))]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// System program required for SOL transfers and account creation.
    pub system_program: Program<'info, System>,
}

pub fn bridge_sol_with_buffered_call_handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, BridgeSolWithBufferedCall<'info>>,
    gas_limit: u64,
    to: [u8; 20],
    remote_token: [u8; 20],
    amount: u64,
) -> Result<()> {
    // Validate gas fee receiver matches bridge configuration
    require!(
        ctx.accounts.gas_fee_receiver.key() == ctx.accounts.bridge.gas_config.gas_fee_receiver,
        BridgeSolWithBufferedCallError::IncorrectGasFeeReceiver
    );

    let call_buffer = &ctx.accounts.call_buffer;
    let call = Some(Call {
        ty: call_buffer.ty,
        to: call_buffer.to,
        value: call_buffer.value,
        data: call_buffer.data.clone(),
    });

    bridge_sol_internal(
        &ctx.accounts.payer,
        &ctx.accounts.from,
        &ctx.accounts.gas_fee_receiver,
        &ctx.accounts.sol_vault,
        &mut ctx.accounts.bridge,
        &mut ctx.accounts.outgoing_message,
        &ctx.accounts.system_program,
        gas_limit,
        to,
        remote_token,
        amount,
        call,
    )
}

#[error_code]
pub enum BridgeSolWithBufferedCallError {
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,
    #[msg("Only the owner can close this call buffer")]
    Unauthorized,
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
        instruction::{
            BridgeSolWithBufferedCall as BridgeSolWithBufferedCallIx, InitializeCallBuffer,
        },
        solana_to_base::{CallType, GAS_FEE_RECEIVER, NATIVE_SOL_PUBKEY},
        test_utils::setup_bridge_and_svm,
        ID,
    };

    #[test]
    fn test_bridge_sol_with_buffered_call_success() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL * 5).unwrap();

        // Create owner account (who owns the call buffer)
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Airdrop to gas fee receiver
        svm.airdrop(&GAS_FEE_RECEIVER, LAMPORTS_PER_SOL).unwrap();

        // Create call buffer account
        let call_buffer = Keypair::new();

        // Test parameters
        let gas_limit = 1_000_000u64;
        let to = [1u8; 20];
        let remote_token = [2u8; 20];
        let amount = LAMPORTS_PER_SOL;

        // Create test call data
        let call_ty = CallType::Call;
        let call_to = [3u8; 20];
        let call_value = 200u128;
        let call_data = vec![0x11, 0x22, 0x33, 0x44];
        let max_data_len = 1024;

        // First, initialize the call buffer
        let init_accounts = accounts::InitializeCallBuffer {
            payer: owner.pubkey(),
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

        // Now create the bridge_sol_with_buffered_call instruction
        let outgoing_message = Keypair::new();

        // Find SOL vault PDA
        let sol_vault =
            Pubkey::find_program_address(&[SOL_VAULT_SEED, remote_token.as_ref()], &ID).0;

        // Build the BridgeSolWithBufferedCall instruction accounts
        let accounts = accounts::BridgeSolWithBufferedCall {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: GAS_FEE_RECEIVER,
            sol_vault,
            bridge: bridge_pda,
            owner: owner.pubkey(),
            call_buffer: call_buffer.pubkey(),
            outgoing_message: outgoing_message.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeSolWithBufferedCall instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeSolWithBufferedCallIx {
                gas_limit,
                to,
                remote_token,
                amount,
            }
            .data(),
        };

        // Build the transaction
        let tx = Transaction::new(
            &[&payer, &from, &owner, &outgoing_message],
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
            .expect("Failed to send bridge_sol_with_buffered_call transaction");

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

        // Verify the message content matches the call buffer data
        match outgoing_message_data.message {
            crate::solana_to_base::Message::Transfer(transfer) => {
                assert_eq!(transfer.to, to);
                assert_eq!(transfer.local_token, NATIVE_SOL_PUBKEY);
                assert_eq!(transfer.remote_token, remote_token);
                assert_eq!(transfer.amount, amount);

                let transfer_call = transfer.call.expect("Expected call to be present");
                assert_eq!(transfer_call.ty, call_ty);
                assert_eq!(transfer_call.to, call_to);
                assert_eq!(transfer_call.value, call_value);
                assert_eq!(transfer_call.data, call_data);
            }
            _ => panic!("Expected Transfer message"),
        }

        // Verify SOL was transferred from user to vault
        let from_final_balance = svm.get_account(&from.pubkey()).unwrap().lamports;
        let vault_final_balance = svm.get_account(&sol_vault).unwrap().lamports;

        assert_eq!(from_final_balance, from_initial_balance - amount);
        assert_eq!(vault_final_balance, vault_initial_balance + amount);

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
        assert_eq!(bridge_data.nonce, 2);
    }

    #[test]
    fn test_bridge_sol_with_buffered_call_unauthorized() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

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

        // Airdrop to gas fee receiver
        svm.airdrop(&GAS_FEE_RECEIVER, LAMPORTS_PER_SOL).unwrap();

        // Create call buffer account
        let call_buffer = Keypair::new();

        // First, initialize the call buffer with owner
        let init_accounts = accounts::InitializeCallBuffer {
            payer: owner.pubkey(),
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

        // Now try to use bridge_sol_with_buffered_call with unauthorized account as owner
        let outgoing_message = Keypair::new();
        let gas_limit = 1_000_000u64;
        let to = [1u8; 20];
        let remote_token = [2u8; 20];
        let amount = LAMPORTS_PER_SOL;

        // Find SOL vault PDA
        let sol_vault =
            Pubkey::find_program_address(&[SOL_VAULT_SEED, remote_token.as_ref()], &ID).0;

        // Build the BridgeSolWithBufferedCall instruction accounts with unauthorized owner
        let accounts = accounts::BridgeSolWithBufferedCall {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: GAS_FEE_RECEIVER,
            sol_vault,
            bridge: bridge_pda,
            owner: unauthorized.pubkey(), // Wrong owner
            call_buffer: call_buffer.pubkey(),
            outgoing_message: outgoing_message.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeSolWithBufferedCall instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeSolWithBufferedCallIx {
                gas_limit,
                to,
                remote_token,
                amount,
            }
            .data(),
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
    fn test_bridge_sol_with_buffered_call_incorrect_gas_fee_receiver() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Create from account
        let from = Keypair::new();
        svm.airdrop(&from.pubkey(), LAMPORTS_PER_SOL * 5).unwrap();

        // Create owner account
        let owner = Keypair::new();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Create wrong gas fee receiver
        let wrong_gas_fee_receiver = Keypair::new();
        svm.airdrop(&wrong_gas_fee_receiver.pubkey(), LAMPORTS_PER_SOL)
            .unwrap();

        // Create call buffer account
        let call_buffer = Keypair::new();

        // Initialize the call buffer
        let init_accounts = accounts::InitializeCallBuffer {
            payer: owner.pubkey(),
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

        // Now try bridge_sol_with_buffered_call with wrong gas fee receiver
        let outgoing_message = Keypair::new();
        let gas_limit = 1_000_000u64;
        let to = [1u8; 20];
        let remote_token = [2u8; 20];
        let amount = LAMPORTS_PER_SOL;

        // Find SOL vault PDA
        let sol_vault =
            Pubkey::find_program_address(&[SOL_VAULT_SEED, remote_token.as_ref()], &ID).0;

        // Build the BridgeSolWithBufferedCall instruction accounts with wrong gas fee receiver
        let accounts = accounts::BridgeSolWithBufferedCall {
            payer: payer.pubkey(),
            from: from.pubkey(),
            gas_fee_receiver: wrong_gas_fee_receiver.pubkey(), // Wrong receiver
            sol_vault,
            bridge: bridge_pda,
            owner: owner.pubkey(),
            call_buffer: call_buffer.pubkey(),
            outgoing_message: outgoing_message.pubkey(),
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        // Build the BridgeSolWithBufferedCall instruction
        let ix = Instruction {
            program_id: ID,
            accounts,
            data: BridgeSolWithBufferedCallIx {
                gas_limit,
                to,
                remote_token,
                amount,
            }
            .data(),
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
