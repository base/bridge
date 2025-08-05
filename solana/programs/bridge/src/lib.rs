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

declare_id!("4L8cUU2DXTzEaa5C8MWLTyEV8dpmpDbCjg8DNgUuGedc");

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

    /// Closes an outgoing message account after it has been relayed to Base.
    ///
    /// # Arguments
    /// * `ctx` - The context containing accounts for closing the outgoing message
    pub fn close_outgoing_message(ctx: Context<CloseOutgoingMessage>) -> Result<()> {
        close_outgoing_message_handler(ctx)
    }

    // Base -> Solana

    /// Registers an output root from Base to enable message verification.
    /// This function stores the MMR root of Base message state at a specific block number,
    /// which is required before any messages from that block can be proven and relayed.
    ///
    /// # Arguments
    /// * `ctx`                     - The context containing accounts for storing the output root
    /// * `output_root`             - The 32-byte MMR root of Base messages for the given block
    /// * `base_block_number`       - The Base block number this output root corresponds to
    /// * `base_last_relayed_nonce` - The most recent nonce received on Base
    pub fn register_output_root(
        ctx: Context<RegisterOutputRoot>,
        output_root: [u8; 32],
        base_block_number: u64,
        base_last_relayed_nonce: u64, // TODO: this no longer works if we aren't enforcing strict transaction ordering on Base. Will address in a separate PR
    ) -> Result<()> {
        register_output_root_handler(ctx, output_root, base_block_number, base_last_relayed_nonce)
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
    pub fn wrap_token(
        ctx: Context<WrapToken>,
        decimals: u8,
        partial_token_metadata: PartialTokenMetadata,
    ) -> Result<()> {
        wrap_token_handler(ctx, decimals, partial_token_metadata)
    }

    /// Initiates a cross-chain function call from Solana to Base.
    /// This function allows executing arbitrary contract calls on Base using
    /// the bridge's cross-chain messaging system.
    ///
    /// # Arguments
    /// * `ctx`  - The context containing accounts for the bridge operation
    /// * `call` - The contract call details including target address and calldata
    pub fn bridge_call(ctx: Context<BridgeCall>, call: Call) -> Result<()> {
        bridge_call_handler(ctx, call)
    }

    /// Bridges a call using data from a call buffer account.
    /// This instruction consumes the call buffer and creates an outgoing message
    /// for execution on Base.
    ///
    /// # Arguments
    /// * `ctx` - The context containing accounts for the bridge operation
    pub fn bridge_call_buffered<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, BridgeCallBuffered<'info>>,
    ) -> Result<()> {
        bridge_call_buffered_handler(ctx)
    }

    /// Bridges native SOL tokens from Solana to Base.
    /// This function locks SOL on Solana and initiates a message to mint equivalent
    /// tokens on Base for the specified recipient.
    ///
    /// # Arguments
    /// * `ctx`          - The context containing accounts for the SOL bridge operation
    /// * `to`           - The 20-byte Ethereum address that will receive tokens on Base
    /// * `remote_token` - The 20-byte address of the token contract on Base
    /// * `amount`       - Amount of SOL to bridge (in lamports)
    /// * `call`         - Optional additional contract call to execute with the token transfer
    pub fn bridge_sol(
        ctx: Context<BridgeSol>,
        to: [u8; 20],
        remote_token: [u8; 20],
        amount: u64,
        call: Option<Call>,
    ) -> Result<()> {
        bridge_sol_handler(ctx, to, remote_token, amount, call)
    }

    /// Bridges native SOL tokens from Solana to Base with a call using buffered data.
    /// This function locks SOL on Solana and initiates a message to mint equivalent
    /// tokens on Base, then executes a call using data from a call buffer.
    ///
    /// # Arguments
    /// * `ctx`          - The context containing accounts for the SOL bridge operation
    /// * `to`           - The 20-byte Ethereum address that will receive tokens on Base
    /// * `remote_token` - The 20-byte address of the token contract on Base
    /// * `amount`       - Amount of SOL to bridge (in lamports)
    pub fn bridge_sol_with_buffered_call<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, BridgeSolWithBufferedCall<'info>>,
        to: [u8; 20],
        remote_token: [u8; 20],
        amount: u64,
    ) -> Result<()> {
        bridge_sol_with_buffered_call_handler(ctx, to, remote_token, amount)
    }

    /// Bridges SPL tokens from Solana to Base.
    /// This function burns or locks SPL tokens on Solana and initiates a message to mint
    /// equivalent ERC20 tokens on Base for the specified recipient.
    ///
    /// # Arguments
    /// * `ctx`          - The context containing accounts for the SPL token bridge operation
    /// * `to`           - The 20-byte Ethereum address that will receive tokens on Base
    /// * `remote_token` - The 20-byte address of the ERC20 token contract on Base
    /// * `amount`       - Amount of SPL tokens to bridge (in lamports)
    /// * `call`         - Optional additional contract call to execute with the token transfer
    pub fn bridge_spl(
        ctx: Context<BridgeSpl>,
        to: [u8; 20],
        remote_token: [u8; 20],
        amount: u64,
        call: Option<Call>,
    ) -> Result<()> {
        bridge_spl_handler(ctx, to, remote_token, amount, call)
    }

    /// Bridges SPL tokens from Solana to Base with a call using buffered data.
    /// This function locks SPL tokens on Solana and initiates a message to mint equivalent
    /// tokens on Base, then executes a call using data from a call buffer.
    ///
    /// # Arguments
    /// * `ctx`          - The context containing accounts for the SPL token bridge operation
    /// * `to`           - The 20-byte Ethereum address that will receive tokens on Base
    /// * `remote_token` - The 20-byte address of the ERC20 token contract on Base
    /// * `amount`       - Amount of SPL tokens to bridge (in lamports)
    pub fn bridge_spl_with_buffered_call<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, BridgeSplWithBufferedCall<'info>>,
        to: [u8; 20],
        remote_token: [u8; 20],
        amount: u64,
    ) -> Result<()> {
        bridge_spl_with_buffered_call_handler(ctx, to, remote_token, amount)
    }

    /// Bridges wrapped tokens from Solana back to their native form on Base.
    /// This function burns wrapped tokens on Solana and initiates a message to release
    /// or mint the original tokens on Base for the specified recipient.
    ///
    /// # Arguments
    /// * `ctx`    - The context containing accounts for the wrapped token bridge operation
    /// * `to`     - The 20-byte Ethereum address that will receive the original tokens on Base
    /// * `amount` - Amount of wrapped tokens to bridge back (in lamports)
    /// * `call`   - Optional additional contract call to execute with the token transfer
    pub fn bridge_wrapped_token(
        ctx: Context<BridgeWrappedToken>,
        to: [u8; 20],
        amount: u64,
        call: Option<Call>,
    ) -> Result<()> {
        bridge_wrapped_token_handler(ctx, to, amount, call)
    }

    /// Bridges wrapped tokens from Solana back to Base with a call using buffered data.
    /// This function burns wrapped tokens on Solana and initiates a message to release
    /// the original tokens on Base, then executes a call using data from a call buffer.
    ///
    /// # Arguments
    /// * `ctx`    - The context containing accounts for the wrapped token bridge operation
    /// * `to`     - The 20-byte Ethereum address that will receive tokens on Base
    /// * `amount` - Amount of wrapped tokens to bridge back (in lamports)
    pub fn bridge_wrapped_token_with_buffered_call<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, BridgeWrappedTokenWithBufferedCall<'info>>,
        to: [u8; 20],
        amount: u64,
    ) -> Result<()> {
        bridge_wrapped_token_with_buffered_call_handler(ctx, to, amount)
    }

    /// Initializes a call buffer account that can store large call data.
    /// This account can be used to build up call data over multiple transactions
    /// before using it in a bridge operation.
    ///
    /// # Arguments
    /// * `ctx`          - The context containing accounts for initialization
    /// * `ty`           - The type of call (Call, DelegateCall, Create, Create2)
    /// * `to`           - The target contract address on Base
    /// * `value`        - The amount of ETH to send with the call (in wei)
    /// * `initial_data` - Initial call data to store
    /// * `max_data_len` - Maximum total length of data that will be stored
    pub fn initialize_call_buffer(
        ctx: Context<InitializeCallBuffer>,
        ty: CallType,
        to: [u8; 20],
        value: u128,
        initial_data: Vec<u8>,
        max_data_len: usize,
    ) -> Result<()> {
        initialize_call_buffer_handler(ctx, ty, to, value, initial_data, max_data_len)
    }

    /// Appends data to an existing call buffer account.
    /// Only the owner of the call buffer can append data to it.
    ///
    /// # Arguments
    /// * `ctx`  - The context containing the call buffer account
    /// * `data` - Additional data to append to the buffer
    pub fn append_to_call_buffer(ctx: Context<AppendToCallBuffer>, data: Vec<u8>) -> Result<()> {
        append_to_call_buffer_handler(ctx, data)
    }

    /// Closes a call buffer account and returns the rent to the specified receiver.
    /// Only the owner of the call buffer can close it. This is useful if the user
    /// changed their mind or made a mistake and wants to recover the rent.
    ///
    /// # Arguments
    /// * `ctx` - The context containing the call buffer to close and rent receiver
    pub fn close_call_buffer(ctx: Context<CloseCallBuffer>) -> Result<()> {
        close_call_buffer_handler(ctx)
    }
}
