use crate::{common::WRAPPED_TOKEN_SEED, BridgeError, ID};
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
#[derive(Debug, Clone, PartialEq, Eq, AnchorDeserialize, AnchorSerialize)]
pub struct PartialTokenMetadata {
    /// The human-readable name of the token (e.g., "Wrapped Bitcoin")
    pub name: String,

    /// The symbol/ticker of the token (e.g., "WBTC")
    pub symbol: String,

    /// URI pointing to off-chain JSON metadata holding the token's image and description.
    /// Token-2022 has no dedicated fields for either, so both are served from this document.
    ///
    /// NOTE: Deliberately excluded from [`PartialTokenMetadata::hash`]. See that method.
    pub uri: String,

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

/// Deprecated wire format for the `wrap_token` instruction, retained byte-for-byte so clients built
/// before `uri` existed keep working. Converts to [`PartialTokenMetadata`] with an empty `uri`,
/// which cannot be filled in afterwards. New integrations should use `wrap_token_v2`.
#[derive(Debug, Clone, PartialEq, Eq, AnchorDeserialize, AnchorSerialize)]
pub struct PartialTokenMetadataV1 {
    /// The human-readable name of the token (e.g., "Wrapped Bitcoin")
    pub name: String,

    /// The symbol/ticker of the token (e.g., "WBTC")
    pub symbol: String,

    /// The 20-byte address of the corresponding token contract on Base (EVM address bytes).
    pub remote_token: [u8; 20],

    /// The scaling exponent used to convert between token amounts on different chains.
    pub scaler_exponent: u8,
}

impl PartialTokenMetadataV1 {
    /// Equal to [`PartialTokenMetadata::hash`] for the same token, so both wrap instructions
    /// derive the same mint.
    pub fn hash(&self) -> [u8; 32] {
        metadata_hash(
            &self.name,
            &self.symbol,
            &self.remote_token,
            self.scaler_exponent,
        )
    }
}

impl From<PartialTokenMetadataV1> for PartialTokenMetadata {
    fn from(value: PartialTokenMetadataV1) -> Self {
        Self {
            name: value.name,
            symbol: value.symbol,
            uri: String::new(),
            remote_token: value.remote_token,
            scaler_exponent: value.scaler_exponent,
        }
    }
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
            uri: value.uri.clone(),
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
///   returns `BridgeError::RemoteTokenNotFound` or
///   `BridgeError::ScalerExponentNotFound`. This reflects the current write
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
            .ok_or(BridgeError::ScalerExponentNotFound)?;

        require!(
            scaler_exponent_key == SCALER_EXPONENT_METADATA_KEY,
            BridgeError::ScalerExponentNotFound
        );

        let scaler_exponent = scaler_exponent_value
            .parse::<u8>()
            .map_err(|_| BridgeError::InvalidScalerExponent)?;

        let (remote_token_key, remote_token_value) =
            key_values.pop().ok_or(BridgeError::RemoteTokenNotFound)?;

        require!(
            remote_token_key == REMOTE_TOKEN_METADATA_KEY,
            BridgeError::RemoteTokenNotFound
        );

        let remote_token = <[u8; 20]>::try_from(
            hex::decode(remote_token_value).map_err(|_| BridgeError::InvalidRemoteToken)?,
        )
        .map_err(|_| BridgeError::InvalidRemoteToken)?;

        Ok(PartialTokenMetadata {
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadata.uri,
            remote_token,
            scaler_exponent,
        })
    }
}

impl TryFrom<&AccountInfo<'_>> for PartialTokenMetadata {
    type Error = Error;

    fn try_from(mint: &AccountInfo<'_>) -> Result<Self> {
        let (token_metadata, decimals) = mint_info_to_token_metadata(mint)?;
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
            mint.key(),
            expected_mint,
            BridgeError::MintIsNotWrappedTokenPda
        );

        Ok(partial)
    }
}

impl PartialTokenMetadata {
    /// See [`metadata_hash`].
    pub fn hash(&self) -> [u8; 32] {
        metadata_hash(
            &self.name,
            &self.symbol,
            &self.remote_token,
            self.scaler_exponent,
        )
    }
}

/// Computes a keccak256 hash of the metadata fields as:
/// `keccak(len(name) || name || len(symbol) || symbol || remote_token || scaler_exponent_le)`,
/// where `scaler_exponent_le` is the little-endian byte representation.
///
/// IMPORTANT: a token's `uri` is excluded from the preimage and must stay excluded. This hash seeds
/// the wrapped mint PDA and is recomputed from onchain metadata to authenticate a mint as a wrapped
/// token, so extending the preimage moves every already-deployed mint to an address the program no
/// longer derives. Those mints would stop bridging in both directions, and would start passing the
/// `MintIsWrappedToken` guard in `bridge_spl` that routes them away from the burn path. Excluding it
/// is also what lets `wrap_token` and `wrap_token_v2` derive the same mint for a given token.
fn metadata_hash(
    name: &str,
    symbol: &str,
    remote_token: &[u8; 20],
    scaler_exponent: u8,
) -> [u8; 32] {
    let mut data = Vec::new();
    data.extend_from_slice(&name.len().to_le_bytes());
    data.extend_from_slice(name.as_bytes());
    data.extend_from_slice(&symbol.len().to_le_bytes());
    data.extend_from_slice(symbol.as_bytes());
    data.extend_from_slice(remote_token.as_ref());
    data.extend_from_slice(&scaler_exponent.to_le_bytes());
    keccak::hash(&data).0
}

/// Reads and returns Token-2022 `TokenMetadata` and `decimals` from a mint account.
///
/// Fails if the account is not owned by the Token-2022 program or if the metadata
/// extension is missing or malformed.
fn mint_info_to_token_metadata(mint: &AccountInfo<'_>) -> Result<(TokenMetadata, u8)> {
    require_keys_eq!(
        *mint.owner,
        anchor_spl::token_2022::ID,
        BridgeError::MintIsNotFromToken2022
    );

    let mint_data = mint.data.borrow();
    let mint_with_extension = PodStateWithExtensions::<PodMint>::unpack(&mint_data)?;
    let token_metadata = mint_with_extension.get_variable_len_extension::<TokenMetadata>()?;
    let decimals = mint_with_extension.base.decimals;
    Ok((token_metadata, decimals))
}

#[cfg(test)]
mod tests {
    use hex_literal::hex;

    use super::*;

    const URI: &str = "https://example.com/weth.json";

    /// Metadata and decimals of the wrapped ETH mint live on Solana mainnet, which was deployed
    /// before `uri` was a supported field and therefore stores an empty one.
    const DEPLOYED_DECIMALS: u8 = 9;
    const DEPLOYED_MINT: Pubkey = pubkey!("2ZCFyWM6WthDLBo41zJsMQmjJ4Kvb6yumvrbLpVh9LMX");
    const DEPLOYED_BRIDGE: Pubkey = pubkey!("HNCne2FkVaNghhjKXapxJzPaBvAKDG1Ge3gqhZyfVWLM");

    fn deployed_wrapped_eth(uri: &str) -> PartialTokenMetadata {
        PartialTokenMetadata {
            name: "Wrapped ETH".to_string(),
            symbol: "wETH".to_string(),
            uri: uri.to_string(),
            remote_token: hex!("eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"),
            scaler_exponent: 9,
        }
    }

    /// Keeps `uri` out of the hash preimage: an already-deployed mint has to keep deriving to the
    /// address it actually occupies, or it stops bridging in both directions.
    #[test]
    fn deployed_mint_still_derives() {
        let (mint, _) = Pubkey::find_program_address(
            &[
                WRAPPED_TOKEN_SEED,
                DEPLOYED_DECIMALS.to_le_bytes().as_ref(),
                deployed_wrapped_eth("").hash().as_ref(),
            ],
            &DEPLOYED_BRIDGE,
        );

        assert_eq!(mint, DEPLOYED_MINT);
    }

    /// `wrap_token` and `wrap_token_v2` have to seed the same mint for a given token, otherwise the
    /// deprecated path would create a second, separate asset.
    #[test]
    fn v1_hashes_identically_and_converts_to_an_empty_uri() {
        let current = deployed_wrapped_eth(URI);
        let v1 = PartialTokenMetadataV1 {
            name: current.name.clone(),
            symbol: current.symbol.clone(),
            remote_token: current.remote_token,
            scaler_exponent: current.scaler_exponent,
        };

        assert_eq!(v1.hash(), current.hash());
        assert_eq!(PartialTokenMetadata::from(v1), deployed_wrapped_eth(""));
    }

    /// An empty uri is what every mint deployed before this field stores, so both must round-trip.
    #[test]
    fn round_trips_through_token_metadata() {
        for uri in ["", URI] {
            let expected = deployed_wrapped_eth(uri);
            let token_metadata = TokenMetadata::from(&expected);

            assert_eq!(token_metadata.uri, uri);
            assert_eq!(
                PartialTokenMetadata::try_from(token_metadata).unwrap(),
                expected
            );
        }
    }
}
