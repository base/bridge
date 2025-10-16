use anchor_lang::{
    prelude::*,
    solana_program::{instruction::Instruction, native_token::LAMPORTS_PER_SOL},
    system_program, InstructionData,
};
use litesvm::LiteSVM;
use solana_feature_set::FeatureSet;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;

use crate::{
    accounts,
    constants::CFG_SEED,
    instruction::Initialize,
    internal::{Eip1559Config, GasConfig},
    ID,
};

pub const TEST_GAS_FEE_RECEIVER: Pubkey = pubkey!("eEwCrQLBdQchykrkYitkYUZskd7MPrU2YxBXcPDPnMt");

impl Eip1559Config {
    pub fn test_new() -> Self {
        Self {
            target: 5_000_000,
            denominator: 2,
            window_duration_seconds: 1,
            minimum_base_fee: 1,
        }
    }
}

impl GasConfig {
    pub fn test_new(gas_fee_receiver: Pubkey) -> Self {
        Self {
            min_gas_limit_per_message: 100_000,
            max_gas_limit_per_message: 100_000_000,
            gas_cost_scaler: 1_000_000,
            gas_cost_scaler_dp: 10u64.pow(6),
            gas_fee_receiver,
        }
    }
}

/// Result from deploying the base_relayer program without initializing it
pub struct DeployRelayerResult {
    pub svm: LiteSVM,
    pub payer: Keypair,
    pub guardian: Keypair,
    pub cfg_pda: Pubkey,
    pub program_data_pda: Pubkey,
}

/// Deploys the base_relayer program as upgradeable but does NOT initialize it.
/// Use this when you want to test the initialize instruction itself.
pub fn deploy_relayer() -> DeployRelayerResult {
    let mut feature_set = FeatureSet::all_enabled();
    feature_set.deactivate(&solana_feature_set::disable_new_loader_v3_deployments::id());

    let mut svm = LiteSVM::default()
        .with_feature_set(feature_set)
        .with_builtins()
        .with_lamports(1_000_000_000_000_000)
        .with_sysvars();

    // Create test accounts
    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), LAMPORTS_PER_SOL * 100)
        .unwrap();

    let guardian = Keypair::new();
    svm.airdrop(&guardian.pubkey(), LAMPORTS_PER_SOL * 100)
        .unwrap();

    // Deploy upgradeable program
    let program_kp_json = include_str!("../../../../keypairs/base-relayer.devnet.alpha.json");
    let program_kp_bytes: Vec<u8> = serde_json::from_str(program_kp_json).unwrap();
    let program_kp = Keypair::from_bytes(&program_kp_bytes).unwrap();

    let program_bytes = include_bytes!("../../../../target/deploy/base_relayer.so");
    litesvm_loader::deploy_upgradeable_program(&mut svm, &payer, &program_kp, program_bytes)
        .unwrap();

    // Mock the clock
    mock_clock(&mut svm, 1747440000); // May 16th, 2025

    // Find PDAs
    let cfg_pda = Pubkey::find_program_address(&[CFG_SEED], &ID).0;
    let (program_data_pda, _) = Pubkey::find_program_address(
        &[ID.as_ref()],
        &anchor_lang::solana_program::bpf_loader_upgradeable::ID,
    );

    DeployRelayerResult {
        svm,
        payer,
        guardian,
        cfg_pda,
        program_data_pda,
    }
}

/// Result from setting up a fully initialized base_relayer
pub struct SetupRelayerResult {
    pub svm: LiteSVM,
    pub payer: Keypair,
    pub guardian: Keypair,
    pub cfg_pda: Pubkey,
}

/// Deploys the base_relayer program AND initializes it with default test config.
/// Use this for most tests that need a ready-to-use relayer.
pub fn setup_relayer() -> SetupRelayerResult {
    let DeployRelayerResult {
        mut svm,
        payer,
        guardian,
        cfg_pda,
        program_data_pda,
    } = deploy_relayer();

    let payer_pk = payer.pubkey();
    let guardian_pk = guardian.pubkey();

    // Initialize the relayer
    let accounts = accounts::Initialize {
        upgrade_authority: payer_pk,
        payer: payer_pk,
        cfg: cfg_pda,
        program_data: program_data_pda,
        program: ID,
        system_program: system_program::ID,
    }
    .to_account_metas(None);

    let ix = Instruction {
        program_id: ID,
        accounts,
        data: Initialize {
            new_guardian: guardian_pk,
            eip1559_config: Eip1559Config::test_new(),
            gas_config: GasConfig::test_new(TEST_GAS_FEE_RECEIVER),
        }
        .data(),
    };

    let tx = Transaction::new(
        &[&payer],
        Message::new(&[ix], Some(&payer_pk)),
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx).unwrap();

    SetupRelayerResult {
        svm,
        payer,
        guardian,
        cfg_pda,
    }
}

pub fn mock_clock(svm: &mut LiteSVM, timestamp: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = timestamp;
    svm.set_sysvar::<Clock>(&clock);
}
