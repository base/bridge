pragma solidity ^0.8.28;

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
/// @custom:field operations The operations to be executed.
struct IncomingMessage {
    uint64 nonce;
    Pubkey sender;
    uint64 gasLimit;
    MessageType ty;
    bytes data;
}
