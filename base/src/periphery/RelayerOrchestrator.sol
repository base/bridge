// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Bridge} from "../Bridge.sol";
import {BridgeValidator} from "../BridgeValidator.sol";
import {IncomingMessage} from "../libraries/MessageLib.sol";

/// @title RelayerOrchestrator
///
/// @notice An orchestration contract that allows a relayer to submit message pre-validation + execution in the same
///         transaction.
contract RelayerOrchestrator {
    /// @dev Represents a message to be executed on Base
    struct MessageToExecute {
        /// @dev The nonce value from the `MessageToRelay` account on Solana from the base_relayer program
        uint256 nonce;
        /// @dev The incoming message to execute through the Bridge contract
        IncomingMessage message;
    }
    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice Address of the Base Bridge contract. This is the destination address for executing messages
    address public immutable BRIDGE;

    /// @notice Address of the BridgeValidator contract. Messages will be pre-validated there by our oracle & bridge
    ///         partner.
    address public immutable BRIDGE_VALIDATOR;

    /// @notice The next expected nonce of a message to be executed
    uint256 public nextNonce;

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when a zero address is detected
    error ZeroAddress();

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @dev Initializes contract with the bridge and bridgeValidator addresses
    ///
    /// @param bridge          Address of the Base Bridge contract.
    /// @param bridgeValidator Address of the BridgeValidator contract.
    constructor(address bridge, address bridgeValidator) {
        require(bridge != address(0), ZeroAddress());
        require(bridgeValidator != address(0), ZeroAddress());

        BRIDGE = bridge;
        BRIDGE_VALIDATOR = bridgeValidator;
    }

    /// @notice Open function to atomically pre-validate and execute a batch of messages in the same transaction
    ///
    /// @param innerMessageHashes An array of inner message hashes to pre-validate (hash over message data excluding the
    ///                           nonce and gasLimit).
    /// @param messagesToExecute  The messages to relay. Not necessarily a 1:1 mapping with innerMessageHashes.
    /// @param validatorSigs      A concatenated bytes array of signatures over the EIP-191 `eth_sign` digest of
    ///                           `abi.encode(messageHashes)`, provided in strictly ascending order by signer address.
    function validateAndRelay(
        bytes32[] calldata innerMessageHashes,
        MessageToExecute[] calldata messagesToExecute,
        bytes calldata validatorSigs
    ) external {
        if (innerMessageHashes.length > 0) {
            BridgeValidator(BRIDGE_VALIDATOR).registerMessages(innerMessageHashes, validatorSigs);
        }

        uint256 msgCount = messagesToExecute.length;

        if (msgCount > 0) {
            uint256 currentNextNonce = nextNonce;
            uint256 i;
            IncomingMessage[] memory messages = new IncomingMessage[](msgCount);

            for (; i < msgCount; i++) {
                if (messagesToExecute[i].nonce != currentNextNonce + i) {
                    break;
                }
                messages[i] = messagesToExecute[i].message;
            }

            // Only process messages if entire batch passed the nonce check
            if (i == msgCount) {
                nextNonce = currentNextNonce + msgCount;
                Bridge(BRIDGE).relayMessages(messages);
            }
        }
    }
}
