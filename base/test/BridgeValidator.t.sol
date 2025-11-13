// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC1967Factory} from "solady/utils/ERC1967Factory.sol";
import {Initializable} from "solady/utils/Initializable.sol";

import {DeployScript} from "../script/Deploy.s.sol";

import {BridgeValidator} from "../src/BridgeValidator.sol";
import {IPartner} from "../src/interfaces/IPartner.sol";
import {Pubkey} from "../src/libraries/SVMLib.sol";
import {VerificationLib} from "../src/libraries/VerificationLib.sol";

import {CommonTest} from "./CommonTest.t.sol";
import {MockPartnerValidators} from "./mocks/MockPartnerValidators.sol";

contract BridgeValidatorTest is CommonTest {
    //////////////////////////////////////////////////////////////
    ///                       Test Setup                       ///
    //////////////////////////////////////////////////////////////

    // Test data
    bytes32 public constant TEST_MESSAGE_HASH_1 = keccak256("test_message_1");
    bytes32 public constant TEST_MESSAGE_HASH_2 = keccak256("test_message_2");
    bytes32 public constant TEST_MESSAGE_HASH_3 = keccak256("test_message_3");

    // Events to test
    event MessageRegistered(bytes32 indexed messageHash, Pubkey indexed outgoingMessagePubkey);
    event ThresholdUpdated(uint256 newThreshold);
    event ValidatorAdded(address validator);
    event ValidatorRemoved(address validator);
    event PartnerThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    function setUp() public {
        DeployScript deployer = new DeployScript();
        (, bridgeValidator, bridge,,, helperConfig,) = deployer.run();
        cfg = helperConfig.getConfig();
    }

    //////////////////////////////////////////////////////////////
    ///                   Constructor Tests                    ///
    //////////////////////////////////////////////////////////////

    function test_constructor_revertsWhenZeroBridge() public {
        vm.expectRevert(BridgeValidator.ZeroAddress.selector);
        new BridgeValidator(address(0), cfg.partnerValidators, cfg.partnerValidatorThreshold);
    }

    function test_constructor_revertsWhenZeroPartnerValidators() public {
        vm.expectRevert(BridgeValidator.ZeroAddress.selector);
        new BridgeValidator(address(bridge), address(0), cfg.partnerValidatorThreshold);
    }

    function test_constructor_setsBaseValidatorThreshold() public {
        BridgeValidator testValidator =
            new BridgeValidator(address(bridge), cfg.partnerValidators, cfg.partnerValidatorThreshold);
        assertEq(testValidator.getBaseThreshold(), type(uint128).max);
    }

    function test_constructor_setsPartnerValidatorThreshold() public {
        BridgeValidator testValidator =
            new BridgeValidator(address(bridge), cfg.partnerValidators, cfg.partnerValidatorThreshold);
        assertEq(testValidator.PARTNER_THRESHOLD(), cfg.partnerValidatorThreshold);
    }

    //////////////////////////////////////////////////////////////
    ///                 registerMessages Tests                 ///
    //////////////////////////////////////////////////////////////

    function test_registerMessages_revertsWhenBridgePaused() public {
        // Pause the bridge via guardian
        vm.prank(cfg.guardians[0]);
        bridge.setPaused(true);

        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](1);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_1
        });

        bytes memory sigs = _getValidatorSigs(signedMessages);

        vm.expectRevert(BridgeValidator.Paused.selector);
        bridgeValidator.registerMessages(signedMessages, sigs);
    }

    function test_registerMessages_emptyArray_revertsNoMessages() public {
        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](0);
        vm.expectRevert(BridgeValidator.NoMessages.selector);
        bridgeValidator.registerMessages(signedMessages, "");
    }

    function test_registerMessages_success() public {
        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](2);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_1
        });
        signedMessages[1] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_2
        });

        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(signedMessages);

        vm.expectEmit(false, false, false, true);
        emit MessageRegistered(expectedFinalHashes[0], signedMessages[0].outgoingMessagePubkey);

        bridgeValidator.registerMessages(signedMessages, _getValidatorSigs(signedMessages));

        // Verify messages are now valid
        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[0]));
        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[1]));
    }

    function test_registerMessages_singleMessage() public {
        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](1);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_1
        });

        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(signedMessages);

        vm.expectEmit(false, false, false, true);
        emit MessageRegistered(expectedFinalHashes[0], signedMessages[0].outgoingMessagePubkey);

        bridgeValidator.registerMessages(signedMessages, _getValidatorSigs(signedMessages));

        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[0]));
    }

    function test_registerMessages_largeArray() public {
        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](100);
        for (uint256 i; i < 100; i++) {
            signedMessages[i] = BridgeValidator.SignedMessage({
                outgoingMessagePubkey: TEST_OUTGOING_MESSAGE,
                innerMessageHash: keccak256(abi.encodePacked("message", i))
            });
        }

        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(signedMessages);

        vm.expectEmit(false, false, false, true);
        emit MessageRegistered(expectedFinalHashes[0], signedMessages[0].outgoingMessagePubkey);

        bridgeValidator.registerMessages(signedMessages, _getValidatorSigs(signedMessages));

        // Verify all messages are registered
        for (uint256 i; i < 100; i++) {
            assertTrue(bridgeValidator.validMessages(expectedFinalHashes[i]));
        }
    }

    function test_registerMessages_duplicateMessageHashes() public {
        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](3);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_1
        });
        signedMessages[1] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE,
            innerMessageHash: TEST_MESSAGE_HASH_1 // Duplicate
        });
        signedMessages[2] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_2
        });

        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(signedMessages);
        bytes memory validatorSigs = _getValidatorSigs(signedMessages);

        vm.expectEmit(false, false, false, true);
        emit MessageRegistered(expectedFinalHashes[0], signedMessages[0].outgoingMessagePubkey);

        bridgeValidator.registerMessages(signedMessages, validatorSigs);

        // All messages (including duplicates) should be valid with their respective final hashes
        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[0]));
        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[1]));
        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[2]));
    }

    function test_registerMessages_revertsOnInvalidSignatureLength() public {
        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](1);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_1
        });

        // Create signature with invalid length (64 bytes instead of 65)
        bytes memory invalidSig = new bytes(64);

        vm.expectRevert(BridgeValidator.InvalidSignatureLength.selector);
        bridgeValidator.registerMessages(signedMessages, invalidSig);
    }

    function test_registerMessages_revertsWhenPartnerThresholdNotMet() public {
        // Deploy a new BridgeValidator proxy with partner threshold 1
        // Use base threshold 1 (minimum allowed) - the test will provide a non-base, non-partner signature
        address impl = address(new BridgeValidator(address(bridge), cfg.partnerValidators, 1));
        address testValidatorAddr = ERC1967Factory(cfg.erc1967Factory)
            .deployAndCall({
                implementation: impl,
                admin: address(this),
                data: abi.encodeCall(BridgeValidator.initialize, (cfg.baseValidators, 1))
            });
        BridgeValidator testValidator = BridgeValidator(testValidatorAddr);

        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](1);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_1
        });

        // Calculate message hash
        bytes32[] memory finalHashes = new bytes32[](1);
        uint256 currentNonce = testValidator.nextNonce();
        finalHashes[0] = keccak256(
            abi.encode(currentNonce, signedMessages[0].outgoingMessagePubkey, signedMessages[0].innerMessageHash)
        );
        bytes memory signedHash = abi.encode(finalHashes);

        // Only oracle signature (not a base validator, not a partner validator) -> should fail BaseThresholdNotMet
        // Actually, since base threshold is 1 and we need at least 1 base validator signature, this will fail
        // BaseThresholdNotMet But the test expects PartnerThresholdNotMet. Let's provide a base validator signature but
        // no partner signature
        bytes memory baseSig = _createSignature(signedHash, 1); // This is a base validator
        vm.expectRevert(BridgeValidator.PartnerThresholdNotMet.selector);
        testValidator.registerMessages(signedMessages, baseSig);
    }

    function test_registerMessages_revertsOnEmptySignature() public {
        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](1);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_1
        });

        vm.expectRevert(BridgeValidator.BaseThresholdNotMet.selector);
        bridgeValidator.registerMessages(signedMessages, "");
    }

    function test_registerMessages_anyoneCanCallWithValidSigs() public {
        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](1);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_1
        });

        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(signedMessages);

        // Anyone can call registerMessages as long as signatures are valid
        vm.prank(address(0x999)); // Not the trusted relayer, but should still work
        bridgeValidator.registerMessages(signedMessages, _getValidatorSigs(signedMessages));

        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[0]));
    }

    function test_registerMessages_revertsOnDuplicateSigners() public {
        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](1);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_1
        });

        bytes32[] memory finalHashes = _calculateFinalHashes(signedMessages);
        bytes memory signedHash = abi.encode(finalHashes);

        // Create duplicate signatures from same signer
        bytes memory sig1 = _createSignature(signedHash, 1);
        bytes memory sig2 = _createSignature(signedHash, 1);
        bytes memory duplicateSigs = abi.encodePacked(sig1, sig2);

        vm.expectRevert(BridgeValidator.UnsortedSigners.selector);
        bridgeValidator.registerMessages(signedMessages, duplicateSigs);
    }

    function test_registerMessages_revertsOnUnsortedSigners() public {
        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](1);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_1
        });

        bytes32[] memory finalHashes = _calculateFinalHashes(signedMessages);
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
        bridgeValidator.registerMessages(signedMessages, unsortedSigs);
    }

    function test_registerMessages_revertsOnDuplicatePartnerEntitySigners() public {
        // Deploy a new BridgeValidator proxy with partner threshold 1
        address impl = address(new BridgeValidator(address(bridge), cfg.partnerValidators, 1));
        address testValidatorAddr = ERC1967Factory(cfg.erc1967Factory)
            .deployAndCall({
                implementation: impl,
                admin: address(this),
                data: abi.encodeCall(BridgeValidator.initialize, (cfg.baseValidators, cfg.baseSignatureThreshold))
            });
        BridgeValidator testValidator = BridgeValidator(testValidatorAddr);

        // Setup a single partner with two keys that map to the same partner index
        MockPartnerValidators(cfg.partnerValidators)
            .addSigner(IPartner.Signer({evmAddress: vm.addr(100), newEvmAddress: vm.addr(101)}));

        // Prepare a single message
        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](1);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_1
        });

        // Calculate final hashes using the test validator's nonce
        bytes32[] memory finalHashes = new bytes32[](1);
        finalHashes[0] = keccak256(
            abi.encode(
                testValidator.nextNonce(), signedMessages[0].outgoingMessagePubkey, signedMessages[0].innerMessageHash
            )
        );
        bytes memory signedHash = abi.encode(finalHashes);

        // Create signatures and order by address
        bytes memory sigBase = _createSignature(signedHash, 1);
        bytes memory sigP1 = _createSignature(signedHash, 100);
        bytes memory sigP2 = _createSignature(signedHash, 101);

        // Order signatures by ascending address
        address baseAddr = vm.addr(1);
        address partnerAddr1 = vm.addr(100);
        address partnerAddr2 = vm.addr(101);
        bytes memory orderedSigs = _orderSignatures(baseAddr, partnerAddr1, partnerAddr2, sigBase, sigP1, sigP2);

        // Expect revert due to duplicate partner entity (same index) detected by the bitmap
        vm.expectRevert(BridgeValidator.DuplicateSigner.selector);
        testValidator.registerMessages(signedMessages, orderedSigs);
    }

    function _orderSignatures(
        address addr0,
        address addr1,
        address addr2,
        bytes memory sig0,
        bytes memory sig1,
        bytes memory sig2
    ) private pure returns (bytes memory) {
        if (addr0 < addr1) {
            if (addr1 < addr2) return abi.encodePacked(sig0, sig1, sig2);
            if (addr0 < addr2) return abi.encodePacked(sig0, sig2, sig1);
            return abi.encodePacked(sig2, sig0, sig1);
        }
        if (addr0 < addr2) return abi.encodePacked(sig1, sig0, sig2);
        if (addr1 < addr2) return abi.encodePacked(sig1, sig2, sig0);
        return abi.encodePacked(sig2, sig1, sig0);
    }

    function test_registerMessages_withPartnerValidatorThreshold() public {
        // Deploy a new BridgeValidator proxy with partner validator threshold 1
        // Use base threshold 1 (minimum allowed) - the test will provide base signature but no partner signature
        address impl = address(new BridgeValidator(address(bridge), cfg.partnerValidators, 1));
        address testValidatorAddr = ERC1967Factory(cfg.erc1967Factory)
            .deployAndCall({
                implementation: impl,
                admin: address(this),
                data: abi.encodeCall(BridgeValidator.initialize, (cfg.baseValidators, 1))
            });
        BridgeValidator testValidator = BridgeValidator(testValidatorAddr);

        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](1);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_1
        });

        // Calculate final hashes with the validator's current nonce
        bytes32[] memory finalHashes = new bytes32[](1);
        uint256 currentNonce = testValidator.nextNonce();
        finalHashes[0] = keccak256(
            abi.encode(currentNonce, signedMessages[0].outgoingMessagePubkey, signedMessages[0].innerMessageHash)
        );
        bytes memory signedHash = abi.encode(finalHashes);

        // Only base validator signature (no partner signature) should fail partner threshold check
        bytes memory baseSig = _createSignature(signedHash, 1); // This is a base validator

        vm.expectRevert(BridgeValidator.PartnerThresholdNotMet.selector);
        testValidator.registerMessages(signedMessages, baseSig);
    }

    function test_registerMessages_withBaseAndPartnerSignatures_success() public {
        // Add a partner signer to the mock partner validators
        MockPartnerValidators pv = MockPartnerValidators(cfg.partnerValidators);
        address partnerAddr = vm.addr(100);
        pv.addSigner(IPartner.Signer({evmAddress: partnerAddr, newEvmAddress: address(0)}));

        // Upgrade existing bridgeValidator proxy to a new implementation requiring 1 partner signature
        _mockPartnerThreshold(1);

        // Prepare a single message
        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](1);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_1
        });

        // Compute final hash using the proxy's current nonce
        bytes32[] memory finalHashes = _calculateFinalHashes(signedMessages);
        bytes memory signedHash = abi.encode(finalHashes);

        // Create Base and partner signatures and order them by ascending signer address
        address baseAddr = vm.addr(1);
        bytes memory sigBase = _createSignature(signedHash, 1);
        bytes memory sigPartner = _createSignature(signedHash, 100);
        bytes memory orderedSigs =
            baseAddr < partnerAddr ? abi.encodePacked(sigBase, sigPartner) : abi.encodePacked(sigPartner, sigBase);

        // Should succeed when both Base and partner thresholds are met
        bridgeValidator.registerMessages(signedMessages, orderedSigs);

        // Verify the message is registered
        assertTrue(bridgeValidator.validMessages(finalHashes[0]));
    }

    //////////////////////////////////////////////////////////////
    ///                 Guardian/VerificationLib Tests          ///
    //////////////////////////////////////////////////////////////

    function test_initialize_revertsWhenAboveMaxBaseSignerCount() public {
        // Unset the initializer slot.
        vm.store(
            address(bridgeValidator),
            bytes32(0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffbf601132),
            bytes32(0)
        );

        address[] memory validators = new address[](VerificationLib.MAX_BASE_SIGNER_COUNT + 1);
        for (uint256 i; i < VerificationLib.MAX_BASE_SIGNER_COUNT + 1; i++) {
            validators[i] = vm.addr(i + 2);
        }

        vm.expectRevert(VerificationLib.BaseSignerCountTooHigh.selector);
        bridgeValidator.initialize(validators, 3);
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
        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](3);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_1
        });
        signedMessages[1] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_2
        });
        signedMessages[2] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_3
        });
        bridgeValidator.registerMessages(signedMessages, _getValidatorSigs(signedMessages));
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
        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](2);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_1
        });
        signedMessages[1] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: TEST_MESSAGE_HASH_2
        });

        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(signedMessages);

        bridgeValidator.registerMessages(signedMessages, _getValidatorSigs(signedMessages));

        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[0]));
        assertTrue(bridgeValidator.validMessages(expectedFinalHashes[1]));
        assertFalse(bridgeValidator.validMessages(TEST_MESSAGE_HASH_3));
    }

    //////////////////////////////////////////////////////////////
    ///                     Fuzz Tests                         ///
    //////////////////////////////////////////////////////////////

    function testFuzz_registerMessages_withRandomHashes(bytes32[] calldata innerMessageHashes) public {
        vm.assume(innerMessageHashes.length > 0);
        vm.assume(innerMessageHashes.length <= 1000); // Reasonable limit for gas

        BridgeValidator.SignedMessage[] memory signedMessages =
            new BridgeValidator.SignedMessage[](innerMessageHashes.length);
        for (uint256 i; i < innerMessageHashes.length; i++) {
            signedMessages[i] = BridgeValidator.SignedMessage({
                outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: innerMessageHashes[i]
            });
        }

        bytes32[] memory expectedFinalHashes = _calculateFinalHashes(signedMessages);

        bridgeValidator.registerMessages(signedMessages, _getValidatorSigs(signedMessages));

        // Verify all messages are registered
        for (uint256 i; i < innerMessageHashes.length; i++) {
            assertTrue(bridgeValidator.validMessages(expectedFinalHashes[i]));
        }
    }

    //////////////////////////////////////////////////////////////
    ///                     Helper Functions                   ///
    //////////////////////////////////////////////////////////////

    function _mockBaseThreshold(uint128 threshold) public {
        bytes32 baseThresholdSlot = 0x245c109929d1c5575e8db91278c683d6e028507d88b9169278939e24f465af01;

        bytes32 value = vm.load(address(bridgeValidator), baseThresholdSlot);
        value = (value >> 128) << 128 | bytes32(uint256(threshold));

        vm.store(address(bridgeValidator), baseThresholdSlot, value);
    }

    function _mockPartnerThreshold(uint256 threshold) public {
        bytes32 partnerThresholdSlot = bytes32(0);
        vm.store(address(bridgeValidator), partnerThresholdSlot, bytes32(uint256(threshold)));
    }
}
