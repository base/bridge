// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Pubkey} from "./SVMLib.sol";

/// @notice Enum containing operation types.
enum MessageType {
    Call,
    Transfer,
    TransferAndCall
}

/// @notice Message sent from Solana to Base.
///
/// @custom:field sourceChainId The chain ID of the source chain this message is coming from.
/// @custom:field nonce Unique nonce for the message.
/// @custom:field sender The Solana sender's pubkey.
/// @custom:field operations The operations to be executed.
struct IncomingMessage {
    uint256 sourceChainId;
    uint64 nonce;
    Pubkey sender;
    MessageType ty;
    bytes data;
}

library MessageLib {
    function getMessageHashCd(IncomingMessage calldata message) internal pure returns (bytes32) {
        return keccak256(abi.encode(message.nonce, getInnerMessageHashCd(message)));
    }

    function getMessageHash(IncomingMessage memory message) internal pure returns (bytes32) {
        return keccak256(abi.encode(message.nonce, getInnerMessageHash(message)));
    }

    function getInnerMessageHashCd(IncomingMessage calldata message) internal pure returns (bytes32) {
        return keccak256(abi.encode(message.sourceChainId, message.sender, message.ty, message.data));
    }

    function getInnerMessageHash(IncomingMessage memory message) internal pure returns (bytes32) {
        return keccak256(abi.encode(message.sourceChainId, message.sender, message.ty, message.data));
    }
}
