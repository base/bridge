// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC1967Factory} from "solady/utils/ERC1967Factory.sol";
import {Initializable} from "solady/utils/Initializable.sol";

import {DeployScript} from "../script/Deploy.s.sol";

import {BridgeValidator} from "../src/BridgeValidator.sol";

import {IPartner} from "../src/interfaces/IPartner.sol";
import {VerificationLib} from "../src/libraries/VerificationLib.sol";
import {MockPartnerValidators} from "./mocks/MockPartnerValidators.sol";

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
    event ThresholdUpdated(uint256 newThreshold);
    event ValidatorAdded(address validator);
    event ValidatorRemoved(address validator);

    function setUp() public {
        DeployScript deployer = new DeployScript();
        (, bridgeValidator, bridge,,, helperConfig) = deployer.run();
        cfg = helperConfig.getConfig();
    }

    //////////////////////////////////////////////////////////////
    ///                   Constructor Tests                    ///
    //////////////////////////////////////////////////////////////

    function test_constructor_setsPartnerValidatorThreshold() public view {
        assertEq(bridgeValidator.PARTNER_VALIDATOR_THRESHOLD(), cfg.partnerValidatorThreshold);
    }

    function test_constructor_withZeroThreshold() public {
        BridgeValidator testValidator = new BridgeValidator(0, address(bridge), cfg.partnerValidators);
        assertEq(testValidator.PARTNER_VALIDATOR_THRESHOLD(), 0);
    }

    function test_constructor_revertsWhenThresholdAboveMax() public {
        uint256 tooHigh = bridgeValidator.MAX_PARTNER_VALIDATOR_THRESHOLD() + 1;
        vm.expectRevert(BridgeValidator.ThresholdTooHigh.selector);
        new BridgeValidator(tooHigh, address(bridge), cfg.partnerValidators);
    }

    function test_constructor_revertsWhenZeroBridge() public {
        vm.expectRevert(BridgeValidator.ZeroAddress.selector);
        new BridgeValidator(0, address(0), cfg.partnerValidators);
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
        bridgeValidator.registerMessages(innerMessageHashes, invalidSig);
    }

    function test_registerMessages_revertsWhenPartnerThresholdNotMet() public {
        bytes32[] memory innerMessageHashes = new bytes32[](1);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;

        // Create a validator with threshold 1 and call with only BASE_ORACLE signature
        address testOracle = vm.addr(77);
        BridgeValidator testValidator = new BridgeValidator(1, address(bridge), cfg.partnerValidators);

        // Calculate message hash for nonce 0
        bytes32[] memory finalHashes = new bytes32[](1);
        finalHashes[0] = keccak256(abi.encode(uint256(0), innerMessageHashes[0]));
        bytes memory signedHash = abi.encode(finalHashes);

        // Only oracle signature -> should fail ThresholdNotMet
        bytes memory oracleSig = _createSignature(signedHash, 77);
        vm.expectRevert(BridgeValidator.PartnerThresholdNotMet.selector);
        vm.prank(testOracle);
        testValidator.registerMessages(innerMessageHashes, oracleSig);
    }

    function test_registerMessages_revertsOnEmptySignature() public {
        bytes32[] memory innerMessageHashes = new bytes32[](1);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;

        vm.expectRevert(BridgeValidator.BaseThresholdNotMet.selector);
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

        vm.expectRevert(BridgeValidator.UnsortedSigners.selector);
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

        vm.expectRevert(BridgeValidator.UnsortedSigners.selector);
        bridgeValidator.registerMessages(innerMessageHashes, unsortedSigs);
    }

    function test_registerMessages_revertsOnDuplicatePartnerEntitySigners() public {
        address newImpl = address(new BridgeValidator(1, address(bridge), cfg.partnerValidators));
        vm.prank(cfg.initialOwner);
        ERC1967Factory(cfg.erc1967Factory).upgrade(address(bridgeValidator), newImpl);

        // Setup a single partner with two keys that map to the same partner index
        MockPartnerValidators pv = MockPartnerValidators(cfg.partnerValidators);
        address partnerAddr1 = vm.addr(100);
        address partnerAddr2 = vm.addr(101);
        pv.addSigner(IPartner.Signer({evmAddress: partnerAddr1, newEvmAddress: partnerAddr2}));

        // Prepare a single message
        bytes32[] memory innerMessageHashes = new bytes32[](1);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;
        bytes32[] memory finalHashes = _calculateFinalHashes(innerMessageHashes);
        bytes memory signedHash = abi.encode(finalHashes);

        // Create signatures from: base validator and both partner keys
        address baseAddr = vm.addr(1);
        bytes memory sigBase = _createSignature(signedHash, 1);
        bytes memory sigP1 = _createSignature(signedHash, 100);
        bytes memory sigP2 = _createSignature(signedHash, 101);

        // Concatenate in strictly ascending address order to satisfy UnsortedSigners check
        address a0 = baseAddr;
        address a1 = partnerAddr1;
        address a2 = partnerAddr2;
        bytes memory s0 = sigBase;
        bytes memory s1 = sigP1;
        bytes memory s2 = sigP2;

        bytes memory orderedSigs;
        if (a0 < a1) {
            if (a1 < a2) {
                orderedSigs = abi.encodePacked(s0, s1, s2);
            } else if (a0 < a2) {
                orderedSigs = abi.encodePacked(s0, s2, s1);
            } else {
                orderedSigs = abi.encodePacked(s2, s0, s1);
            }
        } else {
            if (a0 < a2) {
                orderedSigs = abi.encodePacked(s1, s0, s2);
            } else if (a1 < a2) {
                orderedSigs = abi.encodePacked(s1, s2, s0);
            } else {
                orderedSigs = abi.encodePacked(s2, s1, s0);
            }
        }

        // Expect revert due to duplicate partner entity (same index) detected by the bitmap
        vm.expectRevert(BridgeValidator.DuplicateSigner.selector);
        bridgeValidator.registerMessages(innerMessageHashes, orderedSigs);
    }

    function test_registerMessages_withPartnerValidatorThreshold() public {
        // Create a BridgeValidator with partner validator threshold > 0
        address testOracle = vm.addr(100);
        BridgeValidator testValidator = new BridgeValidator(1, address(bridge), cfg.partnerValidators);

        bytes32[] memory innerMessageHashes = new bytes32[](1);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;

        // Calculate final hashes with the new validator's nonce (which is 0)
        bytes32[] memory finalHashes = new bytes32[](1);
        finalHashes[0] = keccak256(abi.encode(uint256(0), innerMessageHashes[0]));
        bytes memory signedHash = abi.encode(finalHashes);

        // Only BASE_ORACLE signature should fail threshold check
        bytes memory oracleSig = _createSignature(signedHash, 100);

        vm.expectRevert(BridgeValidator.PartnerThresholdNotMet.selector);
        vm.prank(testOracle);
        testValidator.registerMessages(innerMessageHashes, oracleSig);
    }

    function test_registerMessages_withBaseAndPartnerSignatures_success() public {
        // Add a partner signer to the mock partner validators
        MockPartnerValidators pv = MockPartnerValidators(cfg.partnerValidators);
        address partnerAddr = vm.addr(100);
        pv.addSigner(IPartner.Signer({evmAddress: partnerAddr, newEvmAddress: address(0)}));

        // Upgrade existing bridgeValidator proxy to a new implementation requiring 1 partner signature
        address newImpl = address(new BridgeValidator(1, address(bridge), cfg.partnerValidators));
        vm.prank(cfg.initialOwner);
        ERC1967Factory(cfg.erc1967Factory).upgrade(address(bridgeValidator), newImpl);

        // Prepare a single message
        bytes32[] memory innerMessageHashes = new bytes32[](1);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;

        // Compute final hash using the proxy's current nonce
        bytes32[] memory finalHashes = _calculateFinalHashes(innerMessageHashes);
        bytes memory signedHash = abi.encode(finalHashes);

        // Create Base and partner signatures and order them by ascending signer address
        address baseAddr = vm.addr(1);
        bytes memory sigBase = _createSignature(signedHash, 1);
        bytes memory sigPartner = _createSignature(signedHash, 100);
        bytes memory orderedSigs =
            baseAddr < partnerAddr ? abi.encodePacked(sigBase, sigPartner) : abi.encodePacked(sigPartner, sigBase);

        // Should succeed when both Base and partner thresholds are met
        bridgeValidator.registerMessages(innerMessageHashes, orderedSigs);

        // Verify the message is registered
        assertTrue(bridgeValidator.validMessages(finalHashes[0]));
    }

    //////////////////////////////////////////////////////////////
    ///                 Guardian/VerificationLib Tests          ///
    //////////////////////////////////////////////////////////////

    function test_setThreshold_onlyGuardian_revertsForNonGuardian() public {
        vm.expectRevert(BridgeValidator.CallerNotGuardian.selector);
        bridgeValidator.setThreshold(1);
    }

    function test_setThreshold_asGuardian_emitsEvent_andCanReapplySame() public {
        // Initial validator count is 1; only valid threshold is 1
        vm.expectEmit(false, false, false, true);
        emit ThresholdUpdated(1);
        vm.prank(cfg.guardians[0]);
        bridgeValidator.setThreshold(1);
    }

    function test_setThreshold_revertsWhenAboveValidatorCount() public {
        // With 1 validator, threshold 2 should revert
        vm.prank(cfg.guardians[0]);
        vm.expectRevert(VerificationLib.InvalidThreshold.selector);
        bridgeValidator.setThreshold(2);
    }

    function test_addValidator_onlyGuardian_revertsForNonGuardian() public {
        vm.expectRevert(BridgeValidator.CallerNotGuardian.selector);
        bridgeValidator.addValidator(vm.addr(2));
    }

    function test_addValidator_asGuardian_emitsEvent_andEnablesThreshold2() public {
        address newValidator = vm.addr(2);
        vm.expectEmit(false, false, false, true);
        emit ValidatorAdded(newValidator);
        vm.prank(cfg.guardians[0]);
        bridgeValidator.addValidator(newValidator);

        // Now set threshold to 2 and verify a message with 2 base signatures succeeds
        vm.prank(cfg.guardians[0]);
        bridgeValidator.setThreshold(2);

        bytes32[] memory innerMessageHashes = new bytes32[](1);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;
        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(innerMessageHashes);

        // Create signatures from base validators (key 1 and key 2) in ascending address order
        address addr1 = vm.addr(1);
        address addr2 = newValidator;
        uint256 key1 = 1;
        uint256 key2 = 2;
        bytes memory msgBytes = abi.encode(expectedFinalHashes);
        bytes memory sigA = _createSignature(msgBytes, key1);
        bytes memory sigB = _createSignature(msgBytes, key2);
        bytes memory sigs = addr1 < addr2 ? abi.encodePacked(sigA, sigB) : abi.encodePacked(sigB, sigA);

        bridgeValidator.registerMessages(innerMessageHashes, sigs);
        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[0]));
    }

    function test_addValidator_revertsWhenZeroAddress() public {
        vm.prank(cfg.guardians[0]);
        vm.expectRevert(VerificationLib.InvalidValidatorAddress.selector);
        bridgeValidator.addValidator(address(0));
    }

    function test_addValidator_revertsWhenAlreadyAdded() public {
        vm.prank(cfg.guardians[0]);
        vm.expectRevert(VerificationLib.ValidatorAlreadyAdded.selector);
        bridgeValidator.addValidator(vm.addr(1));
    }

    function test_removeValidator_onlyGuardian_revertsForNonGuardian() public {
        vm.expectRevert(BridgeValidator.CallerNotGuardian.selector);
        bridgeValidator.removeValidator(vm.addr(1));
    }

    function test_removeValidator_asGuardian_emitsEvent_andKeepsRegistering() public {
        // Add a second validator, keep threshold at 1, then remove it
        address newValidator = vm.addr(2);
        vm.prank(cfg.guardians[0]);
        bridgeValidator.addValidator(newValidator);

        vm.expectEmit(false, false, false, true);
        emit ValidatorRemoved(newValidator);
        vm.prank(cfg.guardians[0]);
        bridgeValidator.removeValidator(newValidator);

        // Registering with single base validator (key 1) still works
        bytes32[] memory innerMessageHashes = new bytes32[](1);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;
        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(innerMessageHashes);
        bridgeValidator.registerMessages(innerMessageHashes, _getValidatorSigs(innerMessageHashes));
        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[0]));
    }

    function test_removeValidator_revertsWhenWouldFallBelowThreshold() public {
        // Add a validator, set threshold to 2, then attempt to remove → revert
        address newValidator = vm.addr(2);
        vm.prank(cfg.guardians[0]);
        bridgeValidator.addValidator(newValidator);
        vm.prank(cfg.guardians[0]);
        bridgeValidator.setThreshold(2);

        vm.prank(cfg.guardians[0]);
        vm.expectRevert(VerificationLib.ValidatorCountLessThanThreshold.selector);
        bridgeValidator.removeValidator(newValidator);
    }

    //////////////////////////////////////////////////////////////
    ///                   Miscellaneous Tests                   ///
    //////////////////////////////////////////////////////////////

    function test_initialize_revertsWhenCalledTwice() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        bridgeValidator.initialize(cfg.baseValidators, cfg.baseSignatureThreshold);
    }

    function test_nextNonce_incrementsByBatchLength() public {
        assertEq(bridgeValidator.nextNonce(), 0);
        bytes32[] memory innerMessageHashes = new bytes32[](3);
        innerMessageHashes[0] = TEST_MESSAGE_HASH_1;
        innerMessageHashes[1] = TEST_MESSAGE_HASH_2;
        innerMessageHashes[2] = TEST_MESSAGE_HASH_3;
        bridgeValidator.registerMessages(innerMessageHashes, _getValidatorSigs(innerMessageHashes));
        assertEq(bridgeValidator.nextNonce(), 3);
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

        bridgeValidator.registerMessages(innerMessageHashes, _getValidatorSigs(innerMessageHashes));

        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[0]));
        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[1]));
        assertFalse(bridgeValidator.validMessages(TEST_MESSAGE_HASH_3));
    }

    //////////////////////////////////////////////////////////////
    ///                     Fuzz Tests                         ///
    //////////////////////////////////////////////////////////////

    function testFuzz_registerMessages_withRandomHashes(bytes32[] calldata innerMessageHashes) public {
        vm.assume(innerMessageHashes.length <= 1000); // Reasonable limit for gas

        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(innerMessageHashes);

        bridgeValidator.registerMessages(innerMessageHashes, _getValidatorSigs(innerMessageHashes));

        // Verify all messages are registered
        for (uint256 i; i < innerMessageHashes.length; i++) {
            assertTrue(bridgeValidator.validMessages(expectedFinalHashes[i]));
        }
    }

    function testFuzz_constructor_withRandomThreshold(uint256 threshold) public {
        vm.assume(threshold <= bridgeValidator.MAX_PARTNER_VALIDATOR_THRESHOLD());
        BridgeValidator testValidator = new BridgeValidator(threshold, address(bridge), cfg.partnerValidators);
        assertEq(testValidator.PARTNER_VALIDATOR_THRESHOLD(), threshold);
    }

    function testFuzz_registerMessages_withEmptyArray() public {
        bytes32[] memory emptyArray = new bytes32[](0);

        bridgeValidator.registerMessages(emptyArray, _getValidatorSigs(emptyArray));

        // No messages should be registered
        assertFalse(bridgeValidator.validMessages(TEST_MESSAGE_HASH_1));
    }
}
