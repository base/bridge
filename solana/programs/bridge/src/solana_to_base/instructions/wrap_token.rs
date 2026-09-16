use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, Token2022};

use crate::common::DISCRIMINATOR_LEN;
use crate::common::{
    bridge::Bridge, PartialTokenMetadata, PartialTokenMetadataV1, BRIDGE_SEED, WRAPPED_TOKEN_SEED,
};
use crate::solana_to_base::{
    internal::wrap_token::{wrap_token_internal, REGISTER_REMOTE_TOKEN_DATA_LEN},
    Call, OutgoingMessage, OUTGOING_MESSAGE_SEED,
};
use crate::BridgeError;

/// Accounts struct for the deprecated wrap token instruction. Identical to [`WrapTokenV2`] except
/// that its metadata argument predates the `uri` field, so its instruction data stays byte-for-byte
/// compatible with clients built before that field existed.
#[derive(Accounts)]
#[instruction(outgoing_message_salt: [u8; 32], decimals: u8, metadata: PartialTokenMetadataV1)]
pub struct WrapToken<'info> {
    /// The account that pays for the transaction and all account creation costs.
    /// Must be mutable to deduct lamports for mint creation, metadata storage, and gas fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The account that receives payment for the gas costs of registering the token on Base.
    /// CHECK: This account is validated to be the same as bridge.gas_config.gas_fee_receiver
    #[account(mut, address = bridge.gas_config.gas_fee_receiver @ BridgeError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    /// The new SPL Token-2022 mint being created for the wrapped token.
    /// - Uses PDA with token metadata hash and decimals for deterministic address
    /// - Mint authority set to itself (mint account) for controlled minting
    /// - Includes metadata pointer extension to store token information onchain
    #[account(
        init,
        payer = payer,
        // NOTE: Suboptimal to compute the seeds here but it allows to use `init`.
        seeds = [
            WRAPPED_TOKEN_SEED,
            decimals.to_le_bytes().as_ref(),
            metadata.hash().as_ref(),
        ],
        bump,
        mint::decimals = decimals,
        mint::authority = mint,
        extensions::metadata_pointer::metadata_address = mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The main bridge state account that tracks cross-chain operations.
    /// Used to increment the nonce counter and manage EIP-1559 gas pricing.
    /// Must be mutable to update the nonce after creating the outgoing message.
    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    /// The outgoing message account that stores the cross-chain call to register
    /// the wrapped token on the Base blockchain. Contains the encoded function call
    /// with token address, local mint address, and scaling parameters.
    #[account(
        init,
        payer = payer,
        seeds = [OUTGOING_MESSAGE_SEED, outgoing_message_salt.as_ref()],
        bump,
        space = DISCRIMINATOR_LEN + OutgoingMessage::space::<Call>(REGISTER_REMOTE_TOKEN_DATA_LEN),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// SPL Token-2022 program for creating the mint with metadata extensions.
    /// Required for initializing tokens with advanced features like metadata pointers.
    pub token_program: Program<'info, Token2022>,

    /// System program required for creating new accounts and transferring lamports.
    /// Used internally by Anchor for account initialization and rent payments.
    pub system_program: Program<'info, System>,
}

/// Accounts struct for the wrap token instruction that creates a wrapped representation
/// of a Base token on Solana. This instruction initializes a new SPL token
/// with Token-2022 extensions and registers it with Base for cross-chain
/// token transfers. The wrapped token maintains metadata linking it to its Base counterpart.
#[derive(Accounts)]
#[instruction(outgoing_message_salt: [u8; 32], decimals: u8, metadata: PartialTokenMetadata)]
pub struct WrapTokenV2<'info> {
    /// The account that pays for the transaction and all account creation costs.
    /// Must be mutable to deduct lamports for mint creation, metadata storage, and gas fees.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The account that receives payment for the gas costs of registering the token on Base.
    /// CHECK: This account is validated to be the same as bridge.gas_config.gas_fee_receiver
    #[account(mut, address = bridge.gas_config.gas_fee_receiver @ BridgeError::IncorrectGasFeeReceiver)]
    pub gas_fee_receiver: AccountInfo<'info>,

    /// The new SPL Token-2022 mint being created for the wrapped token.
    /// - Uses PDA with token metadata hash and decimals for deterministic address
    /// - Mint authority set to itself (mint account) for controlled minting
    /// - Includes metadata pointer extension to store token information onchain
    #[account(
        init,
        payer = payer,
        // NOTE: Suboptimal to compute the seeds here but it allows to use `init`.
        seeds = [
            WRAPPED_TOKEN_SEED,
            decimals.to_le_bytes().as_ref(),
            metadata.hash().as_ref(),
        ],
        bump,
        mint::decimals = decimals,
        mint::authority = mint,
        extensions::metadata_pointer::metadata_address = mint,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// The main bridge state account that tracks cross-chain operations.
    /// Used to increment the nonce counter and manage EIP-1559 gas pricing.
    /// Must be mutable to update the nonce after creating the outgoing message.
    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,

    /// The outgoing message account that stores the cross-chain call to register
    /// the wrapped token on the Base blockchain. Contains the encoded function call
    /// with token address, local mint address, and scaling parameters.
    #[account(
        init,
        payer = payer,
        seeds = [OUTGOING_MESSAGE_SEED, outgoing_message_salt.as_ref()],
        bump,
        space = DISCRIMINATOR_LEN + OutgoingMessage::space::<Call>(REGISTER_REMOTE_TOKEN_DATA_LEN),
    )]
    pub outgoing_message: Account<'info, OutgoingMessage>,

    /// SPL Token-2022 program for creating the mint with metadata extensions.
    /// Required for initializing tokens with advanced features like metadata pointers.
    pub token_program: Program<'info, Token2022>,

    /// System program required for creating new accounts and transferring lamports.
    /// Used internally by Anchor for account initialization and rent payments.
    pub system_program: Program<'info, System>,
}

pub fn wrap_token_handler(
    ctx: Context<WrapToken>,
    _outgoing_message_salt: [u8; 32],
    decimals: u8,
    partial_token_metadata: PartialTokenMetadataV1,
) -> Result<()> {
    wrap_token_internal(
        &ctx.accounts.payer,
        &ctx.accounts.gas_fee_receiver,
        &ctx.accounts.mint,
        &mut ctx.accounts.bridge,
        &mut ctx.accounts.outgoing_message,
        &ctx.accounts.token_program,
        &ctx.accounts.system_program,
        ctx.bumps.mint,
        decimals,
        partial_token_metadata.into(),
    )
}

pub fn wrap_token_v2_handler(
    ctx: Context<WrapTokenV2>,
    _outgoing_message_salt: [u8; 32],
    decimals: u8,
    partial_token_metadata: PartialTokenMetadata,
) -> Result<()> {
    wrap_token_internal(
        &ctx.accounts.payer,
        &ctx.accounts.gas_fee_receiver,
        &ctx.accounts.mint,
        &mut ctx.accounts.bridge,
        &mut ctx.accounts.outgoing_message,
        &ctx.accounts.token_program,
        &ctx.accounts.system_program,
        ctx.bumps.mint,
        decimals,
        partial_token_metadata,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    use anchor_lang::{solana_program::instruction::Instruction, system_program, InstructionData};
    use anchor_spl::token_2022::spl_token_2022::{
        extension::{BaseStateWithExtensions, PodStateWithExtensions},
        pod::PodMint,
    };
    use anchor_spl::token_interface::spl_token_metadata_interface::state::TokenMetadata;
    use litesvm::LiteSVM;
    use solana_keypair::Keypair;
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    use crate::common::MAX_URI_LEN;
    use crate::{
        accounts,
        instruction::{WrapToken as WrapTokenIx, WrapTokenV2 as WrapTokenV2Ix},
        test_utils::{
            create_outgoing_message, setup_bridge, SetupBridgeResult, TEST_GAS_FEE_RECEIVER,
        },
        ID,
    };

    const DECIMALS: u8 = 6;
    const URI: &str = "https://example.com/werc20.json";

    fn metadata_v1() -> PartialTokenMetadataV1 {
        PartialTokenMetadataV1 {
            name: "Wrapped ERC20".to_string(),
            symbol: "wERC20".to_string(),
            remote_token: [1u8; 20],
            scaler_exponent: 9,
        }
    }

    fn metadata(uri: &str) -> PartialTokenMetadata {
        PartialTokenMetadata {
            uri: uri.to_string(),
            ..metadata_v1().into()
        }
    }

    fn wrapped_mint(metadata_hash: [u8; 32]) -> Pubkey {
        Pubkey::find_program_address(
            &[
                WRAPPED_TOKEN_SEED,
                DECIMALS.to_le_bytes().as_ref(),
                metadata_hash.as_ref(),
            ],
            &ID,
        )
        .0
    }

    fn account_metas(
        payer: Pubkey,
        mint: Pubkey,
        bridge: Pubkey,
        outgoing: Pubkey,
    ) -> Vec<AccountMeta> {
        accounts::WrapTokenV2 {
            payer,
            gas_fee_receiver: TEST_GAS_FEE_RECEIVER,
            mint,
            bridge,
            outgoing_message: outgoing,
            token_program: anchor_spl::token_2022::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None)
    }

    fn send(
        svm: &mut LiteSVM,
        payer: &Keypair,
        ix: Instruction,
    ) -> std::result::Result<(), String> {
        let tx = Transaction::new(
            &[payer],
            Message::new(&[ix], Some(&payer.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx)
            .map(|_| ())
            .map_err(|err| format!("{:?}", err))
    }

    fn mint_uri(svm: &LiteSVM, mint: Pubkey) -> String {
        let account = svm.get_account(&mint).unwrap();
        PodStateWithExtensions::<PodMint>::unpack(&account.data)
            .unwrap()
            .get_variable_len_extension::<TokenMetadata>()
            .unwrap()
            .uri
    }

    /// Byte-for-byte instruction data as a client built before `uri` existed would emit it. Written
    /// out literally rather than serialized from a type, so a change to either the discriminator or
    /// the argument layout of `wrap_token` fails here instead of silently breaking those clients.
    fn legacy_instruction_data(
        outgoing_message_salt: [u8; 32],
        metadata: &PartialTokenMetadataV1,
    ) -> Vec<u8> {
        let mut data = vec![203, 83, 204, 83, 225, 109, 44, 6];
        data.extend_from_slice(&outgoing_message_salt);
        data.push(DECIMALS);
        data.extend_from_slice(&(metadata.name.len() as u32).to_le_bytes());
        data.extend_from_slice(metadata.name.as_bytes());
        data.extend_from_slice(&(metadata.symbol.len() as u32).to_le_bytes());
        data.extend_from_slice(metadata.symbol.as_bytes());
        data.extend_from_slice(&metadata.remote_token);
        data.push(metadata.scaler_exponent);
        data
    }

    #[test]
    fn test_wrap_token_legacy_wire_format_is_unchanged() {
        let SetupBridgeResult {
            mut svm,
            payer,
            bridge_pda,
            ..
        } = setup_bridge();

        let (outgoing_message_salt, outgoing_message) = create_outgoing_message();
        let metadata = metadata_v1();
        let mint = wrapped_mint(metadata.hash());

        let expected = legacy_instruction_data(outgoing_message_salt, &metadata);
        let actual = WrapTokenIx {
            outgoing_message_salt,
            decimals: DECIMALS,
            partial_token_metadata: metadata.clone(),
        }
        .data();
        assert_eq!(
            actual, expected,
            "wrap_token instruction data changed shape"
        );

        let ix = Instruction {
            program_id: ID,
            accounts: account_metas(payer.pubkey(), mint, bridge_pda, outgoing_message),
            data: expected,
        };

        send(&mut svm, &payer, ix).expect("Failed to send legacy wrap_token transaction");

        // The token is wrapped, permanently without a uri.
        assert_eq!(mint_uri(&svm, mint), "");
    }

    #[test]
    fn test_wrap_token_v2_stores_uri_on_mint() {
        let SetupBridgeResult {
            mut svm,
            payer,
            bridge_pda,
            ..
        } = setup_bridge();

        let (outgoing_message_salt, outgoing_message) = create_outgoing_message();
        let partial_token_metadata = metadata(URI);
        let mint = wrapped_mint(partial_token_metadata.hash());

        let ix = Instruction {
            program_id: ID,
            accounts: account_metas(payer.pubkey(), mint, bridge_pda, outgoing_message),
            data: WrapTokenV2Ix {
                outgoing_message_salt,
                decimals: DECIMALS,
                partial_token_metadata: partial_token_metadata.clone(),
            }
            .data(),
        };

        // Succeeding also proves the mint was funded for the extra bytes the uri occupies.
        send(&mut svm, &payer, ix).expect("Failed to send wrap_token_v2 transaction");

        let account = svm.get_account(&mint).unwrap();
        let token_metadata = PodStateWithExtensions::<PodMint>::unpack(&account.data)
            .unwrap()
            .get_variable_len_extension::<TokenMetadata>()
            .unwrap();

        assert_eq!(token_metadata.uri, URI);
        assert_eq!(
            PartialTokenMetadata::try_from(token_metadata).unwrap(),
            partial_token_metadata
        );
    }

    #[test]
    fn test_wrap_token_v2_rejects_oversized_uri() {
        let SetupBridgeResult {
            mut svm,
            payer,
            bridge_pda,
            ..
        } = setup_bridge();

        let (outgoing_message_salt, outgoing_message) = create_outgoing_message();
        let partial_token_metadata = metadata(&"u".repeat(MAX_URI_LEN as usize + 1));
        let mint = wrapped_mint(partial_token_metadata.hash());

        let ix = Instruction {
            program_id: ID,
            accounts: account_metas(payer.pubkey(), mint, bridge_pda, outgoing_message),
            data: WrapTokenV2Ix {
                outgoing_message_salt,
                decimals: DECIMALS,
                partial_token_metadata,
            }
            .data(),
        };

        let error = send(&mut svm, &payer, ix).expect_err("Expected oversized uri to be rejected");
        assert!(
            error.contains("UriTooLong"),
            "Expected UriTooLong error, got: {}",
            error
        );
    }
}
