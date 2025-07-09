// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IncomingMessage} from "./libraries/MessageLib.sol";
import {Ownable} from "solady/auth/Ownable.sol";

/// @title ISMVerification
///
/// @notice A verification contract for ISM Messages being broadcasted from Solana to Base by requiring 
///         a specific minimum amount of validators to sign the message.
///
/// @dev This contract is only relevant for Stage 0 of the bridge where offchain oracle handles the relaying 
///      of messages. This contract should be irrelevant for Stage 1, where messages will automatically be 
///      included by the Base sequencer.
contract ISMVerification is Ownable {
    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice The length of a signature in bytes.
    uint256 public constant SIGNATURE_LENGTH_THRESHOLD = 65;

    //////////////////////////////////////////////////////////////
    ///                       Storage                          ///
    //////////////////////////////////////////////////////////////

    /// @notice Mapping of validator addresses to their status
    mapping(address => bool) public validators;

    /// @notice ISM verification threshold.
    uint128 public threshold;

    /// @notice Count of validators.
    uint128 public validatorCount;

    //////////////////////////////////////////////////////////////
    ///                       Events                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Emitted whenever the threshold is updated.
    event ThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    /// @notice Emitted whenever a validator is added.
    event ValidatorAdded(address validator);

    /// @notice Emitted whenever a validator is removed.
    event ValidatorRemoved(address validator);

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when threshold is 0.
    error InvalidThreshold();

    /// @notice Thrown when the signature length is invalid.
    error InvalidSignatureLength();

    /// @notice Thrown when a validator is already added.
    error ValidatorAlreadyAdded();

    /// @notice Thrown when a validator is not a validator.
    error ValidatorNotExisted();

    /// @notice Thrown when signatures are not in ascending order.
    error InvalidSignatureOrder();

    /// @notice Thrown when ISM data is empty.
    error EmptyISMData();

    //////////////////////////////////////////////////////////////
    ///                       Constructor                      ///
    //////////////////////////////////////////////////////////////

    /// @notice Constructs the ISMVerification contract.
    ///
    /// @param _validators Array of validator addresses.
    /// @param _threshold The ISM verification threshold.
    /// @param _owner The owner of the contract.
    constructor(address[] memory _validators, uint128 _threshold, address _owner) {
        require(_threshold > 0 && _threshold <= _validators.length, InvalidThreshold());

        for (uint128 i = 0; i < _validators.length; i++) {
            validators[_validators[i]] = true;
        }
        validatorCount = uint128(_validators.length);
        threshold = _threshold;

        _initializeOwner(_owner);
    }

    //////////////////////////////////////////////////////////////
    ///                    External Functions                  ///
    //////////////////////////////////////////////////////////////

    /// @notice Sets the ISM verification threshold.
    ///
    /// @param newThreshold The new ISM verification threshold.
    function setThreshold(uint128 newThreshold) public onlyOwner {
        require(newThreshold > 0 && newThreshold <= validatorCount, InvalidThreshold());
        threshold = newThreshold;

        emit ThresholdUpdated(threshold, newThreshold);
    }

    /// @notice Add a validator to the set
    ///
    /// @param validator Address to add as validator
    function addValidator(address validator) external onlyOwner {
        require(!validators[validator], ValidatorAlreadyAdded());
        validators[validator] = true;

        unchecked {
            validatorCount++;
        }

        emit ValidatorAdded(validator);
    }

    /// @notice Remove a validator from the set
    ///
    /// @param validator Address to remove
    function removeValidator(address validator) external onlyOwner {
        require(validators[validator], ValidatorNotExisted());
        validators[validator] = false;

        unchecked {
            validatorCount--;
        }

        emit ValidatorRemoved(validator);
    }

    //////////////////////////////////////////////////////////////
    ///                 External View Functions                ///
    //////////////////////////////////////////////////////////////

    /// @notice Verifies the ISM by checking M-of-N validator signatures.
    ///
    /// @param messages The messages to be verified.
    /// @param ismData The ISM data containing concatenated signatures.
    ///
    /// @return True if the ISM is verified, false otherwise.
    function isApproved(IncomingMessage[] calldata messages, bytes calldata ismData) external view returns (bool) {
        // Check that the provided signature data is not too short
        require(ismData.length >= threshold * SIGNATURE_LENGTH_THRESHOLD, InvalidSignatureLength());

        uint256 offset;
        assembly {
            offset := ismData.offset
        }

        // Compute hash of the messages being verified
        bytes32 messageHash = keccak256(abi.encode(messages));
        // There cannot be a validator with address 0
        address lastValidator = address(0);

        // Verify M-of-N signatures
        for (uint256 i = 0; i < threshold; i++) {
            (uint8 v, bytes32 r, bytes32 s) = signatureSplit(offset, i);

            // Standard ECDSA signature recovery
            address currentValidator = ecrecover(messageHash, v, r, s);
            
            // Check for duplicate signers
            if (currentValidator == lastValidator) {
                return false;
            }

            // Ensure ascending order
            if (currentValidator < lastValidator) {
                return false;
            }

            // Verify signer is a registered validator
            if (!validators[currentValidator]) {
                return false;
            }

            lastValidator = currentValidator;
        }

        return true;
    }

    //////////////////////////////////////////////////////////////
    ///                   Internal Functions                   ///
    //////////////////////////////////////////////////////////////

    /// @notice Splits signature bytes into v, r, s components
    ///
    /// @param signaturesCalldataOffset Calldata offset where signatures bytes starts
    /// @param pos Position of signature to split (0-indexed)
    ///
    /// @return v The recovery id
    /// @return r The r component of the signature
    /// @return s The s component of the signature
    function signatureSplit(uint256 signaturesCalldataOffset, uint256 pos)
        internal
        pure
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        assembly {
            let signaturePos := mul(0x41, pos)  // 65 bytes per signature
            r := calldataload(add(signaturesCalldataOffset, signaturePos))          // r at offset 0
            s := calldataload(add(signaturesCalldataOffset, add(signaturePos, 0x20))) // s at offset 32
            v := and(calldataload(add(signaturesCalldataOffset, add(signaturePos, 0x21))), 0xff) // v at offset 64
        }
    }
}
