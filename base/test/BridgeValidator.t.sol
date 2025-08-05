// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {DeployScript} from "../script/Deploy.s.sol";
import {HelperConfig} from "../script/HelperConfig.s.sol";

import {BridgeValidator} from "../src/BridgeValidator.sol";

contract BridgeValidatorTest is Test {
    //////////////////////////////////////////////////////////////
    ///                       Test Setup                       ///
    //////////////////////////////////////////////////////////////

    BridgeValidator public bridgeValidator;
    HelperConfig.NetworkConfig public cfg;

    // Test data
    bytes32 public constant TEST_MESSAGE_HASH_1 = keccak256("test_message_1");
    bytes32 public constant TEST_MESSAGE_HASH_2 = keccak256("test_message_2");
    bytes32 public constant TEST_MESSAGE_HASH_3 = keccak256("test_message_3");

    // Events to test
    event MessagesRegistered(bytes32[] messageHashes);
    event ExecutingMessage(bytes32 indexed msgHash);

    function setUp() public {
        DeployScript deployer = new DeployScript();
        HelperConfig helperConfig;
        (, bridgeValidator,,, helperConfig) = deployer.run();
        cfg = helperConfig.getConfig();
    }

    //////////////////////////////////////////////////////////////
    ///                   Constructor Tests                    ///
    //////////////////////////////////////////////////////////////

    function test_constructor_setsTrustedRelayerCorrectly() public view {
        assertEq(bridgeValidator.TRUSTED_RELAYER(), cfg.trustedRelayer);
    }

    //////////////////////////////////////////////////////////////
    ///                 registerMessages Tests                 ///
    //////////////////////////////////////////////////////////////

    function test_registerMessages_success() public {
        bytes32[] memory messageHashes = new bytes32[](2);
        messageHashes[0] = TEST_MESSAGE_HASH_1;
        messageHashes[1] = TEST_MESSAGE_HASH_2;

        vm.expectEmit(false, false, false, true);
        emit MessagesRegistered(messageHashes);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs());

        // Verify messages are now valid
        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));
        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_2));
    }

    function test_registerMessages_singleMessage() public {
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = TEST_MESSAGE_HASH_1;

        vm.expectEmit(false, false, false, true);
        emit MessagesRegistered(messageHashes);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs());

        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));
    }

    function test_registerMessages_emptyArray() public {
        bytes32[] memory messageHashes = new bytes32[](0);

        vm.expectEmit(false, false, false, true);
        emit MessagesRegistered(messageHashes);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs());
    }

    function test_registerMessages_largeArray() public {
        bytes32[] memory messageHashes = new bytes32[](100);
        for (uint256 i; i < 100; i++) {
            messageHashes[i] = keccak256(abi.encodePacked("message", i));
        }

        vm.expectEmit(false, false, false, true);
        emit MessagesRegistered(messageHashes);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs());

        // Verify all messages are registered
        for (uint256 i; i < 100; i++) {
            assertTrue(bridgeValidator.validMessages(messageHashes[i]));
        }
    }

    function test_registerMessages_revertsOnInvalidCaller() public {
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = TEST_MESSAGE_HASH_1;

        vm.expectRevert(BridgeValidator.InvalidCaller.selector);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs());

        // Verify message is not registered
        assertFalse(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));
    }

    function test_registerMessages_duplicateMessageHashes() public {
        bytes32[] memory messageHashes = new bytes32[](3);
        messageHashes[0] = TEST_MESSAGE_HASH_1;
        messageHashes[1] = TEST_MESSAGE_HASH_1; // Duplicate
        messageHashes[2] = TEST_MESSAGE_HASH_2;

        bytes memory validatorSigs = _getValidatorSigs();

        vm.expectEmit(false, false, false, true);
        emit MessagesRegistered(messageHashes);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, validatorSigs);

        // Both unique messages should be valid
        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));
        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_2));
    }

    function test_registerMessages_overwriteExistingMessage() public {
        // First registration
        bytes32[] memory messageHashes1 = new bytes32[](1);
        messageHashes1[0] = TEST_MESSAGE_HASH_1;

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes1, _getValidatorSigs());

        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));

        // Second registration with same hash
        bytes32[] memory messageHashes2 = new bytes32[](1);
        messageHashes2[0] = TEST_MESSAGE_HASH_1;

        vm.expectEmit(false, false, false, true);
        emit MessagesRegistered(messageHashes2);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes2, _getValidatorSigs());

        // Should still be valid
        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));
    }

    //////////////////////////////////////////////////////////////
    ///                 validateMessage Tests                  ///
    //////////////////////////////////////////////////////////////

    function test_validateMessage_success() public {
        // First register the message
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = TEST_MESSAGE_HASH_1;

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs());

        // Now validate it
        vm.expectEmit(true, false, false, false);
        emit ExecutingMessage(TEST_MESSAGE_HASH_1);

        bridgeValidator.validateMessage(TEST_MESSAGE_HASH_1);
    }

    function test_validateMessage_multipleValidations() public {
        // Register message
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = TEST_MESSAGE_HASH_1;

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs());

        // Validate multiple times - should all succeed
        vm.expectEmit(true, false, false, false);
        emit ExecutingMessage(TEST_MESSAGE_HASH_1);
        bridgeValidator.validateMessage(TEST_MESSAGE_HASH_1);

        vm.expectEmit(true, false, false, false);
        emit ExecutingMessage(TEST_MESSAGE_HASH_1);
        bridgeValidator.validateMessage(TEST_MESSAGE_HASH_1);
    }

    function test_validateMessage_revertsOnInvalidMessage() public {
        // Try to validate a message that was never registered
        vm.expectRevert(BridgeValidator.InvalidMessage.selector);
        bridgeValidator.validateMessage(TEST_MESSAGE_HASH_1);
    }

    function test_validateMessage_revertsAfterRegistrationOfDifferentMessage() public {
        // Register one message
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = TEST_MESSAGE_HASH_1;

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs());

        // Try to validate a different message
        vm.expectRevert(BridgeValidator.InvalidMessage.selector);
        bridgeValidator.validateMessage(TEST_MESSAGE_HASH_2);
    }

    //////////////////////////////////////////////////////////////
    ///                     View Function Tests                ///
    //////////////////////////////////////////////////////////////

    function test_validMessages_defaultIsFalse() public view {
        assertFalse(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));
        assertFalse(bridgeValidator.validMessages(TEST_MESSAGE_HASH_2));
        assertFalse(bridgeValidator.validMessages(bytes32(0)));
    }

    function test_validMessages_afterRegistration() public {
        bytes32[] memory messageHashes = new bytes32[](2);
        messageHashes[0] = TEST_MESSAGE_HASH_1;
        messageHashes[1] = TEST_MESSAGE_HASH_2;

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs());

        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));
        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_2));
        assertFalse(bridgeValidator.validMessages(TEST_MESSAGE_HASH_3));
    }

    //////////////////////////////////////////////////////////////
    ///                     Fuzz Tests                         ///
    //////////////////////////////////////////////////////////////

    function testFuzz_registerMessages_withRandomHashes(bytes32[] calldata messageHashes) public {
        vm.assume(messageHashes.length <= 1000); // Reasonable limit for gas

        vm.expectEmit(false, false, false, true);
        emit MessagesRegistered(messageHashes);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs());

        // Verify all messages are registered
        for (uint256 i; i < messageHashes.length; i++) {
            assertTrue(bridgeValidator.validMessages(messageHashes[i]));
        }
    }

    function testFuzz_validateMessage_withRegisteredHash(bytes32 messageHash) public {
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = messageHash;

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs());

        vm.expectEmit(true, false, false, false);
        emit ExecutingMessage(messageHash);

        bridgeValidator.validateMessage(messageHash);
    }

    function testFuzz_validateMessage_revertsOnUnregisteredHash(bytes32 messageHash) public {
        // Don't register the message
        vm.expectRevert(BridgeValidator.InvalidMessage.selector);
        bridgeValidator.validateMessage(messageHash);
    }

    function testFuzz_constructor_withRandomAddress(address randomRelayer) public {
        BridgeValidator testValidator = new BridgeValidator(randomRelayer);
        assertEq(testValidator.TRUSTED_RELAYER(), randomRelayer);
    }

    function _getValidatorSigs() private pure returns (bytes memory) {
        return "";
    }
}
