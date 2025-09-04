use anchor_lang::{
    prelude::*,
    solana_program::{instruction::Instruction, native_token::LAMPORTS_PER_SOL},
    system_program, InstructionData,
};
use litesvm::LiteSVM;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;

use crate::{
    accounts,
    constants::CFG_SEED,
    instruction::Initialize,
    internal::{Eip1559, Eip1559Config, GasConfig},
    state::Cfg,
    ID,
};
pub const TEST_GAS_FEE_RECEIVER: Pubkey = pubkey!("eEwCrQLBdQchykrkYitkYUZskd7MPrU2YxBXcPDPnMt");

impl Eip1559 {
    pub fn test_new() -> Self {
        Self {
            config: Eip1559Config {
                target: 5_000_000,
                denominator: 2,
                window_duration_seconds: 1,
                minimum_base_fee: 1,
            },
            current_base_fee: 100,
            current_window_gas_used: 0,
            window_start_time: 1747440000,
        }
    }
}

impl GasConfig {
    pub fn test_new(gas_fee_receiver: Pubkey) -> Self {
        Self {
            max_gas_limit_per_message: 100_000_000,
            gas_cost_scaler: 1_000_000,
            gas_cost_scaler_dp: 10u64.pow(6),
            gas_fee_receiver,
        }
    }
}

pub fn setup_program_and_svm() -> (
    LiteSVM,
    solana_keypair::Keypair,
    solana_keypair::Keypair,
    Pubkey,
) {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(ID, "../../target/deploy/base_relayer.so")
        .unwrap();

    // Create test accounts
    let payer = Keypair::new();
    let payer_pk = payer.pubkey();
    svm.airdrop(&payer_pk, LAMPORTS_PER_SOL * 10).unwrap();

    // Mock the clock
    let timestamp = 1747440000; // May 16th, 2025
    mock_clock(&mut svm, timestamp);

    // Find the Bridge PDA
    let config_pda = Pubkey::find_program_address(&[CFG_SEED], &ID).0;

    // Initialize the bridge first
    let guardian = Keypair::new();
    let accounts = accounts::Initialize {
        payer: payer_pk,
        cfg: config_pda,
        guardian: guardian.pubkey(),
        system_program: system_program::ID,
    }
    .to_account_metas(None);

    let ix = Instruction {
        program_id: ID,
        accounts,
        data: Initialize {
            cfg: Cfg {
                guardian: guardian.pubkey(),
                eip1559: Eip1559::test_new(),
                gas_config: GasConfig::test_new(TEST_GAS_FEE_RECEIVER),
            },
        }
        .data(),
    };

    let tx = Transaction::new(
        &[&payer, &guardian],
        Message::new(&[ix], Some(&payer_pk)),
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx).unwrap();

    (svm, payer, guardian, config_pda)
}

pub fn mock_clock(svm: &mut LiteSVM, timestamp: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = timestamp;
    svm.set_sysvar::<Clock>(&clock);
}
