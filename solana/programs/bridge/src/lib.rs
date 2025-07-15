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

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize_handler(ctx)
    }

    // Base -> Solana

    pub fn register_output_root(
        ctx: Context<RegisterOutputRoot>,
        output_root: [u8; 32],
        block_number: u64,
    ) -> Result<()> {
        register_output_root_handler(ctx, output_root, block_number)
    }

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

    pub fn relay_message<'a, 'info>(
        ctx: Context<'a, '_, 'info, 'info, RelayMessage<'info>>,
    ) -> Result<()> {
        relay_message_handler(ctx)
    }

    // Solana -> Base

    pub fn wrap_token(
        ctx: Context<WrapToken>,
        decimals: u8,
        partial_token_metadata: PartialTokenMetadata,
        gas_limit: u64,
    ) -> Result<()> {
        wrap_token_handler(ctx, decimals, partial_token_metadata, gas_limit)
    }

    pub fn bridge_call(ctx: Context<BridgeCall>, gas_limit: u64, call: Call) -> Result<()> {
        bridge_call_handler(ctx, gas_limit, call)
    }

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
