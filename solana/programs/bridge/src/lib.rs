#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod base_to_solana;
pub mod common;
pub mod solana_to_base;

#[cfg(test)]
mod test_utils;

use base_to_solana::*;
use common::*;
use solana_to_base::*;

declare_id!("AvgDrHpWUeV7fpZYVhDQbWrV2sD7zp9zDB7w97CWknKH");

#[program]
pub mod bridge {
    use super::*;

    // Common

    /// Initializes the bridge program with required state accounts.
    /// This function sets up the initial bridge configuration and must be called once during deployment.
    ///
    /// # Arguments
    /// * `ctx` - The context containing all accounts needed for initialization
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize_handler(ctx)
    }

    // Base -> Solana

    /// Registers an output root from Base to enable message verification.
    /// This function stores the MMR root of Base message state at a specific block number,
    /// which is required before any messages from that block can be proven and relayed.
    ///
    /// # Arguments
    /// * `ctx`          - The context containing accounts for storing the output root
    /// * `output_root`  - The 32-byte MMR root of Base messages for the given block
    /// * `block_number` - The Base block number this output root corresponds to
    pub fn register_output_root(
        ctx: Context<RegisterOutputRoot>,
        output_root: [u8; 32],
        block_number: u64,
    ) -> Result<()> {
        register_output_root_handler(ctx, output_root, block_number)
    }

    /// Proves that a cross-chain message exists in the Base Bridge contract using an MMR proof.
    /// This function verifies the message was included in a previously registered output root
    /// and stores the proven message state for later relay execution.
    ///
    /// # Arguments
    /// * `ctx`          - The transaction context
    /// * `nonce`        - Unique identifier for the cross-chain message
    /// * `sender`       - The 20-byte Ethereum address that sent the message on Base
    /// * `data`         - The message payload/calldata to be executed on Solana
    /// * `proof`        - MMR proof demonstrating message inclusion in the output root
    /// * `message_hash` - The 32-byte hash of the message for verification
    pub fn prove_message(
        ctx: Context<ProveMessage>,
        nonce: u64,
        sender: [u8; 20],
        data: Vec<u8>,
        proof: Proof,
        message_hash: [u8; 32],
    ) -> Result<()> {
        prove_message_handler(ctx, nonce, sender, data, proof, message_hash)
    }

    /// Executes a previously proven cross-chain message on Solana.
    /// This function takes a message that has been proven via `prove_message` and executes
    /// its payload, completing the cross-chain message transfer from Base to Solana.
    ///
    /// # Arguments
    /// * `ctx` - The transaction context
    pub fn relay_message<'a, 'info>(
        ctx: Context<'a, '_, 'info, 'info, RelayMessage<'info>>,
    ) -> Result<()> {
        relay_message_handler(ctx)
    }

    // Solana -> Base

    /// Creates a wrapped version of a Base token.
    /// This function creates a new SPL mint account on Solana that represents the Base token,
    /// enabling users to bridge the token between the two chains. It will also trigger a message
    /// to Base to register the wrapped token in the Base Bridge contract.
    ///
    /// # Arguments
    /// * `ctx`                    - The transaction context
    /// * `decimals`               - Number of decimal places for the token
    /// * `partial_token_metadata` - Token name, symbol, and other metadata for the ERC20 contract
    /// * `gas_limit`              - Maximum gas to use for the ERC20 deployment transaction on Base
    pub fn wrap_token(
        ctx: Context<WrapToken>,
        decimals: u8,
        partial_token_metadata: PartialTokenMetadata,
        gas_limit: u64,
    ) -> Result<()> {
        wrap_token_handler(ctx, decimals, partial_token_metadata, gas_limit)
    }

    /// Initiates a cross-chain function call from Solana to Base.
    /// This function allows executing arbitrary contract calls on Base using
    /// the bridge's cross-chain messaging system.
    ///
    /// # Arguments
    /// * `ctx`       - The context containing accounts for the bridge operation
    /// * `gas_limit` - Maximum gas to use for the function call on Base
    /// * `call`      - The contract call details including target address and calldata
    pub fn bridge_call(ctx: Context<BridgeCall>, gas_limit: u64, call: Call) -> Result<()> {
        bridge_call_handler(ctx, gas_limit, call)
    }

    /// Bridges native SOL tokens from Solana to Base.
    /// This function locks SOL on Solana and initiates a message to mint equivalent
    /// tokens on Base for the specified recipient.
    ///
    /// # Arguments
    /// * `ctx`          - The context containing accounts for the SOL bridge operation
    /// * `gas_limit`    - Maximum gas to use for the minting transaction on Base
    /// * `to`           - The 20-byte Ethereum address that will receive tokens on Base
    /// * `remote_token` - The 20-byte address of the token contract on Base
    /// * `amount`       - Amount of SOL to bridge (in lamports)
    /// * `call`         - Optional additional contract call to execute with the token transfer
    pub fn bridge_sol(
        ctx: Context<BridgeSol>,
        gas_limit: u64,
        to: [u8; 20],
        remote_token: [u8; 20],
        amount: u64,
        call: Option<Call>,
    ) -> Result<()> {
        bridge_sol_handler(ctx, gas_limit, to, remote_token, amount, call)
    }

    /// Bridges SPL tokens from Solana to Base.
    /// This function burns or locks SPL tokens on Solana and initiates a message to mint
    /// equivalent ERC20 tokens on Base for the specified recipient.
    ///
    /// # Arguments
    /// * `ctx`          - The context containing accounts for the SPL token bridge operation
    /// * `gas_limit`    - Maximum gas to use for the minting transaction on Base
    /// * `to`           - The 20-byte Ethereum address that will receive tokens on Base
    /// * `remote_token` - The 20-byte address of the ERC20 token contract on Base
    /// * `amount`       - Amount of SPL tokens to bridge (in lamports)
    /// * `call`         - Optional additional contract call to execute with the token transfer
    pub fn bridge_spl(
        ctx: Context<BridgeSpl>,
        gas_limit: u64,
        to: [u8; 20],
        remote_token: [u8; 20],
        amount: u64,
        call: Option<Call>,
    ) -> Result<()> {
        bridge_spl_handler(ctx, gas_limit, to, remote_token, amount, call)
    }

    /// Bridges wrapped tokens from Solana back to their native form on Base.
    /// This function burns wrapped tokens on Solana and initiates a message to release
    /// or mint the original tokens on Base for the specified recipient.
    ///
    /// # Arguments
    /// * `ctx`       - The context containing accounts for the wrapped token bridge operation
    /// * `gas_limit` - Maximum gas to use for the token release transaction on Base
    /// * `to`        - The 20-byte Ethereum address that will receive the original tokens on Base
    /// * `amount`    - Amount of wrapped tokens to bridge back (in lamports)
    /// * `call`      - Optional additional contract call to execute with the token transfer
    pub fn bridge_wrapped_token(
        ctx: Context<BridgeWrappedToken>,
        gas_limit: u64,
        to: [u8; 20],
        amount: u64,
        call: Option<Call>,
    ) -> Result<()> {
        bridge_wrapped_token_handler(ctx, gas_limit, to, amount, call)
    }
}
