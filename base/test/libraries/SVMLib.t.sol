// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LibBytes} from "solady/utils/LibBytes.sol";

import {Ix, Pubkey, SVMLib} from "../../src/libraries/SVMLib.sol";

contract SVMLibTest is Test {
    //////////////////////////////////////////////////////////////
    ///                    Test Structures                     ///
    //////////////////////////////////////////////////////////////

    struct U32TestCase {
        uint256 input;
        uint32 expected;
        string description;
    }

    struct U64TestCase {
        uint256 input;
        uint64 expected;
        string description;
    }

    //////////////////////////////////////////////////////////////
    ///                serializeAnchorIx Tests                 ///
    //////////////////////////////////////////////////////////////

    /// forge-config: default.fuzz.runs = 1000
    function testFuzz_serializeAnchorIx(Ix memory ix) public pure {
        // Serialize the instruction
        bytes memory serializedIx = SVMLib.serializeIx(ix);

        uint256 offset = 0;

        // Verify the program ID (first 32 bytes)
        bytes32 serializedProgramId = bytes32(LibBytes.slice(serializedIx, offset, offset + 32));
        assertEq(serializedProgramId, Pubkey.unwrap(ix.programId), "serializeIx programId should match input");
        offset += 32;

        // Verify the accounts count
        uint32 serializedAccountsCount = uint32(bytes4(LibBytes.slice(serializedIx, offset, offset + 4)));
        assertEq(
            serializedAccountsCount,
            SVMLib.toU32LittleEndian(ix.serializedAccounts.length),
            "serializeIx accounts count should match input"
        );
        offset += 4;

        // Verify each serialized account
        for (uint256 i = 0; i < ix.serializedAccounts.length; i++) {
            bytes memory expectedAccount = ix.serializedAccounts[i];
            bytes memory serializedAccount = LibBytes.slice(serializedIx, offset, offset + expectedAccount.length);
            assertEq(serializedAccount, expectedAccount, "serializeIx account should match input");
            offset += expectedAccount.length;
        }

        // Verify instruction data length
        uint32 serializedIxDataLength = uint32(bytes4(LibBytes.slice(serializedIx, offset, offset + 4)));
        assertEq(
            serializedIxDataLength,
            SVMLib.toU32LittleEndian(ix.data.length),
            "serializeIx instruction data length should match expected"
        );
        offset += 4;

        // Verify instruction data
        bytes memory serializedIxData = LibBytes.slice(serializedIx, offset, offset + ix.data.length);
        assertEq(serializedIxData, ix.data, "serializeIx instruction data should match expected");
        offset += ix.data.length;

        // Verify we've consumed the entire serialized data
        assertEq(offset, serializedIx.length, "serializeIx should consume entire serialized data");
    }

    //////////////////////////////////////////////////////////////
    ///               serializeAnchorIxs Tests                 ///
    //////////////////////////////////////////////////////////////

    /// forge-config: default.fuzz.runs = 1000
    function testFuzz_serializeAnchorIxs(Ix[5] memory ixs) public pure {
        // Serialize the instructions array
        Ix[] memory ixs_ = new Ix[](ixs.length);
        for (uint256 i = 0; i < ixs.length; i++) {
            ixs_[i] = ixs[i];
        }
        bytes memory serializedIxs = SVMLib.serializeIxs(ixs_);

        uint256 offset = 0;

        // Verify the instructions count
        uint32 serializedIxsCount = uint32(bytes4(LibBytes.slice(serializedIxs, offset, offset + 4)));
        assertEq(
            serializedIxsCount,
            SVMLib.toU32LittleEndian(ixs.length),
            "serializeIxs instructions count should match input"
        );
        offset += 4;

        // Verify each instruction
        for (uint256 i = 0; i < ixs.length; i++) {
            // Get the expected serialized instruction
            bytes memory expectedIx = SVMLib.serializeIx(ixs[i]);

            // Extract the actual serialized instruction from the array
            bytes memory actualIx = LibBytes.slice(serializedIxs, offset, offset + expectedIx.length);

            assertEq(actualIx, expectedIx, "serializeAnchorIxs instruction should match serializeAnchorIx output");

            offset += expectedIx.length;
        }

        // Verify we've consumed the entire serialized data
        assertEq(offset, serializedIxs.length, "serializeAnchorIxs should consume entire serialized data");
    }

    //////////////////////////////////////////////////////////////
    ///                  toU32LittleEndian Tests               ///
    //////////////////////////////////////////////////////////////

    function test_toU32LittleEndian() public pure {
        U32TestCase[] memory testCases = new U32TestCase[](9);
        testCases[0] = U32TestCase({input: 0, expected: 0x00000000, description: "0x00000000"});
        testCases[1] = U32TestCase({input: 0x00000010, expected: 0x10000000, description: "0x00000010"});
        testCases[2] = U32TestCase({input: 0x00000014, expected: 0x14000000, description: "0x00000014"});
        testCases[3] = U32TestCase({input: 0x00000100, expected: 0x00010000, description: "0x00000100"});
        testCases[4] = U32TestCase({input: 0x00010000, expected: 0x00000100, description: "0x00010000"});
        testCases[5] = U32TestCase({input: 0x00010000, expected: 0x00000100, description: "16777216 (0x01000000)"});
        testCases[6] = U32TestCase({input: type(uint32).max, expected: 0xFFFFFFFF, description: "0xFFFFFFFF"});
        testCases[7] = U32TestCase({input: 0x12345678, expected: 0x78563412, description: "0x12345678"});
        testCases[8] = U32TestCase({
            input: type(uint256).max,
            expected: 0xFFFFFFFF,
            description: "max uint256 (should truncate to lower 32 bits)"
        });

        for (uint256 i = 0; i < testCases.length; i++) {
            uint32 result = SVMLib.toU32LittleEndian(testCases[i].input);
            assertEq(
                result,
                testCases[i].expected,
                string(abi.encodePacked("toU32LittleEndian one way failed for ", testCases[i].description))
            );
        }

        // Test that encoding and decoding are consistent.
        // NOTE: Skip the truncated test case.
        for (uint256 i = 0; i < testCases.length - 1; i++) {
            uint32 result = SVMLib.toU32LittleEndian(SVMLib.toU32LittleEndian(testCases[i].input));
            assertEq(
                uint256(result),
                testCases[i].input,
                string(abi.encodePacked("toU32LittleEndian two way failed for ", testCases[i].description))
            );
        }
    }

    //////////////////////////////////////////////////////////////
    ///                  toU64LittleEndian Tests               ///
    //////////////////////////////////////////////////////////////

    function test_toU64LittleEndian() public pure {
        U64TestCase[] memory testCases = new U64TestCase[](8);
        testCases[0] =
            U64TestCase({input: 0x0000000000000000, expected: 0x0000000000000000, description: "0x0000000000000000"});
        testCases[1] =
            U64TestCase({input: 0x0000000000000010, expected: 0x1000000000000000, description: "0x0000000000000010"});
        testCases[2] =
            U64TestCase({input: 0x0000000000000014, expected: 0x1400000000000000, description: "0x0000000000000014"});
        testCases[3] =
            U64TestCase({input: 0x0000000000000100, expected: 0x0001000000000000, description: "0x0000000000000100"});
        testCases[4] =
            U64TestCase({input: 0x00000009c7652400, expected: 0x002465c709000000, description: "0x00000009c7652400"});
        testCases[5] =
            U64TestCase({input: type(uint64).max, expected: 0xFFFFFFFFFFFFFFFF, description: "0xFFFFFFFFFFFFFFFF"});
        testCases[6] =
            U64TestCase({input: 0x123456789ABCDEF0, expected: 0xF0DEBC9A78563412, description: "0x123456789ABCDEF0"});
        testCases[7] = U64TestCase({
            input: type(uint256).max,
            expected: 0xFFFFFFFFFFFFFFFF,
            description: "max uint256 (should truncate to lower 64 bits)"
        });

        // Test encoding is correct.
        for (uint256 i = 0; i < testCases.length; i++) {
            uint64 result = SVMLib.toU64LittleEndian(testCases[i].input);
            assertEq(
                result,
                testCases[i].expected,
                string(abi.encodePacked("toU64LittleEndian one way failed for ", testCases[i].description))
            );
        }

        // Test that encoding and decoding are consistent.
        // NOTE: Skip the truncated test case.
        for (uint256 i = 0; i < testCases.length - 1; i++) {
            uint64 result = SVMLib.toU64LittleEndian(SVMLib.toU64LittleEndian(testCases[i].input));
            assertEq(
                uint256(result),
                testCases[i].input,
                string(abi.encodePacked("toU64LittleEndian two way failed for ", testCases[i].description))
            );
        }
    }
}
