// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title BridgeValidator
///
/// @notice A validator contract to be used during the Stage 0 phase of Base Bridge. This will likely later be replaced
///         by `CrossL2Inbox` from the OP Stack.
contract BridgeValidator {
    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice Address of the trusted relayer that pre-verifies new messages from Solana.
    address public immutable TRUSTED_RELAYER;

    //////////////////////////////////////////////////////////////
    ///                       Storage                          ///
    //////////////////////////////////////////////////////////////

    /// @notice A mapping of pre-validated valid messages. Each pre-validated message corresponds to a message sent
    ///         from Solana.
    mapping(bytes32 messageHash => bool isValid) public validMessages;

    //////////////////////////////////////////////////////////////
    ///                       Events                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Emitted when messages are registered by our trusted relayer.
    ///
    /// @param messageHashes An array of pre-validated message hashes. Each hash is a hash of an `IncomingMessage` from
    ///                      the `Bridge` contract.
    event MessagesRegistered(bytes32[] messageHashes);

    /// @notice Emitted when a cross chain message is being executed.
    ///
    /// @param msgHash Hash of message payload being executed.
    event ExecutingMessage(bytes32 indexed msgHash);

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when an entity other than `TRUSTED_RELAYER` attempts to call `registerMessages`
    error InvalidCaller();

    /// @notice Thrown when `validatorSigs` verification fails. These are signatures from our bridge partner's
    /// validators.
    error Unauthenticated();

    /// @notice Thrown when `validateMessage` is called with a message hash that has not been pre-validated.
    error InvalidMessage();

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @notice Deploys the BridgeValidator contract with a specified trusted relayer
    ///
    /// @param trustedRelayer The address with permission to call `registerMessages`
    constructor(address trustedRelayer) {
        TRUSTED_RELAYER = trustedRelayer;
    }

    /// @notice Pre-validates a batch of Solana --> Base messages.
    ///
    /// @param messageHashes An array of message hashes to pre-validata
    /// @param validatorSigs A concatenated bytes array of bridge partner validator signatures attesting to the validity
    ///                      of `messageHashes`
    function registerMessages(bytes32[] calldata messageHashes, bytes calldata validatorSigs) external {
        if (msg.sender != TRUSTED_RELAYER) {
            revert InvalidCaller();
        }

        if (!_validatorSigsAreValid(validatorSigs)) {
            revert Unauthenticated();
        }

        for (uint256 i; i < messageHashes.length; i++) {
            validMessages[messageHashes[i]] = true;
        }

        emit MessagesRegistered(messageHashes);
    }

    /// @notice Validates a cross chain message on the destination chain and emits an ExecutingMessage event. This
    ///         function is useful for applications that understand the schema of the message payload and want to
    ///         process it in a custom way.
    ///
    /// @param messageHash Hash of the message payload to call target with.
    function validateMessage(bytes32 messageHash) external {
        if (!validMessages[messageHash]) {
            revert InvalidMessage();
        }

        emit ExecutingMessage(messageHash);
    }

    //////////////////////////////////////////////////////////////
    ///                    Private Functions                   ///
    //////////////////////////////////////////////////////////////

    function _validatorSigsAreValid(bytes calldata) private pure returns (bool) {
        return true;
    }
}
