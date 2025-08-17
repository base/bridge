use crate::{common::WRAPPED_TOKEN_SEED, ID};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use anchor_spl::{
    token_2022::spl_token_2022::{
        extension::{BaseStateWithExtensions, PodStateWithExtensions},
        pod::PodMint,
    },
    token_interface::spl_token_metadata_interface::state::TokenMetadata,
};

/// Represents token metadata for tokens that are bridged between Base and Solana.
///
/// This struct contains metadata needed to represent a token that exists on both
/// chains, including information about its remote counterpart and any scaling factors needed
/// to handle differences between the chains (such as decimal precision).
///
/// The metadata is stored using the SPL Token-2022 metadata interface's
/// `additional_metadata` key/value field and can be used to reconstruct the relationship
/// between tokens on both sides of the bridge.
#[derive(Debug, Clone, AnchorDeserialize, AnchorSerialize)]
pub struct PartialTokenMetadata {
    /// The human-readable name of the token (e.g., "Wrapped Bitcoin")
    pub name: String,

    /// The symbol/ticker of the token (e.g., "WBTC")
    pub symbol: String,

    /// The 20-byte address of the corresponding token contract on Base (EVM address bytes).
    /// This allows the bridge to identify which Base token this Solana token represents.
    pub remote_token: [u8; 20],

    /// The scaling exponent used to convert between token amounts on different chains.
    /// This handles cases where tokens have differing decimal precision on Base vs Solana.
    /// For example, when Base token has 18 decimals and the Solana wrapped mint has 9,
    /// this value conveys the decimal relationship so bridging logic can scale amounts.
    /// The exact conversion is performed by the EVM-side contract; Solana propagates this
    /// value but does not apply arithmetic with it.
    pub scaler_exponent: u8,
}

/// Key used in `additional_metadata` for the Base (EVM) token address bytes, hex-encoded.
pub const REMOTE_TOKEN_METADATA_KEY: &str = "remote_token";
/// Key used in `additional_metadata` for the decimal scaling exponent.
pub const SCALER_EXPONENT_METADATA_KEY: &str = "scaler_exponent";

impl From<&PartialTokenMetadata> for TokenMetadata {
    fn from(value: &PartialTokenMetadata) -> Self {
        TokenMetadata {
            name: value.name.clone(),
            symbol: value.symbol.clone(),
            additional_metadata: vec![
                (
                    REMOTE_TOKEN_METADATA_KEY.to_string(),
                    hex::encode(value.remote_token),
                ),
                (
                    SCALER_EXPONENT_METADATA_KEY.to_string(),
                    value.scaler_exponent.to_string(),
                ),
            ],
            ..Default::default()
        }
    }
}

/// Attempts to reconstruct `PartialTokenMetadata` from SPL Token-2022 `TokenMetadata`.
///
/// Notes/assumptions:
/// - Only the first two entries of `additional_metadata` are inspected.
/// - Those entries are expected to be, in order: (`remote_token`, `scaler_exponent`).
/// - If the keys are missing, in a different order, or appear after other keys, this
///   conversion will fail with a `NotFound` error. This reflects the current write
///   behavior, which inserts the keys in that order.
impl TryFrom<TokenMetadata> for PartialTokenMetadata {
    type Error = Error;

    fn try_from(metadata: TokenMetadata) -> Result<Self> {
        let mut key_values = metadata
            .additional_metadata
            .iter()
            .take(2)
            .collect::<Vec<_>>();

        let (scaler_exponent_key, scaler_exponent_value) = key_values
            .pop()
            .ok_or(TokenMetadataError::ScalerExponentNotFound)?;

        require!(
            scaler_exponent_key == SCALER_EXPONENT_METADATA_KEY,
            TokenMetadataError::ScalerExponentNotFound
        );

        let scaler_exponent = scaler_exponent_value
            .parse::<u8>()
            .map_err(|_| TokenMetadataError::InvalidScalerExponent)?;

        let (remote_token_key, remote_token_value) = key_values
            .pop()
            .ok_or(TokenMetadataError::RemoteTokenNotFound)?;

        require!(
            remote_token_key == REMOTE_TOKEN_METADATA_KEY,
            TokenMetadataError::RemoteTokenNotFound
        );

        let remote_token = <[u8; 20]>::try_from(
            hex::decode(remote_token_value).map_err(|_| TokenMetadataError::InvalidRemoteToken)?,
        )
        .map_err(|_| TokenMetadataError::InvalidRemoteToken)?;

        Ok(PartialTokenMetadata {
            name: metadata.name,
            symbol: metadata.symbol,
            remote_token,
            scaler_exponent,
        })
    }
}

impl TryFrom<&AccountInfo<'_>> for PartialTokenMetadata {
    type Error = Error;

    fn try_from(value: &AccountInfo<'_>) -> Result<Self> {
        let (token_metadata, decimals) = mint_info_to_token_metadata(value)?;
        let partial = Self::try_from(token_metadata)?;

        // Ensure the provided mint is a PDA derived by this program for wrapped tokens.
        let decimals_bytes = decimals.to_le_bytes();
        let metadata_hash = partial.hash();
        let seeds: &[&[u8]] = &[
            WRAPPED_TOKEN_SEED,
            decimals_bytes.as_ref(),
            metadata_hash.as_ref(),
        ];
        let (expected_mint, _bump) = Pubkey::find_program_address(seeds, &ID);
        require_keys_eq!(
            value.key(),
            expected_mint,
            TokenMetadataError::MintIsNotWrappedTokenPda
        );

        Ok(partial)
    }
}

impl PartialTokenMetadata {
    /// Computes a keccak256 hash of the metadata fields as:
    /// `keccak(name || symbol || remote_token || scaler_exponent_le)`,
    /// where `scaler_exponent_le` is the little-endian byte representation.
    pub fn hash(&self) -> [u8; 32] {
        let mut data = Vec::new();
        data.extend_from_slice(self.name.as_bytes());
        data.extend_from_slice(self.symbol.as_bytes());
        data.extend_from_slice(self.remote_token.as_ref());
        data.extend_from_slice(&self.scaler_exponent.to_le_bytes());
        keccak::hash(&data).0
    }
}

/// Reads and returns Token-2022 `TokenMetadata` from a mint account.
///
/// Fails if the account is not owned by the Token-2022 program or if the metadata
/// extension is missing/malformed.
fn mint_info_to_token_metadata(mint: &AccountInfo<'_>) -> Result<(TokenMetadata, u8)> {
    require_keys_eq!(
        *mint.owner,
        anchor_spl::token_2022::ID,
        TokenMetadataError::MintIsNotFromToken2022
    );

    let mint_data = mint.data.borrow();
    let mint_with_extension = PodStateWithExtensions::<PodMint>::unpack(&mint_data)?;
    let token_metadata = mint_with_extension.get_variable_len_extension::<TokenMetadata>()?;
    let decimals = mint_with_extension.base.decimals;
    Ok((token_metadata, decimals))
}

#[error_code]
pub enum TokenMetadataError {
    #[msg("Remote token not found")]
    RemoteTokenNotFound,
    #[msg("Scaler exponent not found")]
    ScalerExponentNotFound,
    #[msg("Invalid remote token")]
    InvalidRemoteToken,
    #[msg("Invalid scaler exponent")]
    InvalidScalerExponent,
    #[msg("Mint is not a token 2022 mint")]
    MintIsNotFromToken2022,
    #[msg("Mint is not a valid wrapped token PDA")]
    MintIsNotWrappedTokenPda,
}
