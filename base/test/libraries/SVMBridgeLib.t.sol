// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {SVMBridgeLib} from "../../src/libraries/SVMBridgeLib.sol";
import {Ix, Pubkey, SVMLib} from "../../src/libraries/SVMLib.sol";
import {SolanaTokenType, Transfer} from "../../src/libraries/TokenLib.sol";

contract SVMBridgeLibTest is Test {
    // Test constants
    Pubkey constant TEST_REMOTE_TOKEN = Pubkey.wrap(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef);
    Pubkey constant TEST_NATIVE_SOL = Pubkey.wrap(0x069be72ab836d4eacc02525b7350a78a395da2f1253a40ebafd6630000000000);
    address constant TEST_LOCAL_TOKEN = 0x742d35cc6634c0532925A3b8D7389D156c9D2615;
    bytes32 constant TEST_TO = bytes32(uint256(uint160(0x742d35cc6634c0532925A3b8D7389D156c9D2615)));

    //////////////////////////////////////////////////////////////
    ///                 SerializeCall Tests                    ///
    //////////////////////////////////////////////////////////////

    function test_serializeCall_emptyInstructions() public pure {
        Ix[] memory ixs = new Ix[](0);

        bytes memory result = SVMBridgeLib.serializeCall(ixs);

        // Expected: variant discriminator (0) + empty instructions array
        bytes memory expected = abi.encodePacked(
            uint8(0), // Call variant
            uint32(0) // Empty array length
        );

        assertEq(result, expected, "Empty instructions serialization failed");
    }

    function test_serializeCall_singleInstruction() public pure {
        Ix[] memory ixs = new Ix[](1);
        bytes[] memory accounts = new bytes[](1);
        accounts[0] = hex"deadbeef";
        ixs[0] = Ix({programId: TEST_REMOTE_TOKEN, serializedAccounts: accounts, data: hex"cafebabe"});

        bytes memory result = SVMBridgeLib.serializeCall(ixs);

        // Expected: variant discriminator (0) + serialized instructions
        bytes memory expected = abi.encodePacked(
            uint8(0), // Call variant
            SVMLib.serializeIxs(ixs)
        );

        assertEq(result, expected, "Single instruction serialization failed");
    }

    function test_serializeCall_multipleInstructions() public pure {
        Ix[] memory ixs = new Ix[](2);
        bytes[] memory accounts0 = new bytes[](1);
        accounts0[0] = hex"dead";
        ixs[0] = Ix({programId: TEST_REMOTE_TOKEN, serializedAccounts: accounts0, data: hex"beef"});
        bytes[] memory accounts1 = new bytes[](1);
        accounts1[0] = hex"cafe";
        ixs[1] = Ix({programId: TEST_NATIVE_SOL, serializedAccounts: accounts1, data: hex"babe"});

        bytes memory result = SVMBridgeLib.serializeCall(ixs);

        bytes memory expected = abi.encodePacked(
            uint8(0), // Call variant
            SVMLib.serializeIxs(ixs)
        );

        assertEq(result, expected, "Multiple instructions serialization failed");
    }

    //////////////////////////////////////////////////////////////
    ///            SerializeTransfer Sol Tests                 ///
    //////////////////////////////////////////////////////////////

    function test_serializeTransfer_sol_noInstructions() public pure {
        Transfer memory transfer = Transfer({
            localToken: TEST_LOCAL_TOKEN,
            remoteToken: TEST_REMOTE_TOKEN,
            to: TEST_TO,
            remoteAmount: 1000000000 // 1 SOL in lamports
        });

        Ix[] memory ixs = new Ix[](0);

        bytes memory result = SVMBridgeLib.serializeTransfer(transfer, SolanaTokenType.Sol, ixs);

        bytes memory expected = abi.encodePacked(
            uint8(1), // Transfer variant
            uint8(0), // Sol token type
            transfer.to, // to (32 bytes)
            SVMLib.toU64LittleEndian(transfer.remoteAmount), // amount (8 bytes)
            SVMLib.serializeIxs(ixs) // instructions
        );

        assertEq(result, expected, "Sol transfer serialization failed");
    }

    function test_serializeTransfer_sol_withInstructions() public pure {
        Transfer memory transfer = Transfer({
            localToken: TEST_LOCAL_TOKEN,
            remoteToken: TEST_REMOTE_TOKEN,
            to: TEST_TO,
            remoteAmount: 500000000 // 0.5 SOL
        });

        Ix[] memory ixs = new Ix[](1);
        bytes[] memory accounts = new bytes[](1);
        accounts[0] = hex"1234";
        ixs[0] = Ix({programId: TEST_REMOTE_TOKEN, serializedAccounts: accounts, data: hex"5678"});

        bytes memory result = SVMBridgeLib.serializeTransfer(transfer, SolanaTokenType.Sol, ixs);

        bytes memory expected = abi.encodePacked(
            uint8(1), // Transfer variant
            uint8(0), // Sol token type
            transfer.to,
            SVMLib.toU64LittleEndian(transfer.remoteAmount),
            SVMLib.serializeIxs(ixs)
        );

        assertEq(result, expected, "Sol transfer with instructions failed");
    }

    //////////////////////////////////////////////////////////////
    ///            SerializeTransfer Spl Tests                 ///
    //////////////////////////////////////////////////////////////

    function test_serializeTransfer_spl_noInstructions() public pure {
        Transfer memory transfer = Transfer({
            localToken: TEST_LOCAL_TOKEN,
            remoteToken: TEST_REMOTE_TOKEN,
            to: TEST_TO,
            remoteAmount: 1000000 // 1 token with 6 decimals
        });

        Ix[] memory ixs = new Ix[](0);

        bytes memory result = SVMBridgeLib.serializeTransfer(transfer, SolanaTokenType.Spl, ixs);

        bytes memory expected = abi.encodePacked(
            uint8(1), // Transfer variant
            uint8(1), // Spl token type
            transfer.localToken, // remote_token (20 bytes)
            transfer.remoteToken, // local_token (32 bytes)
            transfer.to, // to (32 bytes)
            SVMLib.toU64LittleEndian(transfer.remoteAmount), // amount (8 bytes)
            SVMLib.serializeIxs(ixs) // instructions
        );

        assertEq(result, expected, "SPL transfer serialization failed");
    }

    function test_serializeTransfer_spl_withInstructions() public pure {
        Transfer memory transfer =
            Transfer({localToken: TEST_LOCAL_TOKEN, remoteToken: TEST_REMOTE_TOKEN, to: TEST_TO, remoteAmount: 999999});

        Ix[] memory ixs = new Ix[](2);
        bytes[] memory accounts0 = new bytes[](1);
        accounts0[0] = hex"abcd";
        ixs[0] = Ix({programId: TEST_REMOTE_TOKEN, serializedAccounts: accounts0, data: hex"ef01"});
        bytes[] memory accounts1 = new bytes[](1);
        accounts1[0] = hex"1111";
        ixs[1] = Ix({programId: TEST_NATIVE_SOL, serializedAccounts: accounts1, data: hex"2222"});

        bytes memory result = SVMBridgeLib.serializeTransfer(transfer, SolanaTokenType.Spl, ixs);

        bytes memory expected = abi.encodePacked(
            uint8(1), // Transfer variant
            uint8(1), // Spl token type
            transfer.localToken,
            transfer.remoteToken,
            transfer.to,
            SVMLib.toU64LittleEndian(transfer.remoteAmount),
            SVMLib.serializeIxs(ixs)
        );

        assertEq(result, expected, "SPL transfer with instructions failed");
    }

    //////////////////////////////////////////////////////////////
    ///         SerializeTransfer WrappedToken Tests           ///
    //////////////////////////////////////////////////////////////

    function test_serializeTransfer_wrappedToken_noInstructions() public pure {
        Transfer memory transfer = Transfer({
            localToken: TEST_LOCAL_TOKEN,
            remoteToken: TEST_REMOTE_TOKEN,
            to: TEST_TO,
            remoteAmount: 1000000000000000000 // 1 ETH in wei
        });

        Ix[] memory ixs = new Ix[](0);

        bytes memory result = SVMBridgeLib.serializeTransfer(transfer, SolanaTokenType.WrappedToken, ixs);

        bytes memory expected = abi.encodePacked(
            uint8(1), // Transfer variant
            uint8(2), // WrappedToken token type
            transfer.remoteToken, // local_token (32 bytes)
            transfer.to, // to (32 bytes)
            SVMLib.toU64LittleEndian(transfer.remoteAmount), // amount (8 bytes)
            SVMLib.serializeIxs(ixs) // instructions
        );

        assertEq(result, expected, "Wrapped token transfer serialization failed");
    }

    function test_serializeTransfer_wrappedToken_withInstructions() public pure {
        Transfer memory transfer = Transfer({
            localToken: TEST_LOCAL_TOKEN, remoteToken: TEST_REMOTE_TOKEN, to: TEST_TO, remoteAmount: 123456789
        });

        Ix[] memory ixs = new Ix[](3);
        bytes[] memory accounts0 = new bytes[](1);
        accounts0[0] = hex"aa";
        ixs[0] = Ix({programId: TEST_REMOTE_TOKEN, serializedAccounts: accounts0, data: hex"bb"});
        bytes[] memory accounts1 = new bytes[](1);
        accounts1[0] = hex"cc";
        ixs[1] = Ix({programId: TEST_NATIVE_SOL, serializedAccounts: accounts1, data: hex"dd"});
        bytes[] memory accounts2 = new bytes[](1);
        accounts2[0] = hex"ee";
        ixs[2] = Ix({
            programId: Pubkey.wrap(0x3333333333333333333333333333333333333333333333333333333333333333),
            serializedAccounts: accounts2,
            data: hex"ff"
        });

        bytes memory result = SVMBridgeLib.serializeTransfer(transfer, SolanaTokenType.WrappedToken, ixs);

        bytes memory expected = abi.encodePacked(
            uint8(1), // Transfer variant
            uint8(2), // WrappedToken token type
            transfer.remoteToken,
            transfer.to,
            SVMLib.toU64LittleEndian(transfer.remoteAmount),
            SVMLib.serializeIxs(ixs)
        );

        assertEq(result, expected, "Wrapped token transfer with instructions failed");
    }

    //////////////////////////////////////////////////////////////
    ///                    Edge Cases                          ///
    //////////////////////////////////////////////////////////////

    function test_serializeTransfer_maxAmount() public pure {
        Transfer memory transfer = Transfer({
            localToken: TEST_LOCAL_TOKEN, remoteToken: TEST_REMOTE_TOKEN, to: TEST_TO, remoteAmount: type(uint64).max
        });

        Ix[] memory ixs = new Ix[](0);

        bytes memory result = SVMBridgeLib.serializeTransfer(transfer, SolanaTokenType.Sol, ixs);

        bytes memory expected = abi.encodePacked(
            uint8(1), // Transfer variant
            uint8(0), // Sol token type
            transfer.to,
            SVMLib.toU64LittleEndian(type(uint64).max),
            SVMLib.serializeIxs(ixs)
        );

        assertEq(result, expected, "Max amount serialization failed");
    }

    function test_serializeTransfer_zeroAmount() public pure {
        Transfer memory transfer =
            Transfer({localToken: TEST_LOCAL_TOKEN, remoteToken: TEST_REMOTE_TOKEN, to: TEST_TO, remoteAmount: 0});

        Ix[] memory ixs = new Ix[](0);

        bytes memory result = SVMBridgeLib.serializeTransfer(transfer, SolanaTokenType.Spl, ixs);

        bytes memory expected = abi.encodePacked(
            uint8(1), // Transfer variant
            uint8(1), // Spl token type
            transfer.localToken,
            transfer.remoteToken,
            transfer.to,
            SVMLib.toU64LittleEndian(0),
            SVMLib.serializeIxs(ixs)
        );

        assertEq(result, expected, "Zero amount serialization failed");
    }

    function test_serializeTransfer_differentTokenAddresses() public pure {
        address[] memory tokenAddresses = new address[](3);
        tokenAddresses[0] = address(0);
        tokenAddresses[1] = address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE); // ETH_ADDRESS
        tokenAddresses[2] = address(0xA0B86A33E6441081B86e8cA99B83cf64e95e5015); // Random address

        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            Transfer memory transfer = Transfer({
                localToken: tokenAddresses[i], remoteToken: TEST_REMOTE_TOKEN, to: TEST_TO, remoteAmount: 1000
            });

            Ix[] memory ixs = new Ix[](0);

            bytes memory result = SVMBridgeLib.serializeTransfer(transfer, SolanaTokenType.WrappedToken, ixs);

            bytes memory expected = abi.encodePacked(
                uint8(1), // Transfer variant
                uint8(2), // WrappedToken token type
                transfer.remoteToken,
                transfer.to,
                SVMLib.toU64LittleEndian(1000),
                SVMLib.serializeIxs(ixs)
            );

            assertEq(
                result, expected, string(abi.encodePacked("Token address ", vm.toString(tokenAddresses[i]), " failed"))
            );
        }
    }

    //////////////////////////////////////////////////////////////
    ///                  Instruction Edge Cases               ///
    //////////////////////////////////////////////////////////////

    function test_serialize_emptyInstructionData() public pure {
        Ix[] memory ixs = new Ix[](1);
        bytes[] memory emptyAccounts = new bytes[](0);
        ixs[0] = Ix({programId: TEST_REMOTE_TOKEN, serializedAccounts: emptyAccounts, data: hex""});

        bytes memory callResult = SVMBridgeLib.serializeCall(ixs);
        bytes memory expectedCall = abi.encodePacked(uint8(0), SVMLib.serializeIxs(ixs));
        assertEq(callResult, expectedCall, "Empty instruction data in call failed");

        Transfer memory transfer =
            Transfer({localToken: TEST_LOCAL_TOKEN, remoteToken: TEST_REMOTE_TOKEN, to: TEST_TO, remoteAmount: 1000});

        bytes memory transferResult = SVMBridgeLib.serializeTransfer(transfer, SolanaTokenType.Sol, ixs);
        bytes memory expectedTransfer =
            abi.encodePacked(uint8(1), uint8(0), transfer.to, SVMLib.toU64LittleEndian(1000), SVMLib.serializeIxs(ixs));
        assertEq(transferResult, expectedTransfer, "Empty instruction data in transfer failed");
    }

    function test_serialize_largeInstructionData() public pure {
        bytes memory largeData = new bytes(1024);
        for (uint256 i = 0; i < 1024; i++) {
            largeData[i] = bytes1(uint8(i % 256));
        }

        Ix[] memory ixs = new Ix[](1);
        bytes[] memory largeAccounts = new bytes[](1);
        largeAccounts[0] = largeData;
        ixs[0] = Ix({programId: TEST_REMOTE_TOKEN, serializedAccounts: largeAccounts, data: largeData});

        bytes memory result = SVMBridgeLib.serializeCall(ixs);
        bytes memory expected = abi.encodePacked(uint8(0), SVMLib.serializeIxs(ixs));

        assertEq(result, expected, "Large instruction data failed");
    }
}
