#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

mod base_to_solana;
mod common;
mod solana_to_base;

use base_to_solana::*;
use common::*;

use common::instructions::oracle_signers::{set_oracle_signers_handler, SetOracleSigners};
use common::{
    bridge::{
        BufferConfig, Eip1559Config, GasConfig, GasCostConfig, PartnerOracleConfig, ProtocolConfig,
    },
    config::{
        set_adjustment_denominator_handler, set_block_interval_requirement_handler,
        set_gas_cost_scaler_dp_handler, set_gas_cost_scaler_handler, set_gas_fee_receiver_handler,
        set_gas_target_handler, set_max_call_buffer_size_handler, set_minimum_base_fee_handler,
        set_pause_status_handler, set_window_duration_handler,
    },
    guardian::transfer_guardian_handler,
    initialize::initialize_handler,
};
use solana_to_base::*;

#[cfg(test)]
mod test_utils;

declare_id!("ADr2FqCx35AFdS2j46gJtkoksxAFPRtjVMPo6u62tVfz");

#[program]
pub mod bridge {

    use super::*;

    // Common

    /// Initializes the bridge program with required state accounts.
    /// This function sets up the initial bridge configuration and must be called once during deployment.
    ///
    /// # Arguments
    /// * `ctx`                   - The context containing all accounts needed for initialization, including the guardian signer
    /// * `eip1559_config`        - The EIP-1559 configuration, contains the gas target, adjustment denominator, window duration, and minimum base fee
    /// * `gas_cost_config`       - The gas cost configuration, contains the gas cost scaler, gas cost scaler decimal precision, and gas fee receiver
    /// * `gas_config`            - The gas configuration, contains the gas amount per cross-chain message
    /// * `protocol_config`       - The protocol configuration, contains the block interval requirement for output root registration
    /// * `buffer_config`         - The buffer configuration, contains the maximum call buffer size
    /// * `partner_oracle_config` - Sets the program ID and account pubkey that should own the definition of valid partner oracles
    pub fn initialize(
        ctx: Context<Initialize>,
        eip1559_config: Eip1559Config,
        gas_cost_config: GasCostConfig,
        gas_config: GasConfig,
        protocol_config: ProtocolConfig,
        buffer_config: BufferConfig,
        partner_oracle_config: PartnerOracleConfig,
    ) -> Result<()> {
        initialize_handler(
            ctx,
            eip1559_config,
            gas_cost_config,
            gas_config,
            protocol_config,
            buffer_config,
            partner_oracle_config,
        )
    }

    // Base -> Solana

    /// Registers an output root from Base to enable message verification.
    /// This function stores the MMR root of Base message state at a specific block number,
    /// which is required before any messages from that block can be proven and relayed.
    ///
    /// # Arguments
    /// * `ctx`               - The context containing accounts for storing the output root (trusted oracle must sign)
    /// * `output_root`       - The 32-byte MMR root of Base messages for the given block
    /// * `base_block_number` - The Base block number this output root corresponds to
    /// * `total_leaf_count`  - The total number of leaves in the MMR with this root
    /// * `signatures`        - A list of ECDSA signatures from authorized oracles attesting to the output root
    pub fn register_output_root(
        ctx: Context<RegisterOutputRoot>,
        output_root: [u8; 32],
        base_block_number: u64,
        total_leaf_count: u64,
        signatures: Vec<[u8; 65]>,
    ) -> Result<()> {
        register_output_root_handler(
            ctx,
            output_root,
            base_block_number,
            total_leaf_count,
            signatures,
        )
    }

    /// Sets the authorized oracle EVM signer addresses and the signature threshold used
    /// when registering output roots. This function updates the `OracleSigners` account
    /// and can only be called by the guardian.
    ///
    /// # Arguments
    /// * `ctx`       - The context containing the bridge, guardian signer, and oracle signers accounts
    /// * `threshold` - The number of required unique valid signatures; must be <= number of signers
    /// * `signers`   - The list of 20-byte Ethereum addresses allowed to sign (max 32, must be unique)
    pub fn set_oracle_signers(
        ctx: Context<SetOracleSigners>,
        threshold: u8,
        signers: Vec<[u8; 20]>,
    ) -> Result<()> {
        set_oracle_signers_handler(ctx, threshold, signers)
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
        proof: Vec<[u8; 32]>,
        message_hash: [u8; 32],
    ) -> Result<()> {
        prove_message_handler(ctx, nonce, sender, data, proof, message_hash)
    }

    /// Executes a previously proven cross-chain message on Solana.
    /// This function takes a message that has been proven via `prove_message` and executes
    /// its payload using a bridge CPI authority derived from the message sender.
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
    /// * `partial_token_metadata` - Token name, symbol, remote Base token address, and scaler exponent
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
    /// * `call` - The contract call details including call type, target address, value, and calldata
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
    /// * `amount`       - Amount of SPL tokens to bridge (in the token's smallest units)
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
    /// * `amount`       - Amount of SPL tokens to bridge (in the token's smallest units)
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
    /// * `amount` - Amount of wrapped tokens to bridge back (in the token's smallest units)
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
    /// * `ctx`          - The context containing accounts for initialization (including bridge config)
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
        max_data_len: u64,
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
    /// * `ctx` - The context containing the call buffer to close and rent receiver (owner)
    pub fn close_call_buffer(ctx: Context<CloseCallBuffer>) -> Result<()> {
        close_call_buffer_handler(ctx)
    }

    /// Transfer guardian authority to a new pubkey
    /// Only the current guardian can call this function
    ///
    /// # Arguments
    /// * `ctx` - The context containing the bridge account and current guardian
    /// * `new_guardian` - The pubkey of the new guardian
    pub fn transfer_guardian(ctx: Context<SetBridgeConfig>, new_guardian: Pubkey) -> Result<()> {
        transfer_guardian_handler(ctx, new_guardian)
    }

    // EIP-1559 Configuration Management

    /// Set the minimum base fee for EIP-1559 pricing
    /// Only the guardian can call this function
    ///
    /// # Arguments
    /// * `ctx` - The context containing the bridge account and guardian
    /// * `new_fee` - The new minimum base fee value
    pub fn set_minimum_base_fee(ctx: Context<SetBridgeConfig>, new_fee: u64) -> Result<()> {
        set_minimum_base_fee_handler(ctx, new_fee)
    }

    /// Set the window duration for EIP-1559 pricing
    /// Only the guardian can call this function
    ///
    /// # Arguments
    /// * `ctx` - The context containing the bridge account and guardian
    /// * `new_duration` - The new window duration in seconds
    pub fn set_window_duration(ctx: Context<SetBridgeConfig>, new_duration: u64) -> Result<()> {
        set_window_duration_handler(ctx, new_duration)
    }

    /// Set the gas target for EIP-1559 pricing
    /// Only the guardian can call this function
    ///
    /// # Arguments
    /// * `ctx` - The context containing the bridge account and guardian
    /// * `new_target` - The new gas target value
    pub fn set_gas_target(ctx: Context<SetBridgeConfig>, new_target: u64) -> Result<()> {
        set_gas_target_handler(ctx, new_target)
    }

    /// Set the adjustment denominator for EIP-1559 pricing
    /// Only the guardian can call this function
    ///
    /// # Arguments
    /// * `ctx` - The context containing the bridge account and guardian
    /// * `new_denominator` - The new adjustment denominator
    pub fn set_adjustment_denominator(
        ctx: Context<SetBridgeConfig>,
        new_denominator: u64,
    ) -> Result<()> {
        set_adjustment_denominator_handler(ctx, new_denominator)
    }

    /// Set the gas cost scaler for Gas Cost Config
    /// Only the guardian can call this function
    ///
    /// # Arguments
    /// * `ctx` - The context containing the bridge account and guardian
    /// * `new_scaler` - The new gas cost scaler value
    pub fn set_gas_cost_scaler(ctx: Context<SetBridgeConfig>, new_scaler: u64) -> Result<()> {
        set_gas_cost_scaler_handler(ctx, new_scaler)
    }

    /// Set the gas cost scaler DP for Gas Cost Config
    /// Only the guardian can call this function
    ///
    /// # Arguments
    /// * `ctx` - The context containing the bridge account and guardian
    /// * `new_dp` - The new gas cost scaler DP value
    pub fn set_gas_cost_scaler_dp(ctx: Context<SetBridgeConfig>, new_dp: u64) -> Result<()> {
        set_gas_cost_scaler_dp_handler(ctx, new_dp)
    }

    /// Set the gas fee receiver for Gas Cost Config
    /// Only the guardian can call this function
    ///
    /// # Arguments
    /// * `ctx` - The context containing the bridge account and guardian
    /// * `new_receiver` - The new gas fee receiver
    pub fn set_gas_fee_receiver(ctx: Context<SetBridgeConfig>, new_receiver: Pubkey) -> Result<()> {
        set_gas_fee_receiver_handler(ctx, new_receiver)
    }

    /// Set the gas amount per call for Gas Config
    /// Only the guardian can call this function
    ///
    /// # Arguments
    /// * `ctx` - The context containing the bridge account and guardian
    /// * `new_val` - The new gas amount per call value
    pub fn set_gas_per_call(ctx: Context<SetBridgeConfig>, new_val: u64) -> Result<()> {
        set_gas_per_call_handler(ctx, new_val)
    }

    /// Set the block interval requirement for Protocol Config
    /// Only the guardian can call this function
    ///
    /// # Arguments
    /// * `ctx` - The context containing the bridge account and guardian
    /// * `new_interval` - The new block interval requirement value
    pub fn set_block_interval_requirement(
        ctx: Context<SetBridgeConfig>,
        new_interval: u64,
    ) -> Result<()> {
        set_block_interval_requirement_handler(ctx, new_interval)
    }

    /// Set the max call buffer size for Buffer Config
    /// Only the guardian can call this function
    ///
    /// # Arguments
    /// * `ctx` - The context containing the bridge account and guardian
    /// * `new_size` - The new max call buffer size value
    pub fn set_max_call_buffer_size(ctx: Context<SetBridgeConfig>, new_size: u64) -> Result<()> {
        set_max_call_buffer_size_handler(ctx, new_size)
    }

    /// Set the pause status for the bridge
    /// Only the guardian can call this function
    ///
    /// # Arguments
    /// * `ctx` - The context containing the bridge account and guardian
    /// * `new_paused` - The new pause status (true for paused, false for unpaused)
    pub fn set_pause_status(ctx: Context<SetBridgeConfig>, new_paused: bool) -> Result<()> {
        set_pause_status_handler(ctx, new_paused)
    }
}
