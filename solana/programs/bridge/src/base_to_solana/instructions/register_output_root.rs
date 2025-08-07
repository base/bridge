use anchor_lang::prelude::*;

use crate::{
    base_to_solana::{
        constants::{OUTPUT_ROOT_SEED, TRUSTED_ORACLE},
        state::OutputRoot,
    },
    common::{bridge::Bridge, BRIDGE_SEED},
};

/// Accounts struct for the register_output_root instruction that stores Base MMR roots
/// on Solana for cross-chain message verification. This instruction allows a trusted oracle to
/// register output roots from Base at specific block intervals, enabling subsequent message
/// proofs and cross-chain operations.
#[derive(Accounts)]
#[instruction(_output_root: [u8; 32], base_block_number: u64, base_last_relayed_nonce: u64)]
pub struct RegisterOutputRoot<'info> {
    /// The trusted oracle account that submits MMR roots from Base.
    #[account(mut, address = TRUSTED_ORACLE @ RegisterOutputRootError::Unauthorized)]
    pub payer: Signer<'info>,

    // TODO: Uncomment this when we have a trusted validator
    // /// Additional trusted validator that must co-sign output root registrations.
    // /// - Provides additional security by requiring dual authorization
    // /// - Must match TRUSTED_VALIDATOR constant for authorization
    // #[account(address = TRUSTED_VALIDATOR @ RegisterOutputRootError::Unauthorized)]
    // pub validator: Signer<'info>,
    /// The output root account being created to store the Base MMR root.
    /// - Uses PDA with OUTPUT_ROOT_SEED and base_block_number for deterministic address
    /// - Payer (trusted oracle) funds the account creation
    /// - Space allocated for output root state (8-byte discriminator + OutputRoot::INIT_SPACE)
    /// - Each output root corresponds to a specific Base block number
    #[account(
        init,
        payer = payer,
        space = 8 + OutputRoot::INIT_SPACE,
        seeds = [OUTPUT_ROOT_SEED, &base_block_number.to_le_bytes()],
        bump
    )]
    pub root: Account<'info, OutputRoot>,

    /// The main bridge state account that tracks the latest registered Base block number.
    /// - Uses PDA with BRIDGE_SEED for deterministic address  
    /// - Must be mutable to update the base_block_number field
    /// - Ensures output roots are registered in sequential order
    #[account(
        mut,
        seeds = [BRIDGE_SEED],
        bump,
    )]
    pub bridge: Account<'info, Bridge>,

    /// System program required for creating new accounts.
    /// Used internally by Anchor for output root account initialization.
    pub system_program: Program<'info, System>,
}

pub fn register_output_root_handler(
    ctx: Context<RegisterOutputRoot>,
    output_root: [u8; 32],
    base_block_number: u64,
) -> Result<()> {
    // Check if bridge is paused
    require!(
        !ctx.accounts.bridge.paused,
        RegisterOutputRootError::BridgePaused
    );

    require!(
        base_block_number > ctx.accounts.bridge.base_block_number
            && base_block_number
                % ctx
                    .accounts
                    .bridge
                    .protocol_config
                    .block_interval_requirement
                == 0,
        RegisterOutputRootError::IncorrectBlockNumber
    );

    ctx.accounts.root.root = output_root;
    ctx.accounts.bridge.base_block_number = base_block_number;

    Ok(())
}

#[error_code]
pub enum RegisterOutputRootError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("IncorrectBlockNumber")]
    IncorrectBlockNumber,
    #[msg("BridgePaused")]
    BridgePaused,
}

// TODO: Uncomment this when we have a trusted validator
// #[cfg(test)]
// mod tests {
//     use super::*;

//     // Test-only trusted validator constant
//     const TRUSTED_ORACLE_TEST: Pubkey = pubkey!("6FfuqkJTptvr6dCZnyp3tq3M4HkvyTE5DHyvqC537Lqt");
//     const TRUSTED_VALIDATOR_TEST: Pubkey = pubkey!("9n3vTKJ49M4Xk3MhiCZY4LxXAdeEaDMVMuGxDwt54Hgx");
//     use anchor_lang::{
//         solana_program::{
//             example_mocks::solana_sdk::system_program, instruction::Instruction,
//             native_token::LAMPORTS_PER_SOL,
//         },
//         InstructionData,
//     };
//     use anchor_lang::solana_program::instruction::AccountMeta;
//     use litesvm::LiteSVM;
//     use solana_keypair::Keypair;
//     use solana_message::Message;
//     use solana_signer::Signer;
//     use solana_transaction::Transaction;

//     use crate::{
//         accounts, instruction::RegisterOutputRoot, test_utils::mock_clock, ID,
//         common::BRIDGE_SEED,
//     };

//     fn setup_bridge_and_svm() -> (LiteSVM, Keypair, Pubkey) {
//         let mut svm = LiteSVM::new();
//         svm.add_program_from_file(ID, "../../target/deploy/bridge.so")
//             .unwrap();

//         // Create test accounts
//         let payer = Keypair::new();
//         let payer_pk = payer.pubkey();
//         svm.airdrop(&payer_pk, LAMPORTS_PER_SOL * 10).unwrap();

//         // Mock the clock
//         let timestamp = 1747440000; // May 16th, 2025
//         mock_clock(&mut svm, timestamp);

//         // Find the Bridge PDA
//         let bridge_pda = Pubkey::find_program_address(&[BRIDGE_SEED], &ID).0;

//         // Initialize the bridge first
//         let accounts = accounts::Initialize {
//             payer: payer_pk,
//             bridge: bridge_pda,
//             system_program: system_program::ID,
//         }
//         .to_account_metas(None);

//         let ix = Instruction {
//             program_id: ID,
//             accounts,
//             data: crate::instruction::Initialize {}.data(),
//         };

//         let tx = Transaction::new(
//             &[&payer],
//             Message::new(&[ix], Some(&payer_pk)),
//             svm.latest_blockhash(),
//         );

//         svm.send_transaction(tx).unwrap();

//         (svm, payer, bridge_pda)
//     }

//     #[test]
//     fn test_register_output_root_with_trusted_validator() {
//         let (mut svm, _regular_payer, bridge_pda) = setup_bridge_and_svm();

//         // Create test trusted oracle keypair
//         let test_oracle_keypair = Keypair::from_bytes(&[
//             169,46,7,83,108,249,201,221,43,19,226,141,187,150,2,108,88,89,47,87,103,22,105,135,249,146,55,84,129,218,105,66,
//             78,12,144,20,159,189,227,58,36,89,213,181,252,139,164,54,7,39,121,246,107,77,168,231,40,53,10,133,197,117,180,15
//         ]).unwrap();

//         // Create our test trusted validator keypair
//         let test_validator_keypair = Keypair::from_bytes(&[
//             7,203,36,165,34,16,183,13,229,220,44,231,46,32,229,21,245,102,103,75,136,63,19,95,73,20,32,100,117,147,9,50,
//             130,103,239,111,221,79,12,179,120,215,230,145,126,141,29,118,104,180,179,63,226,116,1,101,226,229,190,176,241,235,41,101
//         ]).unwrap();

//         // Verify keypairs match our constants
//         assert_eq!(test_oracle_keypair.pubkey(), TRUSTED_ORACLE_TEST, "Test oracle pubkey must match TRUSTED_ORACLE_TEST constant");
//         assert_eq!(test_validator_keypair.pubkey(), TRUSTED_VALIDATOR_TEST, "Test validator pubkey must match TRUSTED_VALIDATOR_TEST constant");

//         // Airdrop to our test validator
//         svm.airdrop(&test_oracle_keypair.pubkey(), LAMPORTS_PER_SOL * 10).unwrap();
//         svm.airdrop(&test_validator_keypair.pubkey(), LAMPORTS_PER_SOL * 10).unwrap();

//         let output_root = [1u8; 32];
//         let block_number = 300u64;

//         // Find the output root PDA
//         let output_root_pda = Pubkey::find_program_address(
//             &[OUTPUT_ROOT_SEED, &block_number.to_le_bytes()],
//             &ID,
//         ).0;

//         // Build the RegisterOutputRoot instruction using the test validator
//         let accounts = accounts::RegisterOutputRoot {
//             payer: test_oracle_keypair.pubkey(),
//             validator: test_validator_keypair.pubkey(),
//             root: output_root_pda,
//             bridge: bridge_pda,
//             system_program: system_program::ID,
//         }
//         .to_account_metas(None);

//         let ix = Instruction {
//             program_id: ID,
//             accounts,
//             data: RegisterOutputRoot {
//                 output_root,
//                 block_number,
//             }.data(),
//         };

//         let tx = Transaction::new(
//             &[&test_oracle_keypair, &test_validator_keypair],
//             Message::new(&[ix], Some(&test_oracle_keypair.pubkey())),
//             svm.latest_blockhash(),
//         );

//         // Execute the transaction
//         let result = svm.send_transaction(tx);

//         match result {
//             Ok(_) => {
//                 println!("✅ SUCCESS! Trusted validator approach works!");

//                 // Verify the output root was created correctly
//                 let output_root_account = svm.get_account(&output_root_pda).expect("Output root should be created");
//                 assert_eq!(output_root_account.owner, ID);

//                 // Deserialize and verify the output root data
//                 let output_root_data = OutputRoot::try_deserialize(&mut &output_root_account.data[..]).unwrap();
//                 assert_eq!(output_root_data.root, output_root);

//                 // Verify the bridge state was updated
//                 let bridge_account = svm.get_account(&bridge_pda).expect("Bridge should exist");
//                 let bridge_data = Bridge::try_deserialize(&mut &bridge_account.data[..]).unwrap();
//                 assert_eq!(bridge_data.base_block_number, block_number);

//                 println!("✅ Output root PDA created successfully!");
//                 println!("✅ Bridge state updated correctly!");
//             }
//             Err(e) => {
//                 let error_str = format!("{:?}", e);
//                 println!("❌ Transaction failed: {}", error_str);
//                 panic!("Expected transaction to succeed, but got error: {}", error_str);
//             }
//         }
//     }
// }
