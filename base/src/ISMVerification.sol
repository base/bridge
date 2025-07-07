// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "solady/auth/Ownable.sol";
import {IncomingMessage} from "./libraries/MessageLib.sol";

contract ISMVerification is Ownable {
    //////////////////////////////////////////////////////////////
    ///                       Events                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Emitted whenever a message is successfully relayed and executed.
    event ISMVerified();

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when the ISM verification fails.
    error ISMVerificationFailed();

    /// @notice Thrown when threshold is 0.
    error ThresholdIsZero();

    /// @notice Thrown when the signature length is invalid.
    error InvalidSignatureLength();

    /// @notice Thrown when the signer is invalid.
    error InvalidSigner();

    /// @notice Thrown when a duplicate signer is detected.
    error DuplicateSigner();

    /// @notice Thrown when the signer is not a validator.
    error SignerNotValidator();

    /// @notice Thrown when signatures are not in ascending order.
    error InvalidSignatureOrder();

    //////////////////////////////////////////////////////////////
    ///                       Storage                          ///
    //////////////////////////////////////////////////////////////

    /// @notice Mapping of validator addresses to their status
    mapping(address => bool) public validators;

    /// @notice ISM verification threshold.
    uint256 public threshold;

    /// @notice Count of validators.
    uint256 public validatorCount;

    //////////////////////////////////////////////////////////////
    ///                       Structs                          ///
    //////////////////////////////////////////////////////////////

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @notice Constructs the ISMVerification contract.
    ///
    /// @param _threshold The ISM verification threshold.
    constructor(address[] memory _validators, uint256 _threshold, address _owner) {
        require(_threshold > 0 && _threshold <= _validators.length, "Invalid threshold");

        for (uint256 i = 0; i < _validators.length; i++) {
            validators[_validators[i]] = true;
        }
        validatorCount = _validators.length;
        threshold = _threshold;
        
        _initializeOwner(_owner);
    }

    /// @notice Verifies the ISM by checking M-of-N validator signatures.
    ///
    /// @param messages The messages to be verified.
    /// @param ismData The ISM data containing concatenated signatures.
    ///
    /// @return True if the ISM is verified, false otherwise.
    function verifyISM(IncomingMessage[] memory messages, bytes calldata ismData) public view returns (bool) {
        require(threshold > 0, ThresholdIsZero());
        
        // Decode only signatures (addresses recovered from signatures)
        (bytes memory signatures) = abi.decode(ismData, (bytes));

        // Compute hash of the messages being verified
        bytes32 messageHash = keccak256(abi.encode(messages));

        // Check that the provided signature data is not too short
        require(signatures.length >= threshold * 65, InvalidSignatureLength());
        
        // There cannot be a validator with address 0
        address lastValidator = address(0);
        
        // Verify M-of-N signatures
        for (uint256 i = 0; i < threshold; i++) {
            (uint8 v, bytes32 r, bytes32 s) = signatureSplit(signatures, i);
            
            // Standard ECDSA signature recovery
            address currentValidator = ecrecover(messageHash, v, r, s);
            
            // Verify recovered address is valid
            require(currentValidator != address(0), InvalidSigner());
            
            // Check for duplicate signers
            if (currentValidator == lastValidator) {
                revert DuplicateSigner();
            }
            
            // Ensure ascending order
            if (currentValidator < lastValidator) {
                revert InvalidSignatureOrder();
            }
            
            // Verify signer is a registered validator
            require(validators[currentValidator], SignerNotValidator());
            
            lastValidator = currentValidator;
        }
        
        return true;
    }

    /**
     * @notice Splits signature bytes into v, r, s components
     * @param signatures Concatenated signatures
     * @param pos Position of signature to split (0-indexed)
     */
    function signatureSplit(bytes memory signatures, uint256 pos) 
        internal 
        pure 
        returns (uint8 v, bytes32 r, bytes32 s) 
    {
        assembly {
            let signaturePos := mul(0x41, pos)
            r := mload(add(signatures, add(signaturePos, 0x20)))
            s := mload(add(signatures, add(signaturePos, 0x40)))
            v := and(mload(add(signatures, add(signaturePos, 0x41))), 0xff)
        }
    }

    /// @notice Sets the ISM verification threshold.
    ///
    /// @param _threshold The ISM verification threshold.
    function setThreshold(uint256 _threshold) public onlyOwner {
        require(_threshold > 0 && _threshold <= validatorCount, "Invalid threshold");
        threshold = _threshold;
    }

    /**
     * @notice Add a validator to the set
     * @param validator Address to add as validator
     */
    function addValidator(address validator) external onlyOwner {
        require(!validators[validator], "Already validator");
        validators[validator] = true;
        validatorCount++;
    }

    /**
     * @notice Remove a validator from the set
     * @param validator Address to remove
     */
    function removeValidator(address validator) external onlyOwner {
        require(validators[validator], "Not a validator");
        validators[validator] = false;
        validatorCount--;
    }
}