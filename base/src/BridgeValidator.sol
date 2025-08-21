// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {OwnableRoles} from "solady/auth/OwnableRoles.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";
import {Initializable} from "solady/utils/Initializable.sol";

import {IPartner} from "./interfaces/IPartner.sol";
import {MessageLib} from "./libraries/MessageLib.sol";
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

    /// @notice Required number of external (non-Base) signatures
    uint256 public immutable PARTNER_VALIDATOR_THRESHOLD;

    /// @notice Address of the Base Bridge contract. Used for authenticating guardian roles
    address public immutable BRIDGE;

    /// @notice Address of the contract holding the partner validator set
    address public immutable PARTNER_VALIDATORS;

    /// @notice A bit to be used in bitshift operations
    uint256 private constant _BIT = 1;

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

    /// @notice Emitted when a single message is registered (pre-validated).
    ///
    /// @param messageHash The pre-validated message hash (derived from the inner message hash and an incremental
    ///                    nonce) corresponding to an `IncomingMessage` in the `Bridge` contract.
    event MessageRegistered(bytes32 indexed messageHash);

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

    //////////////////////////////////////////////////////////////
    ///                       Modifiers                        ///
    //////////////////////////////////////////////////////////////

    /// @dev Restricts function to `Bridge` guardians (as defined by `GUARDIAN_ROLE`).
    modifier isGuardian() {
        require(OwnableRoles(BRIDGE).hasAnyRole(msg.sender, GUARDIAN_ROLE), CallerNotGuardian());
        _;
    }

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @notice Deploys the BridgeValidator contract with configuration for partner signatures and the `Bridge` address.
    ///
    /// @dev Reverts with `ThresholdTooHigh()` if `partnerThreshold` exceeds
    ///      `MAX_PARTNER_VALIDATOR_THRESHOLD`. Reverts with `ZeroAddress()` if `bridge` is the zero address.
    ///
    /// @param partnerThreshold  The number of partner (external) validator signatures required for message
    ///                          pre-validation.
    /// @param bridgeAddress     The address of the `Bridge` contract used to check guardian roles.
    /// @param partnerValidators Address of the contract holding the partner validator set
    constructor(uint256 partnerThreshold, address bridgeAddress, address partnerValidators) {
        require(partnerThreshold <= MAX_PARTNER_VALIDATOR_THRESHOLD, ThresholdTooHigh());
        require(bridgeAddress != address(0), ZeroAddress());
        require(partnerValidators != address(0), ZeroAddress());
        PARTNER_VALIDATOR_THRESHOLD = partnerThreshold;
        BRIDGE = bridgeAddress;
        PARTNER_VALIDATORS = partnerValidators;
        _disableInitializers();
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
    ///                           `messageHashes`.
    /// @param validatorSigs A concatenated bytes array of signatures over the EIP-191 `eth_sign` digest of
    ///                      `abi.encode(messageHashes)`, provided in strictly ascending order by signer address.
    ///                      Must include at least `getBaseThreshold()` Base validator signatures. The external
    ///                      signature threshold is controlled by `PARTNER_VALIDATOR_THRESHOLD`.
    function registerMessages(bytes32[] calldata innerMessageHashes, bytes calldata validatorSigs) external {
        uint256 len = innerMessageHashes.length;
        bytes32[] memory messageHashes = new bytes32[](len);
        uint256 currentNonce = nextNonce;

        for (uint256 i; i < len; i++) {
            messageHashes[i] = MessageLib.getMessageHash(currentNonce++, innerMessageHashes[i]);
        }

        _validateSigs({messageHashes: messageHashes, sigData: validatorSigs});

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
    function _validateSigs(bytes32[] memory messageHashes, bytes calldata sigData) private view {
        address[] memory recoveredSigners = _getSignersFromSigs(messageHashes, sigData);
        require(_countBaseSigners(recoveredSigners) >= VerificationLib.getBaseThreshold(), BaseThresholdNotMet());

        if (PARTNER_VALIDATOR_THRESHOLD > 0) {
            IPartner.Signer[] memory partnerValidators = IPartner(PARTNER_VALIDATORS).getSigners();
            require(
                _countPartnerSigners(partnerValidators, recoveredSigners) >= PARTNER_VALIDATOR_THRESHOLD,
                PartnerThresholdNotMet()
            );
        }
    }

    function _getSignersFromSigs(bytes32[] memory messageHashes, bytes calldata sigData)
        private
        view
        returns (address[] memory)
    {
        // Check that the provided signature data is a multiple of the valid sig length
        require(sigData.length % VerificationLib.SIGNATURE_LENGTH_THRESHOLD == 0, InvalidSignatureLength());

        uint256 sigCount = sigData.length / VerificationLib.SIGNATURE_LENGTH_THRESHOLD;
        bytes32 signedHash = ECDSA.toEthSignedMessageHash(abi.encode(messageHashes));
        address lastValidator = address(0);
        address[] memory recoveredSigners = new address[](sigCount);

        uint256 offset;
        assembly {
            offset := sigData.offset
        }

        for (uint256 i; i < sigCount; i++) {
            (uint8 v, bytes32 r, bytes32 s) = VerificationLib.signatureSplit(offset, i);
            address currentValidator = signedHash.recover(v, r, s);
            require(currentValidator > lastValidator, UnsortedSigners());
            recoveredSigners[i] = currentValidator;
            lastValidator = currentValidator;
        }

        return recoveredSigners;
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
        uint256 count;
        uint256 signedBitMap;

        for (uint256 i; i < signers.length; i++) {
            uint256 partnerIndex = _indexOf(partnerValidators, signers[i]);
            if (partnerIndex == partnerValidators.length) {
                continue;
            }

            if (signedBitMap & (_BIT << partnerIndex) != 0) {
                revert DuplicateSigner();
            }

            signedBitMap |= _BIT << partnerIndex;
            unchecked {
                count++;
            }
        }

        return count;
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
