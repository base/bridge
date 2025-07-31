use anchor_lang::prelude::*;

use crate::base_to_solana::TRUSTED_ORACLE;

#[constant]
pub const NATIVE_SOL_PUBKEY: Pubkey = pubkey!("SoL1111111111111111111111111111111111111111");
#[constant]
pub const MAX_GAS_LIMIT_PER_MESSAGE: u64 = 100_000_000;
#[constant]
pub const GAS_COST_SCALER_DP: u64 = 10u64.pow(6);
#[constant]
pub const GAS_COST_SCALER: u64 = 1_000_000;

#[constant]
pub const RELAY_MESSAGES_CALL_ABI_ENCODING_OVERHEAD: u64 = 544; // Fix bytes overhead for calling Bridge.relayMessages for a single call
#[constant]
pub const RELAY_MESSAGES_TRANSFER_ABI_ENCODING_OVERHEAD: u64 = 480; // Fix bytes overhead for calling Bridge.relayMessages for a single transfer
#[constant]
pub const RELAY_MESSAGES_TRANSFER_AND_CALL_ABI_ENCODING_OVERHEAD: u64 = 704; // Fix bytes overhead for calling Bridge.relayMessages for a single transfer and call

#[constant]
pub const REMOTE_TOKEN_METADATA_KEY: &str = "remote_token";
#[constant]
pub const SCALER_EXPONENT_METADATA_KEY: &str = "scaler_exponent";

#[constant]
pub const GAS_FEE_RECEIVER: Pubkey = TRUSTED_ORACLE;

#[constant]
pub const MAX_CALL_BUFFER_SIZE: usize = 8 * 1024; // 8kb max size for call buffer data

#[cfg(test)]
mod tests {
    use alloy_sol_types::{SolInterface, SolValue};

    use crate::solana_to_base::internal::solidity::{
        Bridge::{self, relayMessagesCall},
        Call, CallType, IncomingMessage, MessageType, Transfer,
    };

    use super::*;

    #[test]
    fn test_relay_messages_call_abi_encoding_overhead() {
        let call = Call {
            ty: CallType::Call,
            to: [0; 20].into(),
            value: 0,
            data: "".into(),
        };

        let incoming_msg = IncomingMessage {
            nonce: 0,
            sender: [0; 32].into(),
            gasLimit: 0,
            ty: MessageType::Call,
            data: call.abi_encode().into(),
        };

        let call = Bridge::BridgeCalls::relayMessages(relayMessagesCall {
            messages: vec![incoming_msg],
            ismData: "".as_bytes().into(),
        });

        assert_eq!(
            call.abi_encoded_size(),
            RELAY_MESSAGES_CALL_ABI_ENCODING_OVERHEAD as usize
        );
    }

    #[test]
    fn test_relay_messages_transfer_abi_encoding_overhead() {
        let transfer = Transfer {
            localToken: [0; 20].into(),
            remoteToken: [0; 32].into(),
            to: [0; 32].into(),
            remoteAmount: 0,
        };

        let incoming_msg = IncomingMessage {
            nonce: 0,
            sender: [0; 32].into(),
            gasLimit: 0,
            ty: MessageType::Transfer,
            data: transfer.abi_encode().into(),
        };

        let call = Bridge::BridgeCalls::relayMessages(relayMessagesCall {
            messages: vec![incoming_msg],
            ismData: "".as_bytes().into(),
        });

        assert_eq!(
            call.abi_encoded_size(),
            RELAY_MESSAGES_TRANSFER_ABI_ENCODING_OVERHEAD as usize
        );
    }

    #[test]
    fn test_relay_messages_transfer_and_call_abi_encoding_overhead() {
        let transfer = Transfer {
            localToken: [0; 20].into(),
            remoteToken: [0; 32].into(),
            to: [0; 32].into(),
            remoteAmount: 0,
        };

        let call = Call {
            ty: CallType::Call,
            to: [0; 20].into(),
            value: 0,
            data: "".into(),
        };

        let incoming_msg = IncomingMessage {
            nonce: 0,
            sender: [0; 32].into(),
            gasLimit: 0,
            ty: MessageType::TransferAndCall,
            data: (transfer, call).abi_encode().into(),
        };

        let call = Bridge::BridgeCalls::relayMessages(relayMessagesCall {
            messages: vec![incoming_msg],
            ismData: "".as_bytes().into(),
        });

        assert_eq!(
            call.abi_encoded_size(),
            RELAY_MESSAGES_TRANSFER_AND_CALL_ABI_ENCODING_OVERHEAD as usize
        );
    }
}
