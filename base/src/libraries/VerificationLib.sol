// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IncomingMessage} from "./MessageLib.sol";

/// @notice Storage layout used by this library.
///
/// @custom:storage-location erc7201:coinbase.storage.VerificationLib
///
/// @custom:field validators Mapping of validator addresses to their status.
/// @custom:field threshold Base signature threshold.
/// @custom:field validatorCount Count of Base validators.
struct VerificationLibStorage {
    mapping(address => bool) validators;
    uint128 threshold;
    uint128 validatorCount;
}

/// @title VerificationLib
///
/// @notice A verification library for Messages being broadcasted from Solana to Base by requiring
///         a specific minimum amount of validators to sign the message.
///
/// @dev This library is only relevant for Stage 0 of the bridge where offchain oracle handles the relaying
///      of messages. This library should be irrelevant for Stage 1, where messages will automatically be
///      included by the Base sequencer.
library VerificationLib {
    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice The length of a signature in bytes.
    uint256 internal constant SIGNATURE_LENGTH_THRESHOLD = 65;

    /// @dev Slot for the `VerificationLibStorage` struct in storage.
    ///      Computed from:
    ///         keccak256(abi.encode(uint256(keccak256("coinbase.storage.VerificationLib")) - 1)) &
    /// ~bytes32(uint256(0xff))
    ///
    ///      Follows ERC-7201 (see https://eips.ethereum.org/EIPS/eip-7201).
    bytes32 private constant _VERIFICATION_LIB_STORAGE_LOCATION =
        0x245c109929d1c5575e8db91278c683d6e028507d88b9169278939e24f465af00;

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

    /// @notice Thrown when a validator address is 0.
    error InvalidValidatorAddress();

    /// @notice Thrown when a validator is already added.
    error ValidatorAlreadyAdded();

    /// @notice Thrown when a validator is not a validator.
    error ValidatorNotExisted();

    /// @notice Thrown when validator count is less than threshold.
    error ValidatorCountLessThanThreshold();

    //////////////////////////////////////////////////////////////
    ///                       Internal Functions               ///
    //////////////////////////////////////////////////////////////

    /// @notice Helper function to get a storage reference to the `VerificationLibStorage` struct.
    ///
    /// @return $ A storage reference to the `VerificationLibStorage` struct.
    function getVerificationLibStorage() internal pure returns (VerificationLibStorage storage $) {
        assembly ("memory-safe") {
            $.slot := _VERIFICATION_LIB_STORAGE_LOCATION
        }
    }

    /// @notice Initializes the verification library.
    ///
    /// @param validators Array of validator addresses.
    /// @param threshold The verification threshold.
    function initialize(address[] calldata validators, uint128 threshold) internal {
        VerificationLibStorage storage $ = getVerificationLibStorage();

        require(threshold > 0 && threshold <= validators.length, InvalidThreshold());

        for (uint256 i; i < validators.length; i++) {
            require(validators[i] != address(0), InvalidValidatorAddress());
            require(!$.validators[validators[i]], ValidatorAlreadyAdded());
            $.validators[validators[i]] = true;
        }
        $.validatorCount = uint128(validators.length);
        $.threshold = threshold;
    }

    /// @notice Sets the verification threshold.
    ///
    /// @param newThreshold The new verification threshold.
    function setThreshold(uint256 newThreshold) internal {
        VerificationLibStorage storage $ = getVerificationLibStorage();
        require(newThreshold > 0 && newThreshold <= $.validatorCount, InvalidThreshold());

        $.threshold = uint128(newThreshold);

        emit ThresholdUpdated(newThreshold);
    }

    /// @notice Add a validator to the set
    ///
    /// @param validator Address to add as validator
    function addValidator(address validator) internal {
        VerificationLibStorage storage $ = getVerificationLibStorage();
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
        VerificationLibStorage storage $ = getVerificationLibStorage();
        require($.validators[validator], ValidatorNotExisted());
        require($.validatorCount - 1 >= $.threshold, ValidatorCountLessThanThreshold());

        $.validators[validator] = false;

        unchecked {
            $.validatorCount--;
        }

        emit ValidatorRemoved(validator);
    }

    /// @notice Gets the current threshold.
    ///
    /// @return The current threshold.
    function getBaseThreshold() internal view returns (uint128) {
        VerificationLibStorage storage $ = getVerificationLibStorage();
        return $.threshold;
    }

    /// @notice Checks if an address is a validator.
    ///
    /// @param validator The address to check.
    /// @return True if the address is a validator, false otherwise.
    function isBaseValidator(address validator) internal view returns (bool) {
        VerificationLibStorage storage $ = getVerificationLibStorage();
        return $.validators[validator];
    }

    /// @notice Splits signature bytes into v, r, s components
    ///
    /// @param signaturesCalldataOffset Calldata offset where signature bytes start
    /// @param pos Index of the signature to split (0-indexed)
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
