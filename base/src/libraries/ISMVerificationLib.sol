// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IncomingMessage} from "./MessageLib.sol";

/// @notice Storage layout used by this library.
///
/// @custom:storage-location erc7201:coinbase.storage.ISMVerificationLib
///
/// @custom:field validators Mapping of validator addresses to their status.
/// @custom:field threshold ISM verification threshold.
/// @custom:field validatorCount Count of validators.
struct ISMVerificationLibStorage {
    mapping(address => bool) validators;
    uint128 threshold;
    uint128 validatorCount;
}

/// @title ISMVerificationLib
///
/// @notice A verification contract for ISM Messages being broadcasted from Solana to Base by requiring
///         a specific minimum amount of validators to sign the message.
///
/// @dev This contract is only relevant for Stage 0 of the bridge where offchain oracle handles the relaying
///      of messages. This contract should be irrelevant for Stage 1, where messages will automatically be
///      included by the Base sequencer.
library ISMVerificationLib {
    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice The length of a signature in bytes.
    uint256 public constant SIGNATURE_LENGTH_THRESHOLD = 65;

    /// @dev Slot for the `ISMVerificationLibStorage` struct in storage.
    ///      Computed from:
    ///         keccak256(abi.encode(uint256(keccak256("coinbase.storage.ISMVerificationLib")) - 1)) &
    /// ~bytes32(uint256(0xff))
    ///
    ///      Follows ERC-7201 (see https://eips.ethereum.org/EIPS/eip-7201).
    bytes32 private constant _ISM_VERIFICATION_LIB_STORAGE_LOCATION =
        0x1582f9f697ded5d43fefcc3b17d32db62bed76de33f6333a7eef286277528a00;

    //////////////////////////////////////////////////////////////
    ///                       Events                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Emitted whenever the threshold is updated.
    event ThresholdUpdated(uint256 newThreshold);

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

    /// @notice Thrown when a validator address is 0.
    error InvalidValidatorAddress();

    /// @notice Thrown when a validator is already added.
    error ValidatorAlreadyAdded();

    /// @notice Thrown when a validator is not a validator.
    error ValidatorNotExisted();

    /// @notice Thrown when signatures are not in ascending order.
    error InvalidSignatureOrder();

    /// @notice Thrown when ISM data is empty.
    error EmptyISMData();

    /// @notice Thrown when validator count is less than threshold.
    error ValidatorCountLessThanThreshold();

    //////////////////////////////////////////////////////////////
    ///                       Internal Functions               ///
    //////////////////////////////////////////////////////////////

    /// @notice Helper function to get a storage reference to the `ISMVerificationLibStorage` struct.
    ///
    /// @return $ A storage reference to the `ISMVerificationLibStorage` struct.
    function getISMVerificationLibStorage() internal pure returns (ISMVerificationLibStorage storage $) {
        assembly ("memory-safe") {
            $.slot := _ISM_VERIFICATION_LIB_STORAGE_LOCATION
        }
    }

    /// @notice Initializes the ISM verification library.
    ///
    /// @param validators Array of validator addresses.
    /// @param threshold The ISM verification threshold.
    function initialize(address[] calldata validators, uint128 threshold) internal {
        ISMVerificationLibStorage storage $ = getISMVerificationLibStorage();

        require(threshold > 0 && threshold <= validators.length, InvalidThreshold());

        for (uint128 i = 0; i < validators.length; i++) {
            require(validators[i] != address(0), InvalidValidatorAddress());
            require(!$.validators[validators[i]], ValidatorAlreadyAdded());
            $.validators[validators[i]] = true;
        }
        $.validatorCount = uint128(validators.length);
        $.threshold = threshold;
    }

    /// @notice Sets the ISM verification threshold.
    ///
    /// @param newThreshold The new ISM verification threshold.
    function setThreshold(uint128 newThreshold) internal {
        ISMVerificationLibStorage storage $ = getISMVerificationLibStorage();
        require(newThreshold > 0 && newThreshold <= $.validatorCount, InvalidThreshold());

        $.threshold = newThreshold;

        emit ThresholdUpdated(newThreshold);
    }

    /// @notice Add a validator to the set
    ///
    /// @param validator Address to add as validator
    function addValidator(address validator) internal {
        ISMVerificationLibStorage storage $ = getISMVerificationLibStorage();
        require(validator != address(0), InvalidValidatorAddress());
        require(!$.validators[validator], ValidatorAlreadyAdded());

        $.validators[validator] = true;

        unchecked {
            $.validatorCount++;
        }

        emit ValidatorAdded(validator);
    }

    /// @notice Remove a validator from the set
    ///
    /// @param validator Address to remove
    function removeValidator(address validator) internal {
        ISMVerificationLibStorage storage $ = getISMVerificationLibStorage();
        require($.validators[validator], ValidatorNotExisted());
        require($.validatorCount - 1 >= $.threshold, ValidatorCountLessThanThreshold());

        $.validators[validator] = false;

        unchecked {
            $.validatorCount--;
        }

        emit ValidatorRemoved(validator);
    }

    /// @notice Verifies the ISM by checking M-of-N validator signatures.
    ///
    /// @param messages The messages to be verified.
    /// @param ismData The ISM data containing concatenated signatures.
    ///
    /// @return True if the ISM is verified, false otherwise.
    function isApproved(IncomingMessage[] calldata messages, bytes calldata ismData) internal view returns (bool) {
        ISMVerificationLibStorage storage $ = getISMVerificationLibStorage();

        // Check that the provided signature data is not too short
        require(ismData.length >= $.threshold * SIGNATURE_LENGTH_THRESHOLD, InvalidSignatureLength());

        uint256 offset;
        assembly {
            offset := ismData.offset
        }

        // Compute hash of the messages being verified
        bytes32 messageHash = keccak256(abi.encode(messages));
        // There cannot be a validator with address 0
        address lastValidator = address(0);

        // Verify M-of-N signatures
        for (uint256 i = 0; i < $.threshold; i++) {
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
            if (!$.validators[currentValidator]) {
                return false;
            }

            lastValidator = currentValidator;
        }

        return true;
    }

    /// @notice Gets the current threshold.
    ///
    /// @return The current threshold.
    function getThreshold() internal view returns (uint128) {
        ISMVerificationLibStorage storage $ = getISMVerificationLibStorage();
        return $.threshold;
    }

    /// @notice Gets the current validator count.
    ///
    /// @return The current validator count.
    function getValidatorCount() internal view returns (uint128) {
        ISMVerificationLibStorage storage $ = getISMVerificationLibStorage();
        return $.validatorCount;
    }

    /// @notice Checks if an address is a validator.
    ///
    /// @param validator The address to check.
    /// @return True if the address is a validator, false otherwise.
    function isValidator(address validator) internal view returns (bool) {
        ISMVerificationLibStorage storage $ = getISMVerificationLibStorage();
        return $.validators[validator];
    }

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
            let signaturePos := mul(0x41, pos) // 65 bytes per signature
            r := calldataload(add(signaturesCalldataOffset, signaturePos)) // r at offset 0
            s := calldataload(add(signaturesCalldataOffset, add(signaturePos, 0x20))) // s at offset 32
            v := and(calldataload(add(signaturesCalldataOffset, add(signaturePos, 0x21))), 0xff) // v at offset 64
        }
    }
}
