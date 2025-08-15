// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ECDSA} from "solady/utils/ECDSA.sol";

/// @title BridgeValidator
///
/// @notice A validator contract to be used during the Stage 0 phase of Base Bridge. This will likely later be replaced
///         by `CrossL2Inbox` from the OP Stack.
contract BridgeValidator {
    using ECDSA for bytes32;

    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice The length of a signature in bytes.
    uint256 public constant SIGNATURE_LENGTH_THRESHOLD = 65;

    /// @notice Address of the trusted relayer that pre-verifies new messages from Solana.
    address public immutable BASE_ORACLE;

    /// @notice Required number of signatures from bridge partner
    uint256 public immutable PARTNER_VALIDATOR_THRESHOLD;

    //////////////////////////////////////////////////////////////
    ///                       Storage                          ///
    //////////////////////////////////////////////////////////////

    /// @notice The next expected nonce to be received in `registerMessages`
    uint256 public nextNonce;

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
    event MessageRegistered(bytes32 indexed messageHashes);

    /// @notice Emitted when a cross chain message is being executed.
    ///
    /// @param msgHash Hash of message payload being executed.
    event ExecutingMessage(bytes32 indexed msgHash);

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when `validatorSigs` verification fails. These are signatures from our bridge partner's
    /// validators.
    error Unauthenticated();

    /// @notice Thrown when the provided `validatorSigs` byte string length is not a multiple of 65
    error InvalidSignatureLength();

    /// @notice Thrown when the required amount of signatures is not included with a `registerMessages` call
    error ThresholdNotMet();

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @notice Deploys the BridgeValidator contract with a specified trusted relayer
    ///
    /// @param trustedRelayer The address with permission to call `registerMessages`
    /// @param partnerValidatorThreshold The number of partner validator signatures required for message pre-validation
    constructor(address trustedRelayer, uint256 partnerValidatorThreshold) {
        BASE_ORACLE = trustedRelayer;
        PARTNER_VALIDATOR_THRESHOLD = partnerValidatorThreshold;
    }

    /// @notice Pre-validates a batch of Solana --> Base messages.
    ///
    /// @param innerMessageHashes An array of incoming message hashes to pre-validate (this is a hash of all message
    ///                           data except for the nonce)
    /// @param validatorSigs A concatenated bytes array of bridge partner validator signatures attesting to the
    ///                      validity of `messageHashes`
    function registerMessages(bytes32[] calldata innerMessageHashes, bytes calldata validatorSigs) external {
        bytes32[] memory messageHashes = new bytes32[](innerMessageHashes.length);
        uint256 currentNonce = nextNonce;

        for (uint256 i; i < messageHashes.length; i++) {
            messageHashes[i] = keccak256(abi.encode(currentNonce++, innerMessageHashes[i]));
        }

        require(_validatorSigsAreValid({messageHashes: messageHashes, sigData: validatorSigs}), Unauthenticated());

        for (uint256 i; i < messageHashes.length; i++) {
            validMessages[messageHashes[i]] = true;
            emit MessageRegistered(messageHashes[i]);
        }

        nextNonce = currentNonce;
    }

    //////////////////////////////////////////////////////////////
    ///                    Private Functions                   ///
    //////////////////////////////////////////////////////////////

    function _validatorSigsAreValid(bytes32[] memory messageHashes, bytes calldata sigData)
        private
        view
        returns (bool)
    {
        // Check that the provided signature data is not too short
        require(sigData.length % SIGNATURE_LENGTH_THRESHOLD == 0, InvalidSignatureLength());

        uint256 sigCount = sigData.length / SIGNATURE_LENGTH_THRESHOLD;
        address[] memory partnerValidators = new address[](0);
        bytes32 signedHash = ECDSA.toEthSignedMessageHash(abi.encode(messageHashes));
        address lastValidator = address(0);

        uint256 offset;
        assembly {
            offset := sigData.offset
        }

        bool signedByBaseOracle;
        uint256 externalSigners;

        for (uint256 i; i < sigCount; i++) {
            (uint8 v, bytes32 r, bytes32 s) = _signatureSplit(offset, i);
            address currentValidator = signedHash.recover(v, r, s);

            if (currentValidator == lastValidator) {
                return false;
            }

            if (currentValidator < lastValidator) {
                return false;
            }

            // Verify signer is valid
            if (currentValidator == BASE_ORACLE) {
                signedByBaseOracle = true;
            } else {
                // Check if registered partner validator
                if (_addressInList(partnerValidators, currentValidator)) {
                    unchecked {
                        externalSigners++;
                    }
                }
            }

            lastValidator = currentValidator;
        }

        require(signedByBaseOracle && externalSigners >= PARTNER_VALIDATOR_THRESHOLD, ThresholdNotMet());

        return true;
    }

    function _signatureSplit(uint256 signaturesCalldataOffset, uint256 pos)
        private
        pure
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        assembly {
            let signaturePos := mul(0x41, pos) // 65 bytes per signature
            r := calldataload(add(signaturesCalldataOffset, signaturePos)) // r at offset 0
            s := calldataload(add(signaturesCalldataOffset, add(signaturePos, 0x20))) // s at offset 32
            v := and(calldataload(add(signaturesCalldataOffset, add(signaturePos, 0x21))), 0xff) // v at offset 64
        }
    }

    function _addressInList(address[] memory addrs, address addr) private pure returns (bool) {
        for (uint256 i; i < addrs.length; i++) {
            if (addr == addrs[i]) {
                return true;
            }
        }
        return false;
    }
}
