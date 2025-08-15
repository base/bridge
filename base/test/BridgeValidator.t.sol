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
        bytes32[] memory innerMessageHashes = new bytes32[](2);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;
        innerMessageHashes[1] = TEST_MESSAGE_HASH_2;

        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(innerMessageHashes);

        vm.expectEmit(false, false, false, true);
        emit MessageRegistered(expectedFinalHashes[0]);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(innerMessageHashes, _getValidatorSigs(innerMessageHashes));

        // Verify messages are now valid
        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[0]));
        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[1]));
    }

    function test_registerMessages_singleMessage() public {
        bytes32[] memory innerMessageHashes = new bytes32[](1);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;

        // Calculate the expected final message hash with nonce
        uint256 currentNonce = bridgeValidator.nextNonce();
        bytes32 expectedFinalHash = keccak256(abi.encode(currentNonce, innerMessageHashes[0]));

        vm.expectEmit(false, false, false, true);
        emit MessageRegistered(expectedFinalHash);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(innerMessageHashes, _getValidatorSigs(innerMessageHashes));

        assertTrue(bridgeValidator.validMessages(expectedFinalHash));
    }

    function test_registerMessages_largeArray() public {
        bytes32[] memory innerMessageHashes = new bytes32[](100);
        for (uint256 i; i < 100; i++) {
            innerMessageHashes[i] = keccak256(abi.encodePacked("message", i));
        }

        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(innerMessageHashes);

        vm.expectEmit(false, false, false, true);
        emit MessageRegistered(expectedFinalHashes[0]);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(innerMessageHashes, _getValidatorSigs(innerMessageHashes));

        // Verify all messages are registered
        for (uint256 i; i < 100; i++) {
            assertTrue(bridgeValidator.validMessages(expectedFinalHashes[i]));
        }
    }

    function test_registerMessages_duplicateMessageHashes() public {
        bytes32[] memory innerMessageHashes = new bytes32[](3);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;
        innerMessageHashes[1] = TEST_MESSAGE_HASH_1; // Duplicate
        innerMessageHashes[2] = TEST_MESSAGE_HASH_2;

        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(innerMessageHashes);
        bytes memory validatorSigs = _getValidatorSigs(innerMessageHashes);

        vm.expectEmit(false, false, false, true);
        emit MessageRegistered(expectedFinalHashes[0]);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(innerMessageHashes, validatorSigs);

        // All messages (including duplicates) should be valid with their respective final hashes
        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[0]));
        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[1]));
        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[2]));
    }

    function test_registerMessages_revertsOnInvalidSignatureLength() public {
        bytes32[] memory innerMessageHashes = new bytes32[](1);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;

        // Create signature with invalid length (64 bytes instead of 65)
        bytes memory invalidSig = new bytes(64);

        vm.expectRevert(BridgeValidator.InvalidSignatureLength.selector);
        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(innerMessageHashes, invalidSig);
    }

    function test_registerMessages_revertsOnEmptySignature() public {
        bytes32[] memory innerMessageHashes = new bytes32[](1);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;

        vm.expectRevert(BridgeValidator.ThresholdNotMet.selector);
        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(innerMessageHashes, "");
    }

    function test_registerMessages_anyoneCanCallWithValidSigs() public {
        bytes32[] memory innerMessageHashes = new bytes32[](1);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;

        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(innerMessageHashes);

        // Anyone can call registerMessages as long as signatures are valid
        vm.prank(address(0x999)); // Not the trusted relayer, but should still work
        bridgeValidator.registerMessages(innerMessageHashes, _getValidatorSigs(innerMessageHashes));

        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[0]));
    }

    function test_registerMessages_revertsOnDuplicateSigners() public {
        bytes32[] memory innerMessageHashes = new bytes32[](1);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;

        bytes32[] memory finalHashes = _calculateFinalHashes(innerMessageHashes);
        bytes memory signedHash = abi.encode(finalHashes);

        // Create duplicate signatures from same signer
        bytes memory sig1 = _createSignature(signedHash, 1);
        bytes memory sig2 = _createSignature(signedHash, 1);
        bytes memory duplicateSigs = abi.encodePacked(sig1, sig2);

        vm.expectRevert(BridgeValidator.Unauthenticated.selector);
        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(innerMessageHashes, duplicateSigs);
    }

    function test_registerMessages_revertsOnUnsortedSigners() public {
        bytes32[] memory innerMessageHashes = new bytes32[](1);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;

        bytes32[] memory finalHashes = _calculateFinalHashes(innerMessageHashes);
        bytes memory signedHash = abi.encode(finalHashes);

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
        bridgeValidator.registerMessages(innerMessageHashes, unsortedSigs);
    }

    function test_registerMessages_withPartnerValidatorThreshold() public {
        // Create a BridgeValidator with partner validator threshold > 0
        address testOracle = vm.addr(100);
        BridgeValidator testValidator = new BridgeValidator(testOracle, 1);

        bytes32[] memory innerMessageHashes = new bytes32[](1);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;

        // Calculate final hashes with the new validator's nonce (which is 0)
        bytes32[] memory finalHashes = new bytes32[](1);
        finalHashes[0] = keccak256(abi.encode(uint256(0), innerMessageHashes[0]));
        bytes memory signedHash = abi.encode(finalHashes);

        // Only BASE_ORACLE signature should fail threshold check
        bytes memory oracleSig = _createSignature(signedHash, 100);

        vm.expectRevert(BridgeValidator.ThresholdNotMet.selector);
        vm.prank(testOracle);
        testValidator.registerMessages(innerMessageHashes, oracleSig);
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
        bytes32[] memory innerMessageHashes = new bytes32[](2);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;
        innerMessageHashes[1] = TEST_MESSAGE_HASH_2;

        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(innerMessageHashes);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(innerMessageHashes, _getValidatorSigs(innerMessageHashes));

        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[0]));
        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[1]));
        assertFalse(bridgeValidator.validMessages(TEST_MESSAGE_HASH_3));
    }

    function test_constants() public view {
        assertEq(bridgeValidator.SIGNATURE_LENGTH_THRESHOLD(), 65);
    }

    //////////////////////////////////////////////////////////////
    ///                     Fuzz Tests                         ///
    //////////////////////////////////////////////////////////////

    function testFuzz_registerMessages_withRandomHashes(bytes32[] calldata innerMessageHashes) public {
        vm.assume(innerMessageHashes.length <= 1000); // Reasonable limit for gas

        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(innerMessageHashes);

        vm.prank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(innerMessageHashes, _getValidatorSigs(innerMessageHashes));

        // Verify all messages are registered
        for (uint256 i; i < innerMessageHashes.length; i++) {
            assertTrue(bridgeValidator.validMessages(expectedFinalHashes[i]));
        }
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
