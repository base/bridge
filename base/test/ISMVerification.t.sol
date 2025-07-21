// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {HelperConfig} from "../script/HelperConfig.s.sol";
import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";
import {ERC1967Factory} from "solady/utils/ERC1967Factory.sol";
import {UpgradeableBeacon} from "solady/utils/UpgradeableBeacon.sol";

import {Bridge} from "../src/Bridge.sol";

import {CrossChainERC20} from "../src/CrossChainERC20.sol";
import {CrossChainERC20Factory} from "../src/CrossChainERC20Factory.sol";
import {Twin} from "../src/Twin.sol";
import {IncomingMessage, MessageType} from "../src/libraries/MessageLib.sol";
import {Pubkey} from "../src/libraries/SVMLib.sol";

contract ISMVerificationTest is Test {
    Bridge public bridge;

    // Test accounts
    address public owner;
    address public validator1;
    address public validator2;
    address public validator3;
    address public validator4;
    address public nonValidator;
    address public trustedRelayer;

    // Test private keys for signing
    uint256 public constant VALIDATOR1_KEY = 0x1;
    uint256 public constant VALIDATOR2_KEY = 0x2;
    uint256 public constant VALIDATOR3_KEY = 0x3;
    uint256 public constant VALIDATOR4_KEY = 0x4;

    // Test messages
    IncomingMessage[] internal testMessages;

    // Events to test
    event ISMVerified();

    function setUp() public {
        HelperConfig helperConfig = new HelperConfig();
        HelperConfig.NetworkConfig memory cfg = helperConfig.getConfig();

        owner = makeAddr("owner");
        validator1 = vm.addr(VALIDATOR1_KEY);
        validator2 = vm.addr(VALIDATOR2_KEY);
        validator3 = vm.addr(VALIDATOR3_KEY);
        validator4 = vm.addr(VALIDATOR4_KEY);
        nonValidator = makeAddr("nonValidator");

        // Deploy Bridge with ISM validators and threshold
        address[] memory validators = new address[](4);
        validators[0] = validator1;
        validators[1] = validator2;
        validators[2] = validator3;
        validators[3] = validator4;

        // Deploy supporting contracts first
        Pubkey remoteBridge = Pubkey.wrap(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef);
        trustedRelayer = makeAddr("trustedRelayer");

        // Create Twin beacon
        address twinImpl = address(new Twin(address(0))); // Placeholder, will be updated
        address twinBeacon = address(new UpgradeableBeacon(owner, twinImpl));

        // Create CrossChainERC20Factory
        address erc20Impl = address(new CrossChainERC20(address(0))); // Placeholder
        address erc20Beacon = address(new UpgradeableBeacon(owner, erc20Impl));
        CrossChainERC20Factory factory = new CrossChainERC20Factory(erc20Beacon);

        // Deploy Bridge
        vm.prank(owner);
        Bridge bridgeImpl = new Bridge({
            remoteBridge: remoteBridge,
            trustedRelayer: trustedRelayer,
            twinBeacon: twinBeacon,
            crossChainErc20Factory: address(factory)
        });

        vm.prank(owner);
        address bridgeAddr = ERC1967Factory(cfg.erc1967Factory).deployDeterministicAndCall({
            implementation: address(bridgeImpl),
            admin: owner,
            salt: _salt(bytes12("bridge")),
            data: abi.encodeCall(Bridge.initialize, (validators, 2, owner, new address[](0)))
        });

        bridge = Bridge(bridgeAddr);

        // Create test messages
        testMessages.push(
            IncomingMessage({
                nonce: 0,
                sender: Pubkey.wrap(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef),
                gasLimit: 1000000,
                ty: MessageType.Call,
                data: hex"deadbeef"
            })
        );

        testMessages.push(
            IncomingMessage({
                nonce: 1,
                sender: Pubkey.wrap(0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890),
                gasLimit: 500000,
                ty: MessageType.Transfer,
                data: hex"cafebabe"
            })
        );
    }

    //////////////////////////////////////////////////////////////
    ///                   Constructor Tests                    ///
    //////////////////////////////////////////////////////////////

    function test_constructor_successfulInitializationInSetup() public view {
        /// @dev This test verifies that constructor validation success paths were executed in setUp().
        /// Tests threshold validation requirement and validator loop that checks for zero addresses and duplicates.

        // Verify the successful initialization from setUp()
        assertEq(bridge.getISMThreshold(), 2, "Threshold should be 2 (constructor validation success)");
        assertEq(bridge.getISMValidatorCount(), 4, "Should have 4 validators (constructor validation success)");

        /// @dev Verify all validators were processed successfully during constructor validation.
        assertTrue(bridge.isISMValidator(validator1), "validator1 should be registered");
        assertTrue(bridge.isISMValidator(validator2), "validator2 should be registered");
        assertTrue(bridge.isISMValidator(validator3), "validator3 should be registered");
        assertTrue(bridge.isISMValidator(validator4), "validator4 should be registered");

        // Verify owner was set correctly
        assertEq(bridge.owner(), owner, "Owner should be set correctly");
    }

    function test_constructor_setsCorrectThreshold() public view {
        assertEq(bridge.getISMThreshold(), 2);
    }

    function test_constructor_setsOwner() public view {
        assertEq(bridge.owner(), owner);
    }

    function test_constructor_setsValidators() public view {
        // Check that all validators are correctly set
        assertTrue(bridge.isISMValidator(validator1));
        assertTrue(bridge.isISMValidator(validator2));
        assertTrue(bridge.isISMValidator(validator3));
        assertTrue(bridge.isISMValidator(validator4));
        assertFalse(bridge.isISMValidator(nonValidator)); // Should not be a validator
    }

    function test_constructor_setsValidatorCount() public view {
        assertEq(bridge.getISMValidatorCount(), 4);
    }

    function test_constructor_revertsWithInvalidThreshold() public {
        address[] memory validators = new address[](2);
        validators[0] = validator1;
        validators[1] = validator2;

        // Deploy supporting contracts first
        Pubkey remoteBridge = Pubkey.wrap(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef);
        address twinImpl = address(new Twin(address(0)));
        address twinBeacon = address(new UpgradeableBeacon(owner, twinImpl));
        address erc20Impl = address(new CrossChainERC20(address(0)));
        address erc20Beacon = address(new UpgradeableBeacon(owner, erc20Impl));
        CrossChainERC20Factory factory = new CrossChainERC20Factory(erc20Beacon);

        // Test threshold = 0
        Bridge testBridge1 = new Bridge({
            remoteBridge: remoteBridge,
            trustedRelayer: trustedRelayer,
            twinBeacon: twinBeacon,
            crossChainErc20Factory: address(factory)
        });

        vm.expectRevert(); // Library will revert with InvalidThreshold
        testBridge1.initialize({validators: validators, threshold: 0, ismOwner: owner, guardians: new address[](0)});

        // Test threshold > validator count
        Bridge testBridge2 = new Bridge({
            remoteBridge: remoteBridge,
            trustedRelayer: trustedRelayer,
            twinBeacon: twinBeacon,
            crossChainErc20Factory: address(factory)
        });

        vm.expectRevert(); // Library will revert with InvalidThreshold
        testBridge2.initialize({validators: validators, threshold: 3, ismOwner: owner, guardians: new address[](0)});
    }

    function test_constructor_revertsWithEmptyValidatorsAndNonZeroThreshold() public {
        address[] memory validators = new address[](0);

        // Deploy supporting contracts first
        Pubkey remoteBridge = Pubkey.wrap(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef);
        address twinImpl = address(new Twin(address(0)));
        address twinBeacon = address(new UpgradeableBeacon(owner, twinImpl));
        address erc20Impl = address(new CrossChainERC20(address(0)));
        address erc20Beacon = address(new UpgradeableBeacon(owner, erc20Impl));
        CrossChainERC20Factory factory = new CrossChainERC20Factory(erc20Beacon);

        Bridge testBridge3 = new Bridge({
            remoteBridge: remoteBridge,
            trustedRelayer: trustedRelayer,
            twinBeacon: twinBeacon,
            crossChainErc20Factory: address(factory)
        });

        vm.expectRevert(); // Library will revert with InvalidThreshold
        testBridge3.initialize({validators: validators, threshold: 1, ismOwner: owner, guardians: new address[](0)});
    }

    function test_constructor_revertsWithZeroAddressValidator() public {
        /// @dev Test validator zero address validation in constructor.
        address[] memory validators = new address[](2);
        validators[0] = validator1;
        validators[1] = address(0); // Zero address should trigger error

        Pubkey remoteBridge = Pubkey.wrap(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef);
        address twinImpl = address(new Twin(address(0)));
        address twinBeacon = address(new UpgradeableBeacon(owner, twinImpl));
        address erc20Impl = address(new CrossChainERC20(address(0)));
        address erc20Beacon = address(new UpgradeableBeacon(owner, erc20Impl));
        CrossChainERC20Factory factory = new CrossChainERC20Factory(erc20Beacon);

        Bridge testBridge = new Bridge({
            remoteBridge: remoteBridge,
            trustedRelayer: trustedRelayer,
            twinBeacon: twinBeacon,
            crossChainErc20Factory: address(factory)
        });

        vm.expectRevert(); // Library will revert with InvalidValidatorAddress
        testBridge.initialize({validators: validators, threshold: 1, ismOwner: owner, guardians: new address[](0)});
    }

    function test_constructor_revertsWithDuplicateValidators() public {
        /// @dev Test duplicate validator detection in constructor.
        address[] memory validators = new address[](2);
        validators[0] = validator1;
        validators[1] = validator1; // Duplicate validator should trigger error

        Pubkey remoteBridge = Pubkey.wrap(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef);
        address twinImpl = address(new Twin(address(0)));
        address twinBeacon = address(new UpgradeableBeacon(owner, twinImpl));
        address erc20Impl = address(new CrossChainERC20(address(0)));
        address erc20Beacon = address(new UpgradeableBeacon(owner, erc20Impl));
        CrossChainERC20Factory factory = new CrossChainERC20Factory(erc20Beacon);

        Bridge testBridge = new Bridge({
            remoteBridge: remoteBridge,
            trustedRelayer: trustedRelayer,
            twinBeacon: twinBeacon,
            crossChainErc20Factory: address(factory)
        });

        vm.expectRevert(); // Library will revert with ValidatorAlreadyAdded
        testBridge.initialize({validators: validators, threshold: 1, ismOwner: owner, guardians: new address[](0)});
    }

    //////////////////////////////////////////////////////////////
    ///                Validator Management Tests              ///
    //////////////////////////////////////////////////////////////

    function test_addValidator_addsValidatorCorrectly() public {
        address newValidator = makeAddr("newValidator");

        vm.prank(owner);
        bridge.addISMValidator(newValidator);

        assertTrue(bridge.isISMValidator(newValidator));
        assertEq(bridge.getISMValidatorCount(), 5); // 4 + 1
    }

    function test_addValidator_revertsIfAlreadyValidator() public {
        vm.prank(owner);
        vm.expectRevert(); // Library will revert with ValidatorAlreadyAdded
        bridge.addISMValidator(validator1);
    }

    function test_addValidator_revertsWithZeroAddress() public {
        /// @dev Test zero address validation when adding a validator.
        vm.prank(owner);
        vm.expectRevert(); // Library will revert with InvalidValidatorAddress
        bridge.addISMValidator(address(0));
    }

    function test_removeValidator_removesValidatorCorrectly() public {
        vm.prank(owner);
        bridge.removeISMValidator(validator1);

        assertFalse(bridge.isISMValidator(validator1));
        assertEq(bridge.getISMValidatorCount(), 3); // 4 - 1
    }

    function test_removeValidator_revertsIfNotValidator() public {
        vm.prank(owner);
        vm.expectRevert(); // Library will revert with ValidatorNotExisted
        bridge.removeISMValidator(nonValidator);
    }

    function test_removeValidator_revertsWithThresholdViolation() public {
        /// @dev Test threshold validation when removing a validator.
        // Current setup has 4 validators with threshold 3
        // Set threshold to 4 so removing any validator would violate it
        vm.prank(owner);
        bridge.setISMThreshold(4);

        // Try to remove a validator when it would make count < threshold
        vm.prank(owner);
        vm.expectRevert(); // Library will revert with ValidatorCountLessThanThreshold
        bridge.removeISMValidator(validator1);
    }

    //////////////////////////////////////////////////////////////
    ///                Threshold Management Tests              ///
    //////////////////////////////////////////////////////////////

    function test_setThreshold_setsCorrectThreshold() public {
        vm.prank(owner);
        bridge.setISMThreshold(3);

        assertEq(bridge.getISMThreshold(), 3);
    }

    function test_setThreshold_revertsIfZero() public {
        vm.prank(owner);
        vm.expectRevert(); // Library will revert with InvalidThreshold
        bridge.setISMThreshold(0);
    }

    function test_setThreshold_revertsIfGreaterThanValidatorCount() public {
        vm.prank(owner);
        vm.expectRevert(); // Library will revert with InvalidThreshold
        bridge.setISMThreshold(5); // Greater than 4 validators
    }

    function test_setThreshold_revertsIfNotOwner() public {
        vm.prank(nonValidator);
        vm.expectRevert();
        bridge.setISMThreshold(3);
    }

    //////////////////////////////////////////////////////////////
    ///                ISM Verification Tests                  ///
    //////////////////////////////////////////////////////////////

    function test_verifyISM_withValidSignatures() public {
        // Create message hash
        bytes32 messageHash = keccak256(abi.encode(testMessages));

        // Create signatures (threshold = 2, so we need 2 signatures)
        bytes memory signatures = _createValidSignatures(messageHash, 2);

        // Verify ISM through relayMessages - should succeed
        vm.prank(trustedRelayer);
        bridge.relayMessages(testMessages, signatures);
    }

    function test_verifyISM_withThresholdSignatures() public {
        // Set threshold to 3
        vm.prank(owner);
        bridge.setISMThreshold(3);

        bytes32 messageHash = keccak256(abi.encode(testMessages));
        bytes memory signatures = _createValidSignatures(messageHash, 3);

        // Verify ISM through relayMessages - should succeed
        vm.prank(trustedRelayer);
        bridge.relayMessages(testMessages, signatures);
    }

    function test_verifyISM_revertsWithInsufficientSignatures() public {
        bytes32 messageHash = keccak256(abi.encode(testMessages));

        // Only provide 1 signature when threshold is 2
        bytes memory signatures = _createValidSignatures(messageHash, 1);

        vm.expectRevert(); // Library will revert with InvalidSignatureLength
        vm.prank(trustedRelayer);
        bridge.relayMessages(testMessages, signatures);
    }

    function test_verifyISM_revertsWithInvalidSignature() public {
        // Create malformed signature (wrong length)
        bytes memory signatures = new bytes(64); // Should be 65 bytes per signature

        vm.expectRevert(); // Library will revert with InvalidSignatureLength
        vm.prank(trustedRelayer);
        bridge.relayMessages(testMessages, signatures);
    }

    function test_verifyISM_revertsWithNonValidatorSigner() public {
        bytes32 messageHash = keccak256(abi.encode(testMessages));

        // Create signature from non-validator
        uint256 nonValidatorKey = 0x999;
        bytes memory signatures = _createSignature(messageHash, nonValidatorKey);

        // Add a valid validator signature to meet length requirement
        bytes memory validSig = _createSignature(messageHash, VALIDATOR1_KEY);
        signatures = abi.encodePacked(signatures, validSig);

        vm.expectRevert(); // Library will revert with ISMVerificationFailed
        vm.prank(trustedRelayer);
        bridge.relayMessages(testMessages, signatures);
    }

    function test_verifyISM_revertsWithDuplicateSigners() public {
        bytes32 messageHash = keccak256(abi.encode(testMessages));

        // Create duplicate signatures from same validator
        bytes memory sig1 = _createSignature(messageHash, VALIDATOR1_KEY);
        bytes memory sig2 = _createSignature(messageHash, VALIDATOR1_KEY);
        bytes memory signatures = abi.encodePacked(sig1, sig2);

        vm.expectRevert(); // Library will revert with ISMVerificationFailed
        vm.prank(trustedRelayer);
        bridge.relayMessages(testMessages, signatures);
    }

    function test_verifyISM_revertsWithWrongMessageHash() public {
        // Create signatures for different messages
        IncomingMessage[] memory differentMessages = new IncomingMessage[](1);
        differentMessages[0] = IncomingMessage({
            nonce: 0,
            sender: Pubkey.wrap(0x9999999999999999999999999999999999999999999999999999999999999999),
            gasLimit: 999999,
            ty: MessageType.Call,
            data: hex"99999999"
        });

        bytes32 differentMessageHash = keccak256(abi.encode(differentMessages));
        bytes memory signatures = _createValidSignatures(differentMessageHash, 2);

        // Try to verify with original messages (different hash)
        vm.expectRevert(); // Library will revert with ISMVerificationFailed
        vm.prank(trustedRelayer);
        bridge.relayMessages(testMessages, signatures);
    }

    function test_verifyISM_withAscendingOrderSignatures() public {
        bytes32 messageHash = keccak256(abi.encode(testMessages));

        // Ensure signatures are in ascending order of addresses
        address[] memory sortedValidators = new address[](2);
        uint256[] memory sortedKeys = new uint256[](2);

        if (validator1 < validator2) {
            sortedValidators[0] = validator1;
            sortedValidators[1] = validator2;
            sortedKeys[0] = VALIDATOR1_KEY;
            sortedKeys[1] = VALIDATOR2_KEY;
        } else {
            sortedValidators[0] = validator2;
            sortedValidators[1] = validator1;
            sortedKeys[0] = VALIDATOR2_KEY;
            sortedKeys[1] = VALIDATOR1_KEY;
        }

        bytes memory signatures =
            abi.encodePacked(_createSignature(messageHash, sortedKeys[0]), _createSignature(messageHash, sortedKeys[1]));

        // Verify ISM through relayMessages - should succeed
        vm.prank(trustedRelayer);
        bridge.relayMessages(testMessages, signatures);
    }

    function test_verifyISM_revertsWithDescendingOrderSignatures() public {
        bytes32 messageHash = keccak256(abi.encode(testMessages));

        // Ensure signatures are in descending order (should fail)
        address[] memory sortedValidators = new address[](2);
        uint256[] memory sortedKeys = new uint256[](2);

        if (validator1 > validator2) {
            sortedValidators[0] = validator1;
            sortedValidators[1] = validator2;
            sortedKeys[0] = VALIDATOR1_KEY;
            sortedKeys[1] = VALIDATOR2_KEY;
        } else {
            sortedValidators[0] = validator2;
            sortedValidators[1] = validator1;
            sortedKeys[0] = VALIDATOR2_KEY;
            sortedKeys[1] = VALIDATOR1_KEY;
        }

        bytes memory signatures =
            abi.encodePacked(_createSignature(messageHash, sortedKeys[0]), _createSignature(messageHash, sortedKeys[1]));

        vm.expectRevert(); // Library will revert with ISMVerificationFailed
        vm.prank(trustedRelayer);
        bridge.relayMessages(testMessages, signatures);
    }

    function test_verifyISM_revertsWithInvalidSignatureOrder() public {
        bytes32 messageHash = keccak256(abi.encode(testMessages));

        // Create signatures in wrong order by deliberately choosing validators with descending addresses
        uint256 higherKey = validator1 > validator2 ? VALIDATOR1_KEY : VALIDATOR2_KEY;
        uint256 lowerKey = validator1 > validator2 ? VALIDATOR2_KEY : VALIDATOR1_KEY;

        // Create signatures with higher address first (descending order)
        bytes memory signatures =
            abi.encodePacked(_createSignature(messageHash, higherKey), _createSignature(messageHash, lowerKey));

        vm.expectRevert(); // Library will revert with ISMVerificationFailed
        vm.prank(trustedRelayer);
        bridge.relayMessages(testMessages, signatures);
    }

    //////////////////////////////////////////////////////////////
    ///                    Helper Functions                    ///
    //////////////////////////////////////////////////////////////

    function _createValidSignatures(bytes32 messageHash, uint256 numSignatures) internal pure returns (bytes memory) {
        require(numSignatures <= 4, "Too many signatures requested");

        uint256[] memory keys = new uint256[](4);
        keys[0] = VALIDATOR1_KEY;
        keys[1] = VALIDATOR2_KEY;
        keys[2] = VALIDATOR3_KEY;
        keys[3] = VALIDATOR4_KEY;

        // Sort keys by their corresponding addresses to ensure ascending order
        for (uint256 i = 0; i < keys.length - 1; i++) {
            for (uint256 j = i + 1; j < keys.length; j++) {
                if (vm.addr(keys[i]) > vm.addr(keys[j])) {
                    uint256 temp = keys[i];
                    keys[i] = keys[j];
                    keys[j] = temp;
                }
            }
        }

        bytes memory signatures = new bytes(0);
        for (uint256 i = 0; i < numSignatures; i++) {
            signatures = abi.encodePacked(signatures, _createSignature(messageHash, keys[i]));
        }

        return signatures;
    }

    function _createSignature(bytes32 messageHash, uint256 privateKey) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, messageHash);
        return abi.encodePacked(r, s, v);
    }

    function _createInvalidSignature() internal pure returns (bytes memory) {
        // Create a signature with invalid length
        return new bytes(64); // Should be 65 bytes
    }

    function _salt(bytes12 salt) private view returns (bytes32) {
        // Concat the owner (who will be the caller via vm.prank) and the salt
        bytes memory packed = abi.encodePacked(owner, salt);
        return bytes32(packed);
    }
}
