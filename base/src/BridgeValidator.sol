// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ECDSA} from "solady/utils/ECDSA.sol";
import {Initializable} from "solady/utils/Initializable.sol";

import {IPartner} from "./interfaces/IPartner.sol";
import {MessageLib} from "./libraries/MessageLib.sol";
import {Pubkey} from "./libraries/SVMLib.sol";
import {VerificationLib} from "./libraries/VerificationLib.sol";

import {Bridge} from "./Bridge.sol";

/// @title BridgeValidator
///
/// @notice A validator contract to be used during the Stage 0 phase of Base Bridge. This will likely later be replaced
///         by `CrossL2Inbox` from the OP Stack.
contract BridgeValidator is Initializable {
    using ECDSA for bytes32;

    /// @notice Container for data used to derive a unique `messageHash` for registration.
    struct SignedMessage {
        /// @notice Hash of the inner message payload (excluding nonce and gas limits).
        bytes32 innerMessageHash;
        /// @notice SVM/Solana pubkey associated with the outgoing message for this registration.
        Pubkey outgoingMessagePubkey;
    }

    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice The max allowed partner validator threshold
    uint256 public constant MAX_PARTNER_VALIDATOR_THRESHOLD = 5;

    /// @notice Guardian role bit used by the `Bridge` contract for privileged actions on this contract.
    uint256 public constant GUARDIAN_ROLE = 1 << 0;

    /// @notice Address of the Base Bridge contract. Used for authenticating guardian roles
    address public immutable BRIDGE;

    /// @notice Address of the contract holding the partner validator set
    address public immutable PARTNER_VALIDATORS;

    /// @notice A bit to be used in bitshift operations
    uint256 private constant _BIT = 1;

    /// @notice Domain separator for validator signatures.
    bytes32 private constant _SIGNATURE_DOMAIN_SEPARATOR = keccak256("BASE_BRIDGE_VALIDATOR_V2");

    //////////////////////////////////////////////////////////////
    ///                       Storage                          ///
    //////////////////////////////////////////////////////////////

    /// @notice Required number of partner signatures
    uint256 public partnerValidatorThreshold;

    /// @notice Compatibility switch for legacy signatures on `abi.encode(messageHashes)`.
    bool public legacySignatureValidationEnabled;

    /// @notice The next expected nonce to be received in `registerMessages`
    uint256 public nextNonce;

    /// @notice A mapping of pre-validated valid messages. Each pre-validated message corresponds to a message sent
    ///         from Solana.
    mapping(bytes32 messageHash => bool isValid) public validMessages;

    //////////////////////////////////////////////////////////////
    ///                       Events                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Emitted when a single message is registered (pre-validated).
    ///
    /// @param messageHash           The pre-validated message hash (derived from the inner message hash and an
    ///                              incremental nonce) corresponding to an `IncomingMessage` in the `Bridge` contract.
    /// @param outgoingMessagePubkey The SVM/Solana pubkey associated with the outgoing message for this registration.
    event MessageRegistered(bytes32 indexed messageHash, Pubkey indexed outgoingMessagePubkey);

    /// @notice Emitted when the partner validator threshold is updated.
    ///
    /// @param oldThreshold The previous partner validator threshold.
    /// @param newThreshold The new partner validator threshold.
    event PartnerThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    /// @notice Emitted when legacy signature validation support is toggled.
    event LegacySignatureValidationStatusUpdated(bool enabled);

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when the provided `validatorSigs` byte string length is not a multiple of 65
    error InvalidSignatureLength();

    /// @notice Thrown when the required amount of Base signatures is not included with a `registerMessages` call
    error BaseThresholdNotMet();

    /// @notice Thrown when the required amount of partner signatures is not included with a `registerMessages` call
    error PartnerThresholdNotMet();

    /// @notice Thrown when a zero address is detected
    error ZeroAddress();

    /// @notice Thrown when the partner validator threshold is higher than number of validators
    error ThresholdTooHigh();

    /// @notice Thrown when the caller of a protected function is not a Base Bridge guardian
    error CallerNotGuardian();

    /// @notice Thrown when a duplicate partner validator is detected during signature verification
    error DuplicateSigner();

    /// @notice Thrown when the recovered signers are not sorted
    error UnsortedSigners();

    /// @notice Thrown when a signer is configured in both Base and partner signer sets.
    error OverlappingSignerSets();

    /// @notice Thrown when attempting to register an empty batch of messages
    error NoMessages();

    /// @notice Thrown when the Bridge is paused
    error Paused();

    //////////////////////////////////////////////////////////////
    ///                       Modifiers                        ///
    //////////////////////////////////////////////////////////////

    /// @dev Restricts function to when the Bridge is not paused
    modifier whenNotPaused() {
        require(!Bridge(BRIDGE).paused(), Paused());
        _;
    }

    /// @dev Restricts function calls to guardians from the Bridge contract.
    modifier onlyGuardian() {
        require(Bridge(BRIDGE).hasAnyRole(msg.sender, GUARDIAN_ROLE), CallerNotGuardian());
        _;
    }

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @notice Deploys the BridgeValidator contract with configuration for partner signatures and the `Bridge` address.
    ///
    /// @dev Reverts with `ZeroAddress()` if `bridge` is the zero address.
    ///
    /// @param bridgeAddress     The address of the `Bridge` contract used to check guardian roles.
    /// @param partnerValidators Address of the contract holding the partner validator set
    constructor(address bridgeAddress, address partnerValidators) {
        require(bridgeAddress != address(0), ZeroAddress());
        require(partnerValidators != address(0), ZeroAddress());

        partnerValidatorThreshold = type(uint256).max;
        legacySignatureValidationEnabled = true;
        VerificationLib.getVerificationLibStorage().threshold = type(uint128).max;

        BRIDGE = bridgeAddress;
        PARTNER_VALIDATORS = partnerValidators;
        _disableInitializers();
    }

    /// @notice Initializes Base validator set and threshold.
    ///
    /// @dev Callable only once due to `initializer` modifier.
    ///
    /// @param baseValidators The initial list of Base validators.
    /// @param baseThreshold  The minimum number of Base validator signatures required.
    /// @param partnerThreshold The minimum number of partner validator signatures required.
    function initialize(address[] calldata baseValidators, uint128 baseThreshold, uint256 partnerThreshold)
        external
        initializer
    {
        VerificationLib.initialize(baseValidators, baseThreshold);

        require(partnerThreshold <= MAX_PARTNER_VALIDATOR_THRESHOLD, ThresholdTooHigh());
        partnerValidatorThreshold = partnerThreshold;
        legacySignatureValidationEnabled = true;
    }

    /// @notice Pre-validates a batch of Solana → Base messages.
    ///
    /// @param signedMessages An array of `SignedMessage` structs. For each entry, the `messageHash` is computed as
    ///                       `MessageLib.getMessageHash(nonce, outgoingMessagePubkey, innerMessageHash)` where `nonce`
    ///                       increments monotonically from `nextNonce`.
    /// @param validatorSigs  A concatenated bytes array of signatures over the EIP-191 `eth_sign` digest of
    ///                       `abi.encode(messageHashes)`, provided in strictly ascending order by signer address.
    ///                       Must include at least `getBaseThreshold()` Base validator signatures. If
    ///                       `partnerValidatorThreshold > 0`, must also include at least `partnerValidatorThreshold`
    ///                       partner validator signatures.
    function registerMessages(SignedMessage[] calldata signedMessages, bytes calldata validatorSigs)
        external
        whenNotPaused
    {
        uint256 len = signedMessages.length;
        if (len == 0) revert NoMessages();

        bytes32[] memory messageHashes = new bytes32[](len);
        uint256 currentNonce = nextNonce;

        for (uint256 i; i < len; i++) {
            messageHashes[i] = MessageLib.getMessageHash(
                currentNonce++, signedMessages[i].outgoingMessagePubkey, signedMessages[i].innerMessageHash
            );
        }

        _validateSigs({messageHashes: messageHashes, sigData: validatorSigs});

        for (uint256 i; i < len; i++) {
            validMessages[messageHashes[i]] = true;
            emit MessageRegistered(messageHashes[i], signedMessages[i].outgoingMessagePubkey);
        }

        nextNonce = currentNonce;
    }

    /// @notice Gets the current Base signature threshold.
    ///
    /// @return The current Base signature threshold.
    function getBaseThreshold() external view returns (uint128) {
        return VerificationLib.getBaseThreshold();
    }

    /// @notice Gets the registered Base validator count
    function getBaseValidatorCount() external view returns (uint256) {
        return VerificationLib.getBaseValidatorCount();
    }

    /// @notice Returns true if `validator` is a registered Base validator address
    function isBaseValidator(address validator) external view returns (bool) {
        return VerificationLib.isBaseValidator(validator);
    }

    /// @notice Returns the domain-aware signable digest for a batch of message hashes.
    function getSignableHash(bytes32[] memory messageHashes) external view returns (bytes32) {
        return _getDomainAwareSignableHash(messageHashes);
    }

    /// @notice Enables or disables legacy signature validation.
    function setLegacySignatureValidationEnabled(bool enabled) external onlyGuardian {
        legacySignatureValidationEnabled = enabled;
        emit LegacySignatureValidationStatusUpdated(enabled);
    }

    //////////////////////////////////////////////////////////////
    ///                    Private Functions                   ///
    //////////////////////////////////////////////////////////////

    /// @dev Verifies that the provided signatures satisfy Base and partner thresholds for `messageHashes`.
    ///
    /// @param messageHashes The derived message hashes (inner hash + nonce) for the batch.
    /// @param sigData       Concatenated signatures over `toEthSignedMessageHash(abi.encode(messageHashes))`.
    function _validateSigs(bytes32[] memory messageHashes, bytes calldata sigData) private view {
        require(sigData.length % VerificationLib.SIGNATURE_LENGTH_THRESHOLD == 0, InvalidSignatureLength());

        // Primary verification path: domain-bound signatures.
        if (_isSignatureSetValid(_getDomainAwareSignableHash(messageHashes), sigData)) {
            return;
        }

        // Backward-compatible fallback for old offchain signers.
        if (legacySignatureValidationEnabled && _isSignatureSetValid(_getLegacySignableHash(messageHashes), sigData)) {
            return;
        }

        // Re-run strict checks on the primary digest so callers get specific errors.
        _assertSignatureSetValid(_getDomainAwareSignableHash(messageHashes), sigData);
    }

    function _getSignersFromSigs(bytes32 signedHash, bytes calldata sigData) private view returns (address[] memory) {
        uint256 sigCount = sigData.length / VerificationLib.SIGNATURE_LENGTH_THRESHOLD;
        address[] memory recoveredSigners = new address[](sigCount);

        uint256 offset;
        assembly {
            offset := sigData.offset
        }

        for (uint256 i; i < sigCount; i++) {
            (uint8 v, bytes32 r, bytes32 s) = VerificationLib.signatureSplit(offset, i);
            address currentValidator = signedHash.recover(v, r, s);
            recoveredSigners[i] = currentValidator;
        }

        return recoveredSigners;
    }

    function _assertSignatureSetValid(bytes32 signedHash, bytes calldata sigData) private view {
        address[] memory recoveredSigners = _getSignersFromSigs(signedHash, sigData);
        _assertSortedSigners(recoveredSigners);
        require(_countBaseSigners(recoveredSigners) >= VerificationLib.getBaseThreshold(), BaseThresholdNotMet());

        uint256 partnerValidatorThreshold_ = partnerValidatorThreshold;
        if (partnerValidatorThreshold_ > 0) {
            IPartner.Signer[] memory partnerValidators = IPartner(PARTNER_VALIDATORS).getSigners();
            if (_hasSignerSetOverlap(partnerValidators, recoveredSigners)) {
                revert OverlappingSignerSets();
            }
            require(
                _countPartnerSigners(partnerValidators, recoveredSigners) >= partnerValidatorThreshold_,
                PartnerThresholdNotMet()
            );
        }
    }

    function _isSignatureSetValid(bytes32 signedHash, bytes calldata sigData) private view returns (bool) {
        address[] memory recoveredSigners = _getSignersFromSigs(signedHash, sigData);
        if (!_areSignersStrictlySorted(recoveredSigners)) {
            return false;
        }
        if (_countBaseSigners(recoveredSigners) < VerificationLib.getBaseThreshold()) {
            return false;
        }

        uint256 partnerValidatorThreshold_ = partnerValidatorThreshold;
        if (partnerValidatorThreshold_ == 0) {
            return true;
        }

        IPartner.Signer[] memory partnerValidators = IPartner(PARTNER_VALIDATORS).getSigners();
        if (_hasSignerSetOverlap(partnerValidators, recoveredSigners)) {
            return false;
        }

        (uint256 partnerSignerCount, bool validPartnerBitmap) =
            _countPartnerSignersIfValid(partnerValidators, recoveredSigners);
        return validPartnerBitmap && partnerSignerCount >= partnerValidatorThreshold_;
    }

    function _countBaseSigners(address[] memory signers) private view returns (uint256) {
        uint256 count;

        for (uint256 i; i < signers.length; i++) {
            if (VerificationLib.isBaseValidator(signers[i])) {
                unchecked {
                    count++;
                }
            }
        }

        return count;
    }

    function _countPartnerSigners(IPartner.Signer[] memory partnerValidators, address[] memory signers)
        private
        pure
        returns (uint256)
    {
        (uint256 count, bool validPartnerBitmap) = _countPartnerSignersIfValid(partnerValidators, signers);
        if (!validPartnerBitmap) {
            revert DuplicateSigner();
        }
        return count;
    }

    function _countPartnerSignersIfValid(IPartner.Signer[] memory partnerValidators, address[] memory signers)
        private
        pure
        returns (uint256 count, bool validPartnerBitmap)
    {
        uint256 signedBitMap;

        for (uint256 i; i < signers.length; i++) {
            uint256 partnerIndex = _indexOf(partnerValidators, signers[i]);
            if (partnerIndex == partnerValidators.length) {
                continue;
            }

            if (signedBitMap & (_BIT << partnerIndex) != 0) {
                return (0, false);
            }

            signedBitMap |= _BIT << partnerIndex;
            unchecked {
                count++;
            }
        }

        return (count, true);
    }

    function _assertSortedSigners(address[] memory signers) private pure {
        require(_areSignersStrictlySorted(signers), UnsortedSigners());
    }

    function _areSignersStrictlySorted(address[] memory signers) private pure returns (bool) {
        address lastSigner = address(0);
        for (uint256 i; i < signers.length; i++) {
            if (signers[i] <= lastSigner) {
                return false;
            }
            lastSigner = signers[i];
        }
        return true;
    }

    function _hasSignerSetOverlap(IPartner.Signer[] memory partnerValidators, address[] memory signers)
        private
        view
        returns (bool)
    {
        for (uint256 i; i < signers.length; i++) {
            if (VerificationLib.isBaseValidator(signers[i]) && _indexOf(partnerValidators, signers[i]) != partnerValidators.length) {
                return true;
            }
        }
        return false;
    }

    function _getDomainAwareSignableHash(bytes32[] memory messageHashes) private view returns (bytes32) {
        return ECDSA.toEthSignedMessageHash(
            abi.encode(_SIGNATURE_DOMAIN_SEPARATOR, block.chainid, address(this), messageHashes)
        );
    }

    function _getLegacySignableHash(bytes32[] memory messageHashes) private pure returns (bytes32) {
        return ECDSA.toEthSignedMessageHash(abi.encode(messageHashes));
    }

    /// @dev Linear search for `addr` in memory array `addrs`.
    function _indexOf(IPartner.Signer[] memory addrs, address addr) private pure returns (uint256) {
        for (uint256 i; i < addrs.length; i++) {
            if (addr == addrs[i].evmAddress || addr == addrs[i].newEvmAddress) {
                return i;
            }
        }
        return addrs.length;
    }
}
