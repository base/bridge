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
/// @notice Provides types and serialization for Solana instructions using Borsh-like
/// little-endian, length-prefixed encoding compatible with the Solana program in this repo.
library SVMLib {
    using LibBit for uint256;

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
