// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DeployScript} from "../script/Deploy.s.sol";
import {HelperConfig} from "../script/HelperConfig.s.sol";

import {BridgeValidator} from "../src/BridgeValidator.sol";
import {CommonTest} from "./CommonTest.t.sol";

contract BridgeValidatorTest is CommonTest {
    //////////////////////////////////////////////////////////////
    ///                       Test Setup                       ///
    //////////////////////////////////////////////////////////////

    // Test data
    bytes32 public constant TEST_MESSAGE_HASH_1 = keccak256("test_message_1");
    bytes32 public constant TEST_MESSAGE_HASH_2 = keccak256("test_message_2");
    bytes32 public constant TEST_MESSAGE_HASH_3 = keccak256("test_message_3");

    // Events to test
    event MessageRegistered(bytes32 indexed messageHashes);
    event ExecutingMessage(bytes32 indexed msgHash);

    function setUp() public {
        DeployScript deployer = new DeployScript();
        (, bridgeValidator,,, helperConfig) = deployer.run();
        cfg = helperConfig.getConfig();
    }

    //////////////////////////////////////////////////////////////
    ///                   Constructor Tests                    ///
    //////////////////////////////////////////////////////////////

    function test_constructor_setsTrustedRelayerCorrectly() public view {
        assertEq(bridgeValidator.BASE_ORACLE(), cfg.trustedRelayer);
    }

    function test_constructor_setsPartnerValidatorThreshold() public view {
        assertEq(bridgeValidator.PARTNER_VALIDATOR_THRESHOLD(), cfg.partnerValidatorThreshold);
    }

    function test_constructor_withZeroThreshold() public {
        BridgeValidator testValidator = new BridgeValidator(address(0x123), 0);
        assertEq(testValidator.PARTNER_VALIDATOR_THRESHOLD(), 0);
    }

    //////////////////////////////////////////////////////////////
    ///                 registerMessages Tests                 ///
    //////////////////////////////////////////////////////////////

    function test_registerMessages_success() public {
        bytes32[] memory messageHashes = new bytes32[](2);
        messageHashes[0] = TEST_MESSAGE_HASH_1;
        messageHashes[1] = TEST_MESSAGE_HASH_2;

        vm.expectEmit(false, false, false, true);
        emit MessageRegistered(messageHashes[0]);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs(messageHashes));

        // Verify messages are now valid
        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));
        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_2));
    }

    function test_registerMessages_singleMessage() public {
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = TEST_MESSAGE_HASH_1;

        vm.expectEmit(false, false, false, true);
        emit MessageRegistered(messageHashes[0]);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs(messageHashes));

        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));
    }

    function test_registerMessages_largeArray() public {
        bytes32[] memory messageHashes = new bytes32[](100);
        for (uint256 i; i < 100; i++) {
            messageHashes[i] = keccak256(abi.encodePacked("message", i));
        }

        vm.expectEmit(false, false, false, true);
        emit MessageRegistered(messageHashes[0]);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs(messageHashes));

        // Verify all messages are registered
        for (uint256 i; i < 100; i++) {
            assertTrue(bridgeValidator.validMessages(messageHashes[i]));
        }
    }

    function test_registerMessages_duplicateMessageHashes() public {
        bytes32[] memory messageHashes = new bytes32[](3);
        messageHashes[0] = TEST_MESSAGE_HASH_1;
        messageHashes[1] = TEST_MESSAGE_HASH_1; // Duplicate
        messageHashes[2] = TEST_MESSAGE_HASH_2;

        bytes memory validatorSigs = _getValidatorSigs(messageHashes);

        vm.expectEmit(false, false, false, true);
        emit MessageRegistered(messageHashes[0]);

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
        bridgeValidator.registerMessages(messageHashes1, _getValidatorSigs(messageHashes1));

        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));

        // Second registration with same hash
        bytes32[] memory messageHashes2 = new bytes32[](1);
        messageHashes2[0] = TEST_MESSAGE_HASH_1;

        vm.expectEmit(false, false, false, true);
        emit MessageRegistered(messageHashes2[0]);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes2, _getValidatorSigs(messageHashes2));

        // Should still be valid
        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));
    }

    function test_registerMessages_revertsOnInvalidSignatureLength() public {
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = TEST_MESSAGE_HASH_1;

        // Create signature with invalid length (64 bytes instead of 65)
        bytes memory invalidSig = new bytes(64);

        vm.expectRevert(BridgeValidator.InvalidSignatureLength.selector);
        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, invalidSig);
    }

    function test_registerMessages_revertsOnEmptySignature() public {
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = TEST_MESSAGE_HASH_1;

        vm.expectRevert(BridgeValidator.ThresholdNotMet.selector);
        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, "");
    }

    function test_registerMessages_anyoneCanCallWithValidSigs() public {
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = TEST_MESSAGE_HASH_1;

        // Anyone can call registerMessages as long as signatures are valid
        vm.prank(address(0x999)); // Not the trusted relayer, but should still work
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs(messageHashes));

        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));
    }

    function test_registerMessages_revertsOnDuplicateSigners() public {
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = TEST_MESSAGE_HASH_1;

        bytes32 signedHash = keccak256(abi.encode(messageHashes));

        // Create duplicate signatures from same signer
        bytes memory sig1 = _createSignature(signedHash, 1);
        bytes memory sig2 = _createSignature(signedHash, 1);
        bytes memory duplicateSigs = abi.encodePacked(sig1, sig2);

        vm.expectRevert(BridgeValidator.Unauthenticated.selector);
        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, duplicateSigs);
    }

    function test_registerMessages_revertsOnUnsortedSigners() public {
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = TEST_MESSAGE_HASH_1;

        bytes32 signedHash = keccak256(abi.encode(messageHashes));

        // Create signatures in wrong order (addresses should be sorted)
        uint256 key1 = 1;
        uint256 key2 = 2;
        address addr1 = vm.addr(key1);
        address addr2 = vm.addr(key2);

        // Ensure we have the ordering we expect
        if (addr1 > addr2) {
            (key1, key2) = (key2, key1);
            (addr1, addr2) = (addr2, addr1);
        }

        // Now create signatures in reverse order
        bytes memory sig1 = _createSignature(signedHash, key2); // Higher address first
        bytes memory sig2 = _createSignature(signedHash, key1); // Lower address second
        bytes memory unsortedSigs = abi.encodePacked(sig1, sig2);

        vm.expectRevert(BridgeValidator.Unauthenticated.selector);
        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, unsortedSigs);
    }

    function test_registerMessages_requiresBaseOracleSignature() public {
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = TEST_MESSAGE_HASH_1;

        bytes32 signedHash = keccak256(abi.encode(messageHashes));

        // Create signature from non-BASE_ORACLE key
        bytes memory nonOracleSig = _createSignature(signedHash, 999);

        vm.expectRevert(BridgeValidator.InvalidSigner.selector);
        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, nonOracleSig);
    }

    function test_registerMessages_withPartnerValidatorThreshold() public {
        // Create a BridgeValidator with partner validator threshold > 0
        address testOracle = vm.addr(100);
        BridgeValidator testValidator = new BridgeValidator(testOracle, 1);

        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = TEST_MESSAGE_HASH_1;

        bytes32 signedHash = keccak256(abi.encode(messageHashes));

        // Only BASE_ORACLE signature should fail threshold check
        bytes memory oracleSig = _createSignature(signedHash, 100);

        vm.expectRevert(BridgeValidator.ThresholdNotMet.selector);
        vm.prank(testOracle);
        testValidator.registerMessages(messageHashes, oracleSig);
    }

    //////////////////////////////////////////////////////////////
    ///                 validateMessage Tests                  ///
    //////////////////////////////////////////////////////////////

    function test_validateMessage_success() public {
        // First register the message
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = TEST_MESSAGE_HASH_1;

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs(messageHashes));

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
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs(messageHashes));

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
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs(messageHashes));

        // Try to validate a different message
        vm.expectRevert(BridgeValidator.InvalidMessage.selector);
        bridgeValidator.validateMessage(TEST_MESSAGE_HASH_2);
    }

    function test_validateMessage_withZeroHash() public {
        // Register zero hash
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = bytes32(0);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs(messageHashes));

        // Should be able to validate zero hash
        vm.expectEmit(true, false, false, false);
        emit ExecutingMessage(bytes32(0));
        bridgeValidator.validateMessage(bytes32(0));
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
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs(messageHashes));

        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));
        assertTrue(bridgeValidator.validMessages(TEST_MESSAGE_HASH_2));
        assertFalse(bridgeValidator.validMessages(TEST_MESSAGE_HASH_3));
    }

    function test_constants() public view {
        assertEq(bridgeValidator.SIGNATURE_LENGTH_THRESHOLD(), 65);
    }

    //////////////////////////////////////////////////////////////
    ///                     Fuzz Tests                         ///
    //////////////////////////////////////////////////////////////

    function testFuzz_registerMessages_withRandomHashes(bytes32[] calldata messageHashes) public {
        vm.assume(messageHashes.length <= 1000); // Reasonable limit for gas

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs(messageHashes));

        // Verify all messages are registered
        for (uint256 i; i < messageHashes.length; i++) {
            assertTrue(bridgeValidator.validMessages(messageHashes[i]));
        }
    }

    function testFuzz_validateMessage_withRegisteredHash(bytes32 messageHash) public {
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = messageHash;

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs(messageHashes));

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
        BridgeValidator testValidator = new BridgeValidator(randomRelayer, 0);
        assertEq(testValidator.BASE_ORACLE(), randomRelayer);
    }

    function testFuzz_constructor_withRandomThreshold(uint256 threshold) public {
        vm.assume(threshold <= type(uint256).max);
        BridgeValidator testValidator = new BridgeValidator(address(0x123), threshold);
        assertEq(testValidator.PARTNER_VALIDATOR_THRESHOLD(), threshold);
    }

    function testFuzz_registerMessages_withEmptyArray() public {
        bytes32[] memory emptyArray = new bytes32[](0);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(emptyArray, _getValidatorSigs(emptyArray));

        // No messages should be registered
        assertFalse(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));
    }
}
