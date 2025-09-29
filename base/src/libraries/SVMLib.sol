// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LibBit} from "solady/utils/LibBit.sol";

/// @notice Represents a Solana public key (32 bytes)
type Pubkey is bytes32;

function eq(Pubkey a, Pubkey b) pure returns (bool) {
    return Pubkey.unwrap(a) == Pubkey.unwrap(b);
}

using {eq as ==} for Pubkey global;

function neq(Pubkey a, Pubkey b) pure returns (bool) {
    return Pubkey.unwrap(a) != Pubkey.unwrap(b);
}

using {neq as !=} for Pubkey global;

/// @notice Solana instruction structure
///
/// @param programId The program to execute
/// @param serializedAccounts Array of serialized accounts required by the instruction
/// @param data Instruction data payload
struct Ix {
    Pubkey programId;
    bytes[] serializedAccounts;
    bytes data;
}

/// @title SVMLib - Solana Virtual Machine library for Solidity
///
/// @notice Provides types and serialization helpers for Solana instructions and Base→Solana message payloads.
///         Uses Borsh-like little-endian, length-prefixed encoding compatible with the Solana programs in this repo.
///
/// @dev Encoding conventions:
///      - Arrays are prefixed with a u32 (little-endian) length.
///      - Instruction (Ix) layout: programId (32) || accounts_len (u32 LE) || accounts[..] || data_len (u32 LE) ||
/// data.
///      - Instruction list layout: ixs_len (u32 LE) || concat(serializeIx(ix)).
library SVMLib {
    using LibBit for uint256;

    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice Maximum number of instructions allowed in a single Base→Solana message.
    uint8 internal constant MAX_INSTRUCTIONS = 64;

    /// @notice Maximum number of unique signer pubkeys allowed across all instructions.
    uint8 internal constant MAX_SIGNATURES = 12;

    /// @notice Maximum number of unique account pubkeys allowed across all instructions.
    uint8 internal constant MAX_ACCOUNTS = 58;

    /// @notice Fixed length for a serialized Solana account meta entry.
    /// @dev Layout: 32-byte pubkey || 1-byte is_writable || 1-byte is_signer.
    uint8 internal constant SERIALIZED_ACCOUNT_LENGTH = 34;

    /// @notice Maximum serialized message payload length forwarded to Solana. This is a conservative amount to leave
    ///         room for MMR proofs while also ensuring the Solana execution environment can handle loading the full
    ///         account.
    uint16 internal constant MAX_SOLANA_DATA_LENGTH = 6_000;

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when `ixs.length` exceeds `MAX_INSTRUCTIONS`.
    error TooManyInstructions();

    /// @notice Thrown when the number of unique account pubkeys exceeds `MAX_ACCOUNTS`.
    error TooManyAccounts();

    /// @notice Thrown when the number of unique signer pubkeys exceeds `MAX_SIGNATURES`.
    error TooManySignatures();

    /// @notice Thrown when a serialized account entry is not exactly `SERIALIZED_ACCOUNT_LENGTH` bytes.
    error InvalidSerializedAccountLength();

    //////////////////////////////////////////////////////////////
    ///                   Internal Functions                   ///
    //////////////////////////////////////////////////////////////

    /// @notice Validates a set of Solana instructions against size and structural constraints.
    ///
    /// @dev Enforces:
    ///      - `ixs.length <= MAX_INSTRUCTIONS`
    ///      - Per-instruction `serializedAccounts.length <= MAX_ACCOUNTS`
    ///      - Each account entry length equals `SERIALIZED_ACCOUNT_LENGTH`
    ///      - Total unique accounts ≤ `MAX_ACCOUNTS`
    ///      - Total unique signers ≤ `MAX_SIGNATURES` (signer bit taken from last byte LSB)
    ///      Reverts with `TooManyInstructions`, `TooManyAccounts`, `TooManySignatures`, or
    ///      `InvalidSerializedAccountLength` as appropriate.
    ///
    /// @param ixs The list of instructions to validate.
    function validateIxs(Ix[] calldata ixs) internal pure {
        uint256 ixCount = ixs.length;
        require(ixCount <= MAX_INSTRUCTIONS, TooManyInstructions());

        // Deduplicate accounts and signers across the entire message
        bytes32[] memory uniqueAccounts = new bytes32[](MAX_ACCOUNTS);
        uint256 uniqueAccountsCount;
        bytes32[] memory uniqueSigners = new bytes32[](MAX_SIGNATURES);
        uint256 uniqueSignersCount;

        for (uint256 i; i < ixCount; i++) {
            // Prevent's unnecessary compute due to many duplicate accounts
            require(ixs[i].serializedAccounts.length <= MAX_ACCOUNTS, TooManyAccounts());

            for (uint256 j; j < ixs[i].serializedAccounts.length; j++) {
                bytes calldata acct = ixs[i].serializedAccounts[j];
                require(acct.length == SERIALIZED_ACCOUNT_LENGTH, InvalidSerializedAccountLength());

                // pubkey is first 32 bytes of serialized account
                bytes32 pubkey;
                assembly {
                    pubkey := calldataload(acct.offset)
                }

                // Deduplicate unique accounts
                bool seenAccount;
                for (uint256 k; k < uniqueAccountsCount; k++) {
                    if (uniqueAccounts[k] == pubkey) {
                        seenAccount = true;
                        break;
                    }
                }
                if (!seenAccount) {
                    require(uniqueAccountsCount < MAX_ACCOUNTS, TooManyAccounts());
                    uniqueAccounts[uniqueAccountsCount] = pubkey;
                    unchecked {
                        uniqueAccountsCount++;
                    }
                }

                // Last byte stores is_signer bit in LSB
                bool isSigner = uint8(acct[SERIALIZED_ACCOUNT_LENGTH - 1]) == 1;
                if (!isSigner) {
                    continue;
                }

                bool seenSigner;
                for (uint256 k; k < uniqueSignersCount; k++) {
                    if (uniqueSigners[k] == pubkey) {
                        seenSigner = true;
                        break;
                    }
                }
                if (!seenSigner) {
                    require(uniqueSignersCount < MAX_SIGNATURES, TooManySignatures());
                    uniqueSigners[uniqueSignersCount] = pubkey;
                    unchecked {
                        uniqueSignersCount++;
                    }
                }
            }
        }
    }

    /// @notice Serializes a Solana instruction to Borsh-compatible bytes.
    ///
    /// @param ix The instruction to serialize
    ///
    /// @return Serialized instruction bytes ready for Solana deserialization
    function serializeIx(Ix memory ix) internal pure returns (bytes memory) {
        bytes memory result = abi.encodePacked(ix.programId);

        // Serialize accounts array
        result = abi.encodePacked(result, toU32LittleEndian(ix.serializedAccounts.length));
        for (uint256 i = 0; i < ix.serializedAccounts.length; i++) {
            result = abi.encodePacked(result, ix.serializedAccounts[i]);
        }

        // Serialize instruction data
        result = abi.encodePacked(result, _serializeBytes(ix.data));

        return result;
    }

    /// @notice Serializes a list of Solana instructions to Borsh-compatible bytes.
    ///
    /// @param ixs The list of instructions to serialize
    ///
    /// @return Serialized instruction bytes ready for Solana deserialization
    function serializeIxs(Ix[] memory ixs) internal pure returns (bytes memory) {
        bytes memory result = abi.encodePacked(toU32LittleEndian(ixs.length));
        for (uint256 i; i < ixs.length; i++) {
            result = abi.encodePacked(result, serializeIx(ixs[i]));
        }

        return result;
    }

    /// @notice Converts a value to a uint32 in little-endian format.
    ///
    /// @param value The input value to convert
    ///
    /// @return A uint32 whose ABI-packed big-endian bytes equal the little-endian representation of `value`
    function toU32LittleEndian(uint256 value) internal pure returns (uint32) {
        return uint32(value.reverseBytes() >> 224);
    }

    /// @notice Converts a value to a uint64 in little-endian format.
    ///
    /// @param value The input value to convert
    ///
    /// @return A uint64 whose ABI-packed big-endian bytes equal the little-endian representation of `value`
    function toU64LittleEndian(uint256 value) internal pure returns (uint64) {
        return uint64(value.reverseBytes() >> 192);
    }

    //////////////////////////////////////////////////////////////
    ///                       Private Functions                ///
    //////////////////////////////////////////////////////////////

    /// @dev Serializes bytes with a u32 little-endian length prefix
    function _serializeBytes(bytes memory data) private pure returns (bytes memory) {
        return abi.encodePacked(toU32LittleEndian(data.length), data);
    }
}
