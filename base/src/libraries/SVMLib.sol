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

/// @notice Program-derived address (PDA) specification.
///
/// @param seeds Array of seed bytes for PDA generation
/// @param programId The program that owns this PDA
struct Pda {
    bytes[] seeds;
    Pubkey programId;
}

/// @notice Enum for pubkey or PDA variants
enum PubkeyOrPdaVariant {
    Pubkey,
    PDA
}

/// @notice Union type for either a direct pubkey or PDA
///
/// @param variant The type of key (Pubkey or PDA)
/// @param variantData Serialized data for the variant
/// - If `variant == Pubkey`, this is the 32-byte pubkey.
/// - If `variant == PDA`, this is: [u32 LE seed_count] + [len-prefixed seed bytes...] + [32-byte programId].
struct PubkeyOrPda {
    PubkeyOrPdaVariant variant;
    bytes variantData;
}

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

    //////////////////////////////////////////////////////////////
    ///                       Internal Functions               ///
    //////////////////////////////////////////////////////////////

    /// @notice Serializes an account with a direct pubkey.
    ///
    /// @param pubkey The public key of the account
    /// @param isWritable Whether the account should be writable
    /// @param isSigner Whether the account should be a signer
    ///
    /// @return The serialized account
    function serializePubkeyAccount(Pubkey pubkey, bool isWritable, bool isSigner)
        internal
        pure
        returns (bytes memory)
    {
        uint8 variant = uint8(PubkeyOrPdaVariant.Pubkey);
        bytes memory variantData = abi.encodePacked(pubkey);
        bytes memory result =
            abi.encodePacked(variant, variantData, isWritable ? uint8(1) : uint8(0), isSigner ? uint8(1) : uint8(0));

        return result;
    }

    /// @notice Serializes an account with a Program Derived Address (PDA).
    ///
    /// @param pda The PDA specification
    /// @param isWritable Whether the account should be writable
    /// @param isSigner Whether the account should be a signer
    ///
    /// @return The serialized account
    ///
    /// Format: [variant=1] + [u32 LE seed_count] + [len-prefixed seed bytes...] + [32-byte programId]
    ///         + [isWritable u8] + [isSigner u8]
    function serializePdaAccount(Pda memory pda, bool isWritable, bool isSigner) internal pure returns (bytes memory) {
        uint8 variant = uint8(PubkeyOrPdaVariant.PDA);

        bytes memory variantData = abi.encodePacked(toU32LittleEndian(pda.seeds.length));
        for (uint256 i; i < pda.seeds.length; i++) {
            variantData = abi.encodePacked(variantData, _serializeBytes(pda.seeds[i]));
        }
        variantData = abi.encodePacked(variantData, pda.programId);

        bytes memory result =
            abi.encodePacked(variant, variantData, isWritable ? uint8(1) : uint8(0), isSigner ? uint8(1) : uint8(0));

        return result;
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
