use anchor_lang::prelude::*;

use crate::base_to_solana::constants::{PARTNER_PROGRAM_ID, PARTNER_SIGNERS_ACCOUNT_SEED};
use crate::base_to_solana::state::Signers;
use crate::base_to_solana::{compute_output_root_message_hash, recover_unique_evm_addresses};
use crate::{
    base_to_solana::{constants::OUTPUT_ROOT_SEED, state::OutputRoot},
    common::{bridge::Bridge, BRIDGE_SEED},
};

/// Accounts struct for the `register_output_root` instruction that stores Base MMR roots
/// on Solana for cross-chain message verification. This instruction allows a trusted oracle to
/// register output roots from Base at specific block intervals, enabling subsequent message
/// proofs and cross-chain operations. The instruction also records the MMR's total leaf count
/// needed for proof verification at that checkpoint.
#[derive(Accounts)]
#[instruction(output_root: [u8; 32], base_block_number: u64)]
pub struct RegisterOutputRoot<'info> {
    /// Payer funds the account creation. Authorization is enforced via oracle EVM signature.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The output root account being created to store the Base MMR root and total leaf count.
    /// - Uses PDA with OUTPUT_ROOT_SEED and base_block_number for deterministic address
    /// - Payer funds the account creation (authorization is enforced via EVM signatures)
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
    /// - Uses PDA with BRIDGE_SEED
    /// - Must be mutable to update the base_block_number field
    /// - Enforces registrations are monotonic and aligned to the configured interval
    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    /// Partner `Config` account (PDA with seed "config") owned by partner program.
    /// Unchecked to avoid Anchor pre-handler owner checks; PDA address is validated in the handler.
    /// CHECK: This is validated in the handler.
    pub partner_config: AccountInfo<'info>,

    /// System program required for creating new accounts.
    /// Used internally by Anchor for output root account initialization.
    pub system_program: Program<'info, System>,
}

pub fn register_output_root_handler(
    ctx: Context<RegisterOutputRoot>,
    output_root: [u8; 32],
    base_block_number: u64,
    total_leaf_count: u64,
    signatures: Vec<[u8; 65]>,
) -> Result<()> {
    // Check if bridge is paused
    require!(
        !ctx.accounts.bridge.paused,
        RegisterOutputRootError::BridgePaused
    );

    // Build message hash for signatures
    let message_hash =
        compute_output_root_message_hash(&output_root, base_block_number, total_leaf_count);

    // Recover unique EVM signers from provided signatures
    let unique_signers = recover_unique_evm_addresses(&signatures, &message_hash)?;

    // Verify Base oracle approvals
    let base_approved_count = ctx
        .accounts
        .bridge
        .base_oracle_config
        .count_approvals(&unique_signers);

    require!(
        base_approved_count as u8 >= ctx.accounts.bridge.base_oracle_config.threshold,
        RegisterOutputRootError::InsufficientBaseSignatures
    );

    if ctx.accounts.bridge.partner_oracle_config.required_threshold > 0 {
        // Validate partner_config PDA using seed with the partner program id
        let expected_partner_cfg =
            Pubkey::find_program_address(&[PARTNER_SIGNERS_ACCOUNT_SEED], &PARTNER_PROGRAM_ID).0;
        require_keys_eq!(
            ctx.accounts.partner_config.key(),
            expected_partner_cfg,
            anchor_lang::error::ErrorCode::ConstraintSeeds
        );

        // Verify partner approvals using partner's signers (deserialize manually)
        let partner_oracle_config = &ctx.accounts.bridge.partner_oracle_config;
        let partner_config =
            Signers::try_deserialize(&mut &ctx.accounts.partner_config.data.borrow()[..])?;
        let partner_approved_count = partner_config.count_approvals(&unique_signers);
        require!(
            partner_approved_count as u8 >= partner_oracle_config.required_threshold,
            RegisterOutputRootError::InsufficientPartnerSignatures
        );
    }

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
    ctx.accounts.root.total_leaf_count = total_leaf_count;
    ctx.accounts.bridge.base_block_number = base_block_number;

    Ok(())
}

#[error_code]
pub enum RegisterOutputRootError {
    #[msg("IncorrectBlockNumber")]
    IncorrectBlockNumber,
    #[msg("BridgePaused")]
    BridgePaused,
    #[msg("Insufficient base oracle signatures to meet threshold")]
    InsufficientBaseSignatures,
    #[msg("Insufficient partner oracle signatures to meet threshold")]
    InsufficientPartnerSignatures,
}

#[cfg(test)]
mod tests {
    use super::*;

    use anchor_lang::{
        solana_program::{instruction::Instruction, native_token::LAMPORTS_PER_SOL},
        system_program, InstructionData,
    };
    use litesvm::LiteSVM;
    use solana_account::Account as SvmAccount;
    use solana_keypair::Keypair;
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    use crate::{
        accounts,
        base_to_solana::state::signers::{PartnerSigner, Signers},
        base_to_solana::{
            constants::{OUTPUT_ROOT_SEED, PARTNER_SIGNERS_ACCOUNT_SEED},
            internal::compute_output_root_message_hash,
        },
        common::{bridge::Bridge, MAX_SIGNER_COUNT},
        instruction::RegisterOutputRoot as RegisterOutputRootIx,
        test_utils::setup_bridge_and_svm,
        ID,
    };

    use anchor_lang::solana_program::keccak::hash as keccak_hash;
    use secp256k1::{Message as SecpMessage, Secp256k1, SecretKey};

    fn partner_config_pda() -> Pubkey {
        Pubkey::find_program_address(&[PARTNER_SIGNERS_ACCOUNT_SEED], &PARTNER_PROGRAM_ID).0
    }

    fn output_root_pda(base_block_number: u64) -> Pubkey {
        Pubkey::find_program_address(&[OUTPUT_ROOT_SEED, &base_block_number.to_le_bytes()], &ID).0
    }

    fn write_partner_config_account(svm: &mut LiteSVM, signers: &[[u8; 20]]) -> Pubkey {
        let pda = partner_config_pda();
        // Build PartnerConfig with provided EVM addresses; new_evm_address defaults to None
        let cfg = Signers {
            signers: signers
                .iter()
                .map(|addr| PartnerSigner::from_evm_address(*addr))
                .collect(),
        };
        let mut data = Vec::new();
        cfg.try_serialize(&mut data).unwrap();
        svm.set_account(
            pda,
            SvmAccount {
                lamports: LAMPORTS_PER_SOL, // rent-exempt enough for tests
                data,
                owner: PARTNER_PROGRAM_ID,
                executable: false,
                rent_epoch: 0,
            },
        )
        .unwrap();
        pda
    }

    #[allow(clippy::too_many_arguments)]
    fn send_register(
        svm: &mut LiteSVM,
        payer: &Keypair,
        bridge_pda: Pubkey,
        partner_cfg_pda: Pubkey,
        output_root: [u8; 32],
        base_block_number: u64,
        total_leaf_count: u64,
        signatures: Vec<[u8; 65]>,
    ) -> std::result::Result<(), Box<litesvm::types::FailedTransactionMetadata>> {
        let root_pda = output_root_pda(base_block_number);
        let accounts = accounts::RegisterOutputRoot {
            payer: payer.pubkey(),
            root: root_pda,
            bridge: bridge_pda,
            partner_config: partner_cfg_pda,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: RegisterOutputRootIx {
                output_root,
                base_block_number,
                total_leaf_count,
                signatures,
            }
            .data(),
        };

        let tx = Transaction::new(
            &[payer],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx).map_err(Box::new)?;
        Ok(())
    }

    fn make_eth_sig_and_addr(
        sk_bytes: [u8; 32],
        output_root: [u8; 32],
        base_block_number: u64,
        total_leaf_count: u64,
    ) -> ([u8; 65], [u8; 20]) {
        // Compute the raw message hash exactly as the on-chain code does
        let msg_hash =
            compute_output_root_message_hash(&output_root, base_block_number, total_leaf_count);

        // secp256k1 crate expects 32-byte message; use raw hash (no Ethereum prefix) to match on-chain
        let secp = Secp256k1::new();
        let sk = SecretKey::from_slice(&sk_bytes).unwrap();
        let msg = SecpMessage::from_digest_slice(&msg_hash).unwrap();
        let sig = secp.sign_ecdsa_recoverable(&msg, &sk);
        let (rec_id, sig_bytes64) = sig.serialize_compact();

        // Build 65-byte signature: r||s||v, with v in {27..30}
        let mut sig65 = [0u8; 65];
        sig65[..64].copy_from_slice(&sig_bytes64);
        sig65[64] = 27 + rec_id.to_i32() as u8;

        // Derive the Ethereum address from the public key
        let pk = secp256k1::PublicKey::from_secret_key(&secp, &sk);
        let pk_uncompressed = pk.serialize_uncompressed();
        // Ethereum address is keccak256 of the 64-byte uncompressed pubkey (without the 0x04 prefix)
        let hashed = keccak_hash(&pk_uncompressed[1..]);
        let mut addr = [0u8; 20];
        addr.copy_from_slice(&hashed.to_bytes()[12..]);

        (sig65, addr)
    }

    fn set_base_oracle_signers_threshold_one(
        svm: &mut LiteSVM,
        bridge_pda: Pubkey,
        addr: [u8; 20],
    ) {
        let mut bridge_acc = svm.get_account(&bridge_pda).unwrap();
        let mut bridge = Bridge::try_deserialize(&mut &bridge_acc.data[..]).unwrap();
        bridge.base_oracle_config.threshold = 1;
        bridge.base_oracle_config.signer_count = 1;
        let mut fixed_signers = [[0u8; 20]; MAX_SIGNER_COUNT as usize];
        fixed_signers[0] = addr;
        bridge.base_oracle_config.signers = fixed_signers;
        let mut new_data = Vec::new();
        bridge.try_serialize(&mut new_data).unwrap();
        bridge_acc.data = new_data;
        svm.set_account(bridge_pda, bridge_acc).unwrap();
    }

    fn prepare_base_sig_and_set_oracle(
        svm: &mut LiteSVM,
        bridge_pda: Pubkey,
        sk_bytes: [u8; 32],
        output_root: [u8; 32],
        base_block_number: u64,
        total_leaf_count: u64,
    ) -> [u8; 65] {
        let (sig, addr) =
            make_eth_sig_and_addr(sk_bytes, output_root, base_block_number, total_leaf_count);
        set_base_oracle_signers_threshold_one(svm, bridge_pda, addr);
        sig
    }

    #[test]
    fn test_register_output_root_success_sets_root() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();
        let partner_cfg = write_partner_config_account(&mut svm, &[]);

        let output_root = [1u8; 32];
        let base_block_number = 600; // satisfies 300 interval and > 0
        let total_leaf_count = 42;

        // Configure base oracle with a signer matching our generated signature
        let sig = prepare_base_sig_and_set_oracle(
            &mut svm,
            bridge_pda,
            [42u8; 32],
            output_root,
            base_block_number,
            total_leaf_count,
        );

        send_register(
            &mut svm,
            &payer,
            bridge_pda,
            partner_cfg,
            output_root,
            base_block_number,
            total_leaf_count,
            vec![sig],
        )
        .expect("register_output_root should succeed");

        let root_account = svm
            .get_account(&output_root_pda(base_block_number))
            .unwrap();
        let root = OutputRoot::try_deserialize(&mut &root_account.data[..]).unwrap();
        assert_eq!(root.root, output_root);
    }

    #[test]
    fn test_register_output_root_success_sets_total_leaf_count() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();
        let partner_cfg = write_partner_config_account(&mut svm, &[]);

        let output_root = [2u8; 32];
        let base_block_number = 900; // satisfies 300 interval and > 0
        let total_leaf_count = 12345;

        // Configure base oracle and provide a valid signature
        let sig = prepare_base_sig_and_set_oracle(
            &mut svm,
            bridge_pda,
            [43u8; 32],
            output_root,
            base_block_number,
            total_leaf_count,
        );

        send_register(
            &mut svm,
            &payer,
            bridge_pda,
            partner_cfg,
            output_root,
            base_block_number,
            total_leaf_count,
            vec![sig],
        )
        .expect("register_output_root should succeed");

        let root_account = svm
            .get_account(&output_root_pda(base_block_number))
            .unwrap();
        let root = OutputRoot::try_deserialize(&mut &root_account.data[..]).unwrap();
        assert_eq!(root.total_leaf_count, total_leaf_count);
    }

    #[test]
    fn test_register_output_root_success_updates_bridge_block_number() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();
        let partner_cfg = write_partner_config_account(&mut svm, &[]);

        let output_root = [9u8; 32];
        let base_block_number = 1200;
        let total_leaf_count = 7;

        // Configure base oracle and provide a valid signature
        let sig = prepare_base_sig_and_set_oracle(
            &mut svm,
            bridge_pda,
            [44u8; 32],
            output_root,
            base_block_number,
            total_leaf_count,
        );

        send_register(
            &mut svm,
            &payer,
            bridge_pda,
            partner_cfg,
            output_root,
            base_block_number,
            total_leaf_count,
            vec![sig],
        )
        .expect("register_output_root should succeed");

        let bridge_acc = svm.get_account(&bridge_pda).unwrap();
        let bridge = Bridge::try_deserialize(&mut &bridge_acc.data[..]).unwrap();
        assert_eq!(bridge.base_block_number, base_block_number);
    }

    #[test]
    fn test_register_output_root_fails_when_paused() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();
        let partner_cfg = write_partner_config_account(&mut svm, &[]);

        // Pause the bridge
        let mut bridge_acc = svm.get_account(&bridge_pda).unwrap();
        let mut bridge = Bridge::try_deserialize(&mut &bridge_acc.data[..]).unwrap();
        bridge.paused = true;
        let mut new_data = Vec::new();
        bridge.try_serialize(&mut new_data).unwrap();
        bridge_acc.data = new_data;
        svm.set_account(bridge_pda, bridge_acc).unwrap();

        let result = send_register(
            &mut svm,
            &payer,
            bridge_pda,
            partner_cfg,
            [3u8; 32],
            600,
            1,
            vec![],
        );
        assert!(result.is_err(), "expected failure when bridge is paused");
        let err_str = format!("{:?}", result.unwrap_err());
        assert!(err_str.contains("BridgePaused"));
    }

    #[test]
    fn test_register_output_root_fails_incorrect_block_interval() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();
        let partner_cfg = write_partner_config_account(&mut svm, &[]);

        // Interval is 300 in tests; 150 is not aligned
        let output_root = [4u8; 32];
        let base_block_number = 150;
        let total_leaf_count = 10;

        // Configure base oracle and provide a valid signature so we hit the block interval check
        let sig = prepare_base_sig_and_set_oracle(
            &mut svm,
            bridge_pda,
            [45u8; 32],
            output_root,
            base_block_number,
            total_leaf_count,
        );

        let result = send_register(
            &mut svm,
            &payer,
            bridge_pda,
            partner_cfg,
            output_root,
            base_block_number,
            total_leaf_count,
            vec![sig],
        );
        assert!(
            result.is_err(),
            "expected failure for misaligned block number"
        );
        let err_str = format!("{:?}", result.unwrap_err());
        assert!(err_str.contains("IncorrectBlockNumber"));
    }

    #[test]
    fn test_register_output_root_fails_when_not_monotonic() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();
        let partner_cfg = write_partner_config_account(&mut svm, &[]);

        // Set current base_block_number high
        let mut bridge_acc = svm.get_account(&bridge_pda).unwrap();
        let mut bridge = Bridge::try_deserialize(&mut &bridge_acc.data[..]).unwrap();
        bridge.base_block_number = 600;
        let mut new_data = Vec::new();
        bridge.try_serialize(&mut new_data).unwrap();
        bridge_acc.data = new_data;
        svm.set_account(bridge_pda, bridge_acc).unwrap();

        // Attempt to register an equal block number (aligned but not strictly greater)
        let output_root = [5u8; 32];
        let base_block_number = 600;
        let total_leaf_count = 10;

        // Configure base oracle and provide a valid signature so we hit the monotonicity check
        let sig = prepare_base_sig_and_set_oracle(
            &mut svm,
            bridge_pda,
            [46u8; 32],
            output_root,
            base_block_number,
            total_leaf_count,
        );

        let result = send_register(
            &mut svm,
            &payer,
            bridge_pda,
            partner_cfg,
            output_root,
            base_block_number,
            total_leaf_count,
            vec![sig],
        );
        assert!(
            result.is_err(),
            "expected failure for non-increasing block number"
        );
        let err_str = format!("{:?}", result.unwrap_err());
        assert!(err_str.contains("IncorrectBlockNumber"));
    }

    #[test]
    fn test_register_output_root_fails_with_insufficient_base_signatures() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();
        let partner_cfg = write_partner_config_account(&mut svm, &[]);

        // Raise base oracle threshold to 1 and set a dummy signer on the bridge config
        let mut bridge_acc = svm.get_account(&bridge_pda).unwrap();
        let mut bridge = Bridge::try_deserialize(&mut &bridge_acc.data[..]).unwrap();
        bridge.base_oracle_config.threshold = 1;
        bridge.base_oracle_config.signer_count = 1;
        let mut fixed_signers = [[0u8; 20]; MAX_SIGNER_COUNT as usize];
        fixed_signers[0] = [7u8; 20];
        bridge.base_oracle_config.signers = fixed_signers;
        let mut new_data = Vec::new();
        bridge.try_serialize(&mut new_data).unwrap();
        bridge_acc.data = new_data;
        svm.set_account(bridge_pda, bridge_acc).unwrap();

        // No signatures provided -> not enough unique approvals
        let result = send_register(
            &mut svm,
            &payer,
            bridge_pda,
            partner_cfg,
            [6u8; 32],
            600,
            10,
            vec![],
        );
        assert!(
            result.is_err(),
            "expected failure for insufficient base signatures"
        );
        let err_str = format!("{:?}", result.unwrap_err());
        assert!(err_str.contains("InsufficientBaseSignatures"));
    }

    #[test]
    fn test_register_output_root_fails_with_insufficient_partner_signatures() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();
        // Provide a partner signer, but require threshold 1 and no signatures submitted
        let partner_cfg = write_partner_config_account(&mut svm, &[[9u8; 20]]);

        // Set partner required_threshold to 1
        let mut bridge_acc = svm.get_account(&bridge_pda).unwrap();
        let mut bridge = Bridge::try_deserialize(&mut &bridge_acc.data[..]).unwrap();
        bridge.partner_oracle_config.required_threshold = 1;
        let mut new_data = Vec::new();
        bridge.try_serialize(&mut new_data).unwrap();
        bridge_acc.data = new_data;
        svm.set_account(bridge_pda, bridge_acc).unwrap();

        // Also satisfy base oracle threshold with a valid signature that partner does NOT accept
        let output_root = [8u8; 32];
        let base_block_number = 600;
        let total_leaf_count = 10;
        let sig = prepare_base_sig_and_set_oracle(
            &mut svm,
            bridge_pda,
            [47u8; 32],
            output_root,
            base_block_number,
            total_leaf_count,
        );

        let result = send_register(
            &mut svm,
            &payer,
            bridge_pda,
            partner_cfg,
            output_root,
            base_block_number,
            total_leaf_count,
            vec![sig], // zero partner approvals -> should fail on partner threshold
        );
        assert!(
            result.is_err(),
            "expected failure for insufficient partner signatures"
        );
        let err_str = format!("{:?}", result.unwrap_err());
        assert!(err_str.contains("InsufficientPartnerSignatures"));
    }

    #[test]
    fn test_signature_verification_success_with_thresholds() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Configure base oracle signers threshold = 2 with 2 authorized addrs on the bridge config
        let mut bridge_acc = svm.get_account(&bridge_pda).unwrap();
        let mut bridge = Bridge::try_deserialize(&mut &bridge_acc.data[..]).unwrap();

        // Generate two ECDSA keypairs and signatures
        let sk1 = [1u8; 32];
        let sk2 = [2u8; 32];
        let output_root = [11u8; 32];
        let base_block_number = 600;
        let total_leaf_count = 5;
        let (sig1, addr1) =
            make_eth_sig_and_addr(sk1, output_root, base_block_number, total_leaf_count);
        let (sig2, addr2) =
            make_eth_sig_and_addr(sk2, output_root, base_block_number, total_leaf_count);

        bridge.base_oracle_config.threshold = 2;
        let mut fixed_signers = [[0u8; 20]; MAX_SIGNER_COUNT as usize];
        fixed_signers[0] = addr1;
        fixed_signers[1] = addr2;
        bridge.base_oracle_config.signers = fixed_signers;
        bridge.base_oracle_config.signer_count = 2;
        let mut new_data = Vec::new();
        bridge.try_serialize(&mut new_data).unwrap();
        bridge_acc.data = new_data;
        svm.set_account(bridge_pda, bridge_acc).unwrap();

        // Partner requires 1 signature and authorizes signer addr1
        let partner_cfg = write_partner_config_account(&mut svm, &[addr1]);
        let mut bridge_acc = svm.get_account(&bridge_pda).unwrap();
        let mut bridge = Bridge::try_deserialize(&mut &bridge_acc.data[..]).unwrap();
        bridge.partner_oracle_config.required_threshold = 1;
        let mut new_data = Vec::new();
        bridge.try_serialize(&mut new_data).unwrap();
        bridge_acc.data = new_data;
        svm.set_account(bridge_pda, bridge_acc).unwrap();

        // Submit both signatures
        send_register(
            &mut svm,
            &payer,
            bridge_pda,
            partner_cfg,
            output_root,
            base_block_number,
            total_leaf_count,
            vec![sig1, sig2],
        )
        .expect("register_output_root should succeed with valid signatures");
    }

    #[test]
    fn test_signature_verification_deduplicates_signers() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();

        // Base oracle requires 2 unique approvals, but we will submit the same signer twice
        let mut bridge_acc = svm.get_account(&bridge_pda).unwrap();
        let mut bridge = Bridge::try_deserialize(&mut &bridge_acc.data[..]).unwrap();

        let sk = [3u8; 32];
        let output_root = [12u8; 32];
        let base_block_number = 900;
        let total_leaf_count = 9;
        let (sig, addr) =
            make_eth_sig_and_addr(sk, output_root, base_block_number, total_leaf_count);

        bridge.base_oracle_config.threshold = 2;
        let mut fixed_signers = [[0u8; 20]; MAX_SIGNER_COUNT as usize];
        fixed_signers[0] = addr;
        bridge.base_oracle_config.signers = fixed_signers;
        bridge.base_oracle_config.signer_count = 1;
        let mut new_data = Vec::new();
        bridge.try_serialize(&mut new_data).unwrap();
        bridge_acc.data = new_data;
        svm.set_account(bridge_pda, bridge_acc).unwrap();

        // Partner threshold 0; focus on base signer dedup
        let partner_cfg = write_partner_config_account(&mut svm, &[]);

        let result = send_register(
            &mut svm,
            &payer,
            bridge_pda,
            partner_cfg,
            output_root,
            base_block_number,
            total_leaf_count,
            vec![sig, sig], // duplicate signature from same signer
        );
        assert!(
            result.is_err(),
            "expected failure due to deduplication reducing unique count"
        );
        let err_str = format!("{:?}", result.unwrap_err());
        assert!(err_str.contains("InsufficientBaseSignatures"));
    }

    #[test]
    fn test_signature_verification_invalid_recovery_id() {
        let (mut svm, payer, bridge_pda) = setup_bridge_and_svm();
        let partner_cfg = write_partner_config_account(&mut svm, &[]);

        // Base oracle requires 1 signer but we'll submit an invalid signature (bad v)
        let mut bridge_acc = svm.get_account(&bridge_pda).unwrap();
        let mut bridge = Bridge::try_deserialize(&mut &bridge_acc.data[..]).unwrap();
        bridge.base_oracle_config.threshold = 1;
        // authorize some dummy address so that threshold logic would pass if signature were valid
        let mut fixed_signers = [[0u8; 20]; MAX_SIGNER_COUNT as usize];
        fixed_signers[0] = [0xAA; 20];
        bridge.base_oracle_config.signers = fixed_signers;
        bridge.base_oracle_config.signer_count = 1;
        let mut new_data = Vec::new();
        bridge.try_serialize(&mut new_data).unwrap();
        bridge_acc.data = new_data;
        svm.set_account(bridge_pda, bridge_acc).unwrap();

        let output_root = [13u8; 32];
        let base_block_number = 1200;
        let total_leaf_count = 1;

        // Forge a 65-byte blob with invalid recovery id (v >= 31 -> rec_id >= 4 after minus 27)
        let mut bad_sig = [0u8; 65];
        bad_sig[64] = 31; // 31 - 27 = 4 -> invalid

        let result = send_register(
            &mut svm,
            &payer,
            bridge_pda,
            partner_cfg,
            output_root,
            base_block_number,
            total_leaf_count,
            vec![bad_sig],
        );
        assert!(
            result.is_err(),
            "expected failure due to invalid recovery id"
        );
        let err_str = format!("{:?}", result.unwrap_err());
        // The error bubbles up as SignatureVerificationFailed or InvalidRecoveryId; both indicate signature check path executed
        assert!(
            err_str.contains("SignatureVerificationFailed")
                || err_str.contains("InvalidRecoveryId")
                || err_str.contains("custom program error")
        );
    }
}
