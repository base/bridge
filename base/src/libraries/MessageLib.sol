// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EfficientHashLib} from "solady/utils/EfficientHashLib.sol";

import {Pubkey} from "./SVMLib.sol";

/// @notice Enum containing operation types.
enum MessageType {
    Call,
    Transfer,
    TransferAndCall
}

/// @notice Message sent from Solana to Base.
///
/// @custom:field nonce Unique nonce for the message.
/// @custom:field sender The Solana sender's pubkey.
/// @custom:field gasLimit The gas limit for the message execution.
/// @custom:field ty The message type to execute (Call, Transfer, or TransferAndCall).
/// @custom:field data Encoded payload associated with the message type.
struct IncomingMessage {
    uint64 nonce;
    Pubkey sender;
    uint64 gasLimit;
    MessageType ty;
    bytes data;
}

library MessageLib {
    function getMessageHashCd(IncomingMessage calldata message) internal pure returns (bytes32) {
        return getMessageHash(message.nonce, getInnerMessageHashCd(message));
    }

    function getMessageHash(IncomingMessage memory message) internal pure returns (bytes32) {
        return getMessageHash(message.nonce, getInnerMessageHash(message));
    }

    function getMessageHash(uint256 nonce, bytes32 innerMessageHash) internal pure returns (bytes32) {
        return EfficientHashLib.hash(bytes32(nonce), innerMessageHash);
    }

    function getInnerMessageHashCd(IncomingMessage calldata message) internal pure returns (bytes32) {
        return keccak256(abi.encode(message.sender, message.ty, message.data));
    }

    function getInnerMessageHash(IncomingMessage memory message) internal pure returns (bytes32) {
        return keccak256(abi.encode(message.sender, message.ty, message.data));
    }
}
