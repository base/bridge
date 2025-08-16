// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {OwnableRoles} from "solady/auth/OwnableRoles.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";
import {Initializable} from "solady/utils/Initializable.sol";

import {Bridge} from "./Bridge.sol";
import {VerificationLib} from "./libraries/VerificationLib.sol";

/// @title BridgeValidator
///
/// @notice A validator contract to be used during the Stage 0 phase of Base Bridge. This will likely later be replaced
///         by `CrossL2Inbox` from the OP Stack.
contract BridgeValidator is Initializable {
    using ECDSA for bytes32;

    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice The max allowed partner validator threshold
    uint256 public constant MAX_PARTNER_VALIDATOR_THRESHOLD = 5;

    /// @notice Guardian role bit used by the `Bridge` contract for privileged actions on this contract.
    uint256 public constant GUARDIAN_ROLE = 1 << 0;

    /// @notice Required number of signatures from bridge partner
    uint256 public immutable PARTNER_VALIDATOR_THRESHOLD;

    /// @notice Address of the Base Bridge contract. Used for authenticating guardian roles
    address public immutable BRIDGE;

    //////////////////////////////////////////////////////////////
    ///                       Storage                          ///
    //////////////////////////////////////////////////////////////

    /// @notice The next expected nonce to be received in `registerMessages`
    uint256 public nextNonce;

    /// @notice A mapping of pre-validated valid messages. Each pre-validated message corresponds to a message sent
    ///         from Solana.
    mapping(bytes32 messageHash => bool isValid) public validMessages;

    //////////////////////////////////////////////////////////////
    ///                       Events                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Emitted when a single message is registered (pre-validated) by the trusted relayer.
    ///
    /// @param messageHashes The pre-validated message hash (derived from the inner message hash and an incremental
    ///                      nonce) corresponding to an `IncomingMessage` in the `Bridge` contract.
    event MessageRegistered(bytes32 indexed messageHashes);

    /// @notice Emitted when a cross chain message is being executed.
    ///
    /// @param msgHash Hash of message payload being executed.
    event ExecutingMessage(bytes32 indexed msgHash);

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when `validatorSigs` verification fails. These are signatures from our bridge partner's
    /// validators.
    error Unauthenticated();

    /// @notice Thrown when the provided `validatorSigs` byte string length is not a multiple of 65
    error InvalidSignatureLength();

    /// @notice Thrown when the required amount of signatures is not included with a `registerMessages` call
    error ThresholdNotMet();

    /// @notice Thrown when a zero address is detected
    error ZeroAddress();

    /// @notice Thrown when the partner validator threshold is higher than number of validators
    error ThresholdTooHigh();

    /// @notice Thrown when the caller of a protected function is not a Base Bridge guardian
    error CallerNotGuardian();

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @notice Deploys the BridgeValidator contract with configuration for partner signatures and the `Bridge` address.
    ///
    /// @param partnerValidatorThreshold The number of partner (external) validator signatures required for
    ///                                  message pre-validation.
    /// @param bridge The address of the `Bridge` contract used to check guardian roles.
    ///
    /// @dev Reverts with `ThresholdTooHigh()` if `partnerValidatorThreshold` exceeds
    ///      `MAX_PARTNER_VALIDATOR_THRESHOLD`. Reverts with `ZeroAddress()` if `bridge` is the zero address.
    constructor(uint256 partnerValidatorThreshold, address bridge) {
        require(partnerValidatorThreshold <= MAX_PARTNER_VALIDATOR_THRESHOLD, ThresholdTooHigh());
        require(bridge != address(0), ZeroAddress());
        PARTNER_VALIDATOR_THRESHOLD = partnerValidatorThreshold;
        BRIDGE = bridge;
        _disableInitializers();
    }

    /// @dev Restricts function to `Bridge` guardians (as defined by `GUARDIAN_ROLE`).
    modifier isGuardian() {
        require(OwnableRoles(BRIDGE).hasAnyRole(msg.sender, GUARDIAN_ROLE), CallerNotGuardian());
        _;
    }

    /// @notice Initializes Base validator set and threshold.
    ///
    /// @dev Callable only once due to `initializer` modifier.
    ///
    /// @param baseValidators The initial list of Base validators.
    /// @param baseThreshold The minimum number of Base validator signatures required.
    function initialize(address[] calldata baseValidators, uint128 baseThreshold) external initializer {
        VerificationLib.initialize(baseValidators, baseThreshold);
    }

    /// @notice Pre-validates a batch of Solana --> Base messages.
    ///
    /// @param innerMessageHashes An array of inner message hashes to pre-validate (hash over message data excluding the
    ///                           nonce). Each is combined with a monotonically increasing nonce to form
    /// `messageHashes`.
    /// @param validatorSigs A concatenated bytes array of validator signatures. Signatures must be over the
    ///                      EIP-191 `eth_sign` digest of `abi.encode(messageHashes)` and provided in strictly
    ///                      ascending order by signer address. Must include at least `getBaseThreshold()` Base
    ///                      validator signatures and at least `PARTNER_VALIDATOR_THRESHOLD` external signatures.
    function registerMessages(bytes32[] calldata innerMessageHashes, bytes calldata validatorSigs) external {
        uint256 len = innerMessageHashes.length;
        bytes32[] memory messageHashes = new bytes32[](len);
        uint256 currentNonce = nextNonce;

        for (uint256 i; i < len; i++) {
            messageHashes[i] = keccak256(abi.encode(currentNonce++, innerMessageHashes[i]));
        }

        require(_validatorSigsAreValid({messageHashes: messageHashes, sigData: validatorSigs}), Unauthenticated());

        for (uint256 i; i < len; i++) {
            validMessages[messageHashes[i]] = true;
            emit MessageRegistered(messageHashes[i]);
        }

        nextNonce = currentNonce;
    }

    /// @notice Updates the Base signature threshold.
    ///
    /// @dev Only callable by a Bridge guardian.
    ///
    /// @param newThreshold The new threshold value.
    function setThreshold(uint256 newThreshold) external isGuardian {
        VerificationLib.setThreshold(newThreshold);
    }

    /// @notice Adds a Base validator.
    ///
    /// @dev Only callable by a Bridge guardian.
    ///
    /// @param validator The validator address to add.
    function addValidator(address validator) external isGuardian {
        VerificationLib.addValidator(validator);
    }

    /// @notice Removes a Base validator.
    ///
    /// @dev Only callable by a Bridge guardian.
    ///
    /// @param validator The validator address to remove.
    function removeValidator(address validator) external isGuardian {
        VerificationLib.removeValidator(validator);
    }

    //////////////////////////////////////////////////////////////
    ///                    Private Functions                   ///
    //////////////////////////////////////////////////////////////

    /// @dev Verifies that the provided signatures satisfy Base and partner thresholds for `messageHashes`.
    ///
    /// @param messageHashes The derived message hashes (inner hash + nonce) for the batch.
    /// @param sigData Concatenated signatures over `toEthSignedMessageHash(abi.encode(messageHashes))`.
    ///
    /// @return True if thresholds are met by valid signers with strictly ascending signer order.
    function _validatorSigsAreValid(bytes32[] memory messageHashes, bytes calldata sigData)
        private
        view
        returns (bool)
    {
        // Check that the provided signature data is a multiple of the valid sig length
        require(sigData.length % VerificationLib.SIGNATURE_LENGTH_THRESHOLD == 0, InvalidSignatureLength());

        uint256 sigCount = sigData.length / VerificationLib.SIGNATURE_LENGTH_THRESHOLD;
        address[] memory partnerValidators = new address[](0);
        bytes32 signedHash = ECDSA.toEthSignedMessageHash(abi.encode(messageHashes));
        address lastValidator = address(0);

        uint256 offset;
        assembly {
            offset := sigData.offset
        }

        uint256 baseSigners;
        uint256 externalSigners;

        for (uint256 i; i < sigCount; i++) {
            (uint8 v, bytes32 r, bytes32 s) = VerificationLib.signatureSplit(offset, i);
            address currentValidator = signedHash.recover(v, r, s);

            if (currentValidator <= lastValidator) {
                return false;
            }

            // Verify signer is valid
            if (VerificationLib.isBaseValidator(currentValidator)) {
                unchecked {
                    baseSigners++;
                }
            } else if (_addressInList(partnerValidators, currentValidator)) {
                unchecked {
                    externalSigners++;
                }
            }

            lastValidator = currentValidator;
        }

        require(baseSigners >= VerificationLib.getBaseThreshold(), ThresholdNotMet());
        require(externalSigners >= PARTNER_VALIDATOR_THRESHOLD, ThresholdNotMet());

        return true;
    }

    /// @dev Linear search for `addr` in memory array `addrs`.
    ///
    /// @return True if found, false otherwise.
    function _addressInList(address[] memory addrs, address addr) private pure returns (bool) {
        for (uint256 i; i < addrs.length; i++) {
            if (addr == addrs[i]) {
                return true;
            }
        }
        return false;
    }
}
