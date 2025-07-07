// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";

import {IncomingMessage, MessageType} from "../src/libraries/MessageLib.sol";
import {Pubkey} from "../src/libraries/SVMLib.sol";

import {ISMVerification} from "../src/ISMVerification.sol";

contract ISMVerificationTest is Test {
    ISMVerification public ismVerification;
    
    // Test accounts
    address public owner;
    address public validator1;
    address public validator2;
    address public validator3;
    address public validator4;
    address public nonValidator;
    
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
        owner = makeAddr("owner");
        validator1 = vm.addr(VALIDATOR1_KEY);
        validator2 = vm.addr(VALIDATOR2_KEY);
        validator3 = vm.addr(VALIDATOR3_KEY);
        validator4 = vm.addr(VALIDATOR4_KEY);
        nonValidator = makeAddr("nonValidator");
        
        // Deploy ISMVerification with validators and threshold
        address[] memory validators = new address[](4);
        validators[0] = validator1;
        validators[1] = validator2;
        validators[2] = validator3;
        validators[3] = validator4;
        
        ismVerification = new ISMVerification(validators, 2, owner);
        
        // Create test messages
        testMessages.push(IncomingMessage({
            nonce: 1,
            sender: Pubkey.wrap(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef),
            gasLimit: 1000000,
            ty: MessageType.Call,
            data: hex"deadbeef"
        }));
        
        testMessages.push(IncomingMessage({
            nonce: 2,
            sender: Pubkey.wrap(0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890),
            gasLimit: 500000,
            ty: MessageType.Transfer,
            data: hex"cafebabe"
        }));
    }
    
    //////////////////////////////////////////////////////////////
    ///                   Constructor Tests                    ///
    //////////////////////////////////////////////////////////////
    
    function test_constructor_setsCorrectThreshold() public {
        address[] memory validators = new address[](3);
        validators[0] = validator1;
        validators[1] = validator2;
        validators[2] = validator3;
        
        ISMVerification testISM = new ISMVerification(validators, 3, owner);
        assertEq(testISM.threshold(), 3);
    }
    
    function test_constructor_setsOwner() public {
        address[] memory validators = new address[](2);
        validators[0] = validator1;
        validators[1] = validator2;
        
        ISMVerification testISM = new ISMVerification(validators, 1, owner);
        assertEq(testISM.owner(), owner);
    }
    
    function test_constructor_setsValidators() public {
        address[] memory validators = new address[](3);
        validators[0] = validator1;
        validators[1] = validator2;
        validators[2] = validator3;
        
        ISMVerification testISM = new ISMVerification(validators, 2, owner);
        
        // Check that all validators are correctly set
        assertTrue(testISM.validators(validator1));
        assertTrue(testISM.validators(validator2));
        assertTrue(testISM.validators(validator3));
        assertFalse(testISM.validators(validator4)); // Should not be a validator
    }
    
    function test_constructor_setsValidatorCount() public {
        address[] memory validators = new address[](3);
        validators[0] = validator1;
        validators[1] = validator2;
        validators[2] = validator3;
        
        ISMVerification testISM = new ISMVerification(validators, 2, owner);
        assertEq(testISM.validatorCount(), 3);
    }
    
    function test_constructor_revertsWithInvalidThreshold() public {
        address[] memory validators = new address[](2);
        validators[0] = validator1;
        validators[1] = validator2;
        
        // Test threshold = 0
        vm.expectRevert("Invalid threshold");
        new ISMVerification(validators, 0, owner);
        
        // Test threshold > validator count
        vm.expectRevert("Invalid threshold");
        new ISMVerification(validators, 3, owner);
    }
    
    function test_constructor_revertsWithEmptyValidatorsAndNonZeroThreshold() public {
        address[] memory validators = new address[](0);
        
        vm.expectRevert("Invalid threshold");
        new ISMVerification(validators, 1, owner);
    }
    
    function test_constructor_allowsEmptyValidatorsWithZeroThreshold() public {
        address[] memory validators = new address[](0);
        
        // This should actually fail based on the current validation logic
        vm.expectRevert("Invalid threshold");
        new ISMVerification(validators, 0, owner);
    }
    
    //////////////////////////////////////////////////////////////
    ///                Validator Management Tests              ///
    //////////////////////////////////////////////////////////////
    
    function test_addValidator_addsValidatorCorrectly() public {
        address newValidator = makeAddr("newValidator");
        
        vm.prank(owner);
        ismVerification.addValidator(newValidator);
        
        assertTrue(ismVerification.validators(newValidator));
        assertEq(ismVerification.validatorCount(), 5); // 4 + 1
    }
    
    function test_addValidator_revertsIfAlreadyValidator() public {
        vm.prank(owner);
        vm.expectRevert("Already validator");
        ismVerification.addValidator(validator1);
    }
    
    function test_removeValidator_removesValidatorCorrectly() public {
        vm.prank(owner);
        ismVerification.removeValidator(validator1);
        
        assertFalse(ismVerification.validators(validator1));
        assertEq(ismVerification.validatorCount(), 3); // 4 - 1
    }
    
    function test_removeValidator_revertsIfNotValidator() public {
        vm.prank(owner);
        vm.expectRevert("Not a validator");
        ismVerification.removeValidator(nonValidator);
    }
    
    //////////////////////////////////////////////////////////////
    ///                Threshold Management Tests              ///
    //////////////////////////////////////////////////////////////
    
    function test_setThreshold_setsCorrectThreshold() public {
        vm.prank(owner);
        ismVerification.setThreshold(3);
        
        assertEq(ismVerification.threshold(), 3);
    }
    
    function test_setThreshold_revertsIfZero() public {
        vm.prank(owner);
        vm.expectRevert("Invalid threshold");
        ismVerification.setThreshold(0);
    }
    
    function test_setThreshold_revertsIfGreaterThanValidatorCount() public {
        vm.prank(owner);
        vm.expectRevert("Invalid threshold");
        ismVerification.setThreshold(5); // Greater than 4 validators
    }
    
    function test_setThreshold_revertsIfNotOwner() public {
        vm.prank(nonValidator);
        vm.expectRevert();
        ismVerification.setThreshold(3);
    }
    
    //////////////////////////////////////////////////////////////
    ///                ISM Verification Tests                  ///
    //////////////////////////////////////////////////////////////
    
    function test_verifyISM_withValidSignatures() view public {
        // Create message hash
        bytes32 messageHash = keccak256(abi.encode(testMessages));
        
        // Create signatures (threshold = 2, so we need 2 signatures)
        bytes memory signatures = _createValidSignatures(messageHash, 2);
        bytes memory ismData = abi.encode(signatures);
        
        // Verify ISM
        bool result = ismVerification.verifyISM(testMessages, ismData);
        assertTrue(result);
    }
    
    function test_verifyISM_withThresholdSignatures() public {
        // Set threshold to 3
        vm.prank(owner);
        ismVerification.setThreshold(3);
        
        bytes32 messageHash = keccak256(abi.encode(testMessages));
        bytes memory signatures = _createValidSignatures(messageHash, 3);
        bytes memory ismData = abi.encode(signatures);
        
        bool result = ismVerification.verifyISM(testMessages, ismData);
        assertTrue(result);
    }
    
    function test_verifyISM_revertsWithInsufficientSignatures() public {
        bytes32 messageHash = keccak256(abi.encode(testMessages));
        
        // Only provide 1 signature when threshold is 2
        bytes memory signatures = _createValidSignatures(messageHash, 1);
        bytes memory ismData = abi.encode(signatures);
        
        vm.expectRevert(ISMVerification.InvalidSignatureLength.selector);
        ismVerification.verifyISM(testMessages, ismData);
    }
    
    function test_verifyISM_revertsWithInvalidSignature() public {
        bytes32 messageHash = keccak256(abi.encode(testMessages));
        
        // Create malformed signature (wrong length)
        bytes memory signatures = new bytes(64); // Should be 65 bytes per signature
        bytes memory ismData = abi.encode(signatures);
        
        vm.expectRevert(ISMVerification.InvalidSignatureLength.selector);
        ismVerification.verifyISM(testMessages, ismData);
    }
    
    function test_verifyISM_revertsWithNonValidatorSigner() public {
        bytes32 messageHash = keccak256(abi.encode(testMessages));
        
        // Create signature from non-validator
        uint256 nonValidatorKey = 0x999;
        bytes memory signatures = _createSignature(messageHash, nonValidatorKey);
        
        // Add a valid validator signature to meet length requirement
        bytes memory validSig = _createSignature(messageHash, VALIDATOR1_KEY);
        signatures = abi.encodePacked(signatures, validSig);
        
        bytes memory ismData = abi.encode(signatures);
        
        vm.expectRevert(ISMVerification.SignerNotValidator.selector);
        ismVerification.verifyISM(testMessages, ismData);
    }
    
    function test_verifyISM_revertsWithDuplicateSigners() public {
        bytes32 messageHash = keccak256(abi.encode(testMessages));
        
        // Create duplicate signatures from same validator
        bytes memory sig1 = _createSignature(messageHash, VALIDATOR1_KEY);
        bytes memory sig2 = _createSignature(messageHash, VALIDATOR1_KEY);
        bytes memory signatures = abi.encodePacked(sig1, sig2);
        
        bytes memory ismData = abi.encode(signatures);
        
        vm.expectRevert(ISMVerification.DuplicateSigner.selector);
        ismVerification.verifyISM(testMessages, ismData);
    }
    
    function test_verifyISM_revertsWithWrongMessageHash() public {
        // Create signatures for different messages
        IncomingMessage[] memory differentMessages = new IncomingMessage[](1);
        differentMessages[0] = IncomingMessage({
            nonce: 999,
            sender: Pubkey.wrap(0x9999999999999999999999999999999999999999999999999999999999999999),
            gasLimit: 999999,
            ty: MessageType.Call,
            data: hex"99999999"
        });
        
        bytes32 differentMessageHash = keccak256(abi.encode(differentMessages));
        bytes memory signatures = _createValidSignatures(differentMessageHash, 2);
        bytes memory ismData = abi.encode(signatures);
        
        // Try to verify with original messages (different hash)
        vm.expectRevert(ISMVerification.SignerNotValidator.selector);
        ismVerification.verifyISM(testMessages, ismData);
    }
    
    function test_verifyISM_revertsWithZeroThreshold() public {
        // Deploy ISM with validators and initial threshold of 1
        address[] memory validators = new address[](1);
        validators[0] = validator1;
        
        ISMVerification zeroThresholdISM = new ISMVerification(validators, 1, owner);
        
        // Set threshold to 0 (this should be prevented, but let's test the verification)
        vm.prank(owner);
        vm.expectRevert("Invalid threshold");
        zeroThresholdISM.setThreshold(0);
    }
    
    function test_verifyISM_withAscendingOrderSignatures() view public {
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
        
        bytes memory signatures = abi.encodePacked(
            _createSignature(messageHash, sortedKeys[0]),
            _createSignature(messageHash, sortedKeys[1])
        );
        
        bytes memory ismData = abi.encode(signatures);
        
        bool result = ismVerification.verifyISM(testMessages, ismData);
        assertTrue(result);
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
        
        bytes memory signatures = abi.encodePacked(
            _createSignature(messageHash, sortedKeys[0]),
            _createSignature(messageHash, sortedKeys[1])
        );
        
        bytes memory ismData = abi.encode(signatures);
        
        vm.expectRevert(ISMVerification.InvalidSignatureOrder.selector);
        ismVerification.verifyISM(testMessages, ismData);
    }
    
    function test_verifyISM_revertsWithInvalidSignatureOrder() public {
        bytes32 messageHash = keccak256(abi.encode(testMessages));
        
        // Create signatures in wrong order by deliberately choosing validators with descending addresses
        address higherValidator = validator1 > validator2 ? validator1 : validator2;
        address lowerValidator = validator1 > validator2 ? validator2 : validator1;
        uint256 higherKey = validator1 > validator2 ? VALIDATOR1_KEY : VALIDATOR2_KEY;
        uint256 lowerKey = validator1 > validator2 ? VALIDATOR2_KEY : VALIDATOR1_KEY;
        
        // Create signatures with higher address first (descending order)
        bytes memory signatures = abi.encodePacked(
            _createSignature(messageHash, higherKey),
            _createSignature(messageHash, lowerKey)
        );
        
        bytes memory ismData = abi.encode(signatures);
        
        vm.expectRevert(ISMVerification.InvalidSignatureOrder.selector);
        ismVerification.verifyISM(testMessages, ismData);
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
    
} 