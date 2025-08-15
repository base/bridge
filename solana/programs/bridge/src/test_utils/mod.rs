use anchor_lang::{
    prelude::*,
    solana_program::{instruction::Instruction, native_token::LAMPORTS_PER_SOL},
    system_program, InstructionData,
};
use anchor_spl::{
    token_2022::spl_token_2022::{
        extension::{
            metadata_pointer::MetadataPointer, BaseStateWithExtensionsMut, ExtensionType,
            StateWithExtensionsMut,
        },
        state::Mint,
    },
    token_interface::{
        spl_token_2022::{
            solana_program::{program_option::COption, program_pack::Pack},
            state::{Account as TokenAccount, AccountState},
        },
        spl_token_metadata_interface::state::TokenMetadata,
    },
};
use litesvm::LiteSVM;
use solana_account::Account;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_signer::Signer;
use solana_transaction::Transaction;

use crate::{
    accounts,
    common::{
        bridge::{
            BufferConfig, Eip1559Config, GasConfig, GasCostConfig, PartnerOracleConfig,
            ProtocolConfig,
        },
        PartialTokenMetadata, BRIDGE_SEED, ORACLE_SIGNERS_SEED, WRAPPED_TOKEN_SEED,
    },
    instruction::Initialize,
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

impl GasCostConfig {
    pub fn test_new(gas_fee_receiver: Pubkey) -> Self {
        Self {
            gas_cost_scaler: 1_000_000,
            gas_cost_scaler_dp: 10u64.pow(6),
            gas_fee_receiver,
        }
    }
}

impl GasConfig {
    pub fn test_new() -> Self {
        Self {
            gas_per_call: 100_000,
        }
    }
}

impl ProtocolConfig {
    pub fn test_new() -> Self {
        Self {
            block_interval_requirement: 300,
        }
    }
}

impl BufferConfig {
    pub fn test_new() -> Self {
        Self {
            max_call_buffer_size: 8 * 1024, // 8KB
        }
    }
}

pub fn setup_bridge_and_svm() -> (LiteSVM, solana_keypair::Keypair, Pubkey) {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(ID, "../../target/deploy/bridge.so")
        .unwrap();

    // Create test accounts
    let payer = Keypair::new();
    let payer_pk = payer.pubkey();
    svm.airdrop(&payer_pk, LAMPORTS_PER_SOL * 10).unwrap();

    // Mock the clock
    let timestamp = 1747440000; // May 16th, 2025
    mock_clock(&mut svm, timestamp);

    // Find the Bridge PDA
    let bridge_pda = Pubkey::find_program_address(&[BRIDGE_SEED], &ID).0;

    // Initialize the bridge first
    let guardian = Keypair::new();
    let accounts = accounts::Initialize {
        payer: payer_pk,
        bridge: bridge_pda,
        guardian: guardian.pubkey(),
        oracle_signers: Pubkey::find_program_address(&[ORACLE_SIGNERS_SEED], &ID).0,
        system_program: system_program::ID,
    }
    .to_account_metas(None);

    let ix = Instruction {
        program_id: ID,
        accounts,
        data: Initialize {
            eip1559_config: Eip1559Config::test_new(),
            gas_cost_config: GasCostConfig::test_new(TEST_GAS_FEE_RECEIVER),
            gas_config: GasConfig::test_new(),
            protocol_config: ProtocolConfig::test_new(),
            buffer_config: BufferConfig::test_new(),
            partner_oracle_config: PartnerOracleConfig::default(),
        }
        .data(),
    };

    let tx = Transaction::new(
        &[&payer, &guardian],
        Message::new(&[ix], Some(&payer_pk)),
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx).unwrap();

    (svm, payer, bridge_pda)
}

pub fn mock_clock(svm: &mut LiteSVM, timestamp: i64) {
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = timestamp;
    svm.set_sysvar::<Clock>(&clock);
}

pub fn create_mock_mint(svm: &mut LiteSVM, mint: Pubkey, decimals: u8, token_program: Pubkey) {
    let mut mint_data = vec![0u8; 82]; // Mint account size
    Mint {
        mint_authority: COption::Some(mint),
        supply: 1_000_000 * 10_u64.pow(decimals as u32),
        decimals,
        is_initialized: true,
        freeze_authority: COption::None,
    }
    .pack_into_slice(&mut mint_data);

    svm.set_account(
        mint,
        Account {
            lamports: 0,
            data: mint_data,
            owner: token_program,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}

pub fn create_mock_token_account(
    svm: &mut LiteSVM,
    token_account: Pubkey,
    mint: Pubkey,
    owner: Pubkey,
    amount: u64,
) {
    // Create token account data (SPL Token Account layout)
    let mut token_account_data = vec![0u8; 165]; // Token account size
    TokenAccount {
        mint,
        owner,
        amount,
        delegate: COption::None,
        state: AccountState::Initialized,
        is_native: COption::None,
        delegated_amount: 0,
        close_authority: COption::None,
    }
    .pack_into_slice(&mut token_account_data);

    svm.set_account(
        token_account,
        Account {
            lamports: 0,
            data: token_account_data,
            owner: anchor_spl::token_interface::spl_token_2022::ID,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}

pub fn create_mock_wrapped_mint(
    svm: &mut LiteSVM,
    initial_supply: u64,
    decimals: u8,
    partial_token_metadata: &PartialTokenMetadata,
) -> Pubkey {
    let (wrapped_mint, _) = Pubkey::find_program_address(
        &[
            WRAPPED_TOKEN_SEED,
            decimals.to_le_bytes().as_ref(),
            partial_token_metadata.hash().as_ref(),
        ],
        &crate::ID,
    );

    // Calculate account size with both MetadataPointer and the actual metadata
    let mut account_size =
        ExtensionType::try_calculate_account_len::<Mint>(&[ExtensionType::MetadataPointer])
            .unwrap();

    let token_metadata = TokenMetadata::from(partial_token_metadata);
    account_size += token_metadata.tlv_size_of().unwrap();

    let mut mint_data = vec![0u8; account_size];

    let mut mint_with_extension =
        StateWithExtensionsMut::<Mint>::unpack_uninitialized(&mut mint_data[..]).unwrap();

    // Initialize the metadata pointer extension
    let metadata_pointer = mint_with_extension
        .init_extension::<MetadataPointer>(false)
        .unwrap();

    metadata_pointer.authority = Some(wrapped_mint).try_into().unwrap();
    metadata_pointer.metadata_address = Some(wrapped_mint).try_into().unwrap();

    // Initialize the token metadata extension
    mint_with_extension
        .init_variable_len_extension(&token_metadata, false)
        .unwrap();

    // Initialize the mint account
    mint_with_extension.base = Mint {
        mint_authority: COption::Some(wrapped_mint),
        supply: initial_supply,
        decimals,
        is_initialized: true,
        freeze_authority: COption::None,
    };
    mint_with_extension.pack_base();
    mint_with_extension.init_account_type().unwrap();

    svm.set_account(
        wrapped_mint,
        Account {
            lamports: 100 * LAMPORTS_PER_SOL,
            data: mint_data,
            owner: anchor_spl::token_2022::ID,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();

    wrapped_mint
}
