// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {OwnableRoles} from "solady/auth/OwnableRoles.sol";
import {Initializable} from "solady/utils/Initializable.sol";
import {LibClone} from "solady/utils/LibClone.sol";
import {ReentrancyGuardTransient} from "solady/utils/ReentrancyGuardTransient.sol";

import {BridgeValidator} from "./BridgeValidator.sol";
import {Twin} from "./Twin.sol";
import {Call} from "./libraries/CallLib.sol";
import {IncomingMessage, MessageLib, MessageType} from "./libraries/MessageLib.sol";
import {MessageStorageLib} from "./libraries/MessageStorageLib.sol";
import {SVMBridgeLib} from "./libraries/SVMBridgeLib.sol";
import {Ix, Pubkey, SVMLib} from "./libraries/SVMLib.sol";
import {SolanaTokenType, TokenLib, Transfer} from "./libraries/TokenLib.sol";

/// @title Bridge
///
/// @notice Cross-chain bridge enabling bidirectional communication and token transfers between Solana and Base.
contract Bridge is ReentrancyGuardTransient, Initializable, OwnableRoles {
    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice Pubkey of the remote bridge program on Solana.
    ///
    /// @dev Used to identify messages originating directly from the Solana bridge program itself (rather than from
    ///      user Twin contracts). When a message's sender equals this pubkey, it indicates the message contains
    ///      bridge-level operations such as wrapped token registration that require special handling.
    Pubkey public immutable REMOTE_BRIDGE;

    /// @notice Address of the Twin beacon used for deploying upgradeable Twin contract proxies.
    ///
    /// @dev Each Solana user gets their own deterministic Twin contract deployed via beacon proxy using their
    ///      Solana pubkey as the salt. Twin contracts act as execution contexts for Solana users on Base,
    ///      allowing them to execute arbitrary calls and receive tokens. The beacon pattern enables
    ///      upgradeability of all Twin contract implementations simultaneously.
    address public immutable TWIN_BEACON;

    /// @notice Address of the CrossChainERC20Factory.
    ///
    /// @dev It's primarily used to check if a local token was deployed by the bridge. If so, we know we can mint /
    ///      burn. Otherwise the token interaction is a transfer.
    address public immutable CROSS_CHAIN_ERC20_FACTORY;

    /// @notice Address of the BridgeValidator contract. Messages will be pre-validated there by our oracle & bridge
    ///         partner.
    address public immutable BRIDGE_VALIDATOR;

    /// @notice Guardian Role to pause the bridge.
    uint256 public constant GUARDIAN_ROLE = 1 << 0;

    //////////////////////////////////////////////////////////////
    ///                       Storage                          ///
    //////////////////////////////////////////////////////////////

    /// @notice Mapping of message hashes to boolean values indicating successful execution. A message will only be
    ///         present in this mapping if it has successfully been executed, and therefore cannot be executed again.
    mapping(bytes32 messageHash => bool success) public successes;

    /// @notice Mapping of message hashes to boolean values indicating failed execution attempts. A message will be
    ///         present in this mapping if and only if it has failed to execute at least once. Successfully executed
    ///         messages on first attempt won't appear here.
    mapping(bytes32 messageHash => bool failure) public failures;

    /// @notice Mapping of Solana owner pubkeys to their Twin contract addresses.
    mapping(Pubkey owner => address twinAddress) public twins;

    /// @notice Whether the bridge is paused.
    bool public paused;

    //////////////////////////////////////////////////////////////
    ///                       Events                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Emitted whenever a message is successfully relayed and executed.
    ///
    /// @param submitter   The caller that executed the message
    /// @param messageHash Keccak256 hash of the message that was successfully relayed.
    event MessageSuccessfullyRelayed(address indexed submitter, bytes32 indexed messageHash);

    /// @notice Emitted whenever a message fails to be relayed.
    ///
    /// @param submitter   The caller that attempted execution of the message
    /// @param messageHash Keccak256 hash of the message that failed to be relayed.
    event FailedToRelayMessage(address indexed submitter, bytes32 indexed messageHash);

    /// @notice Emitted whenever the bridge is paused or unpaused.
    ///
    /// @param paused Whether the bridge is paused.
    event PauseSwitched(bool paused);

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when the bridge is paused.
    error Paused();

    /// @notice Thrown when `validateMessage` is called with a message hash that has not been pre-validated.
    error InvalidMessage();

    /// @notice Thrown when the sender is not the entrypoint.
    error SenderIsNotEntrypoint();

    /// @notice Thrown when a zero address is detected
    error ZeroAddress();

    /// @notice Thrown when the borsch-encoded message to bridge is too large to fit in a Solana account
    error SerializedMessageTooBig();

    //////////////////////////////////////////////////////////////
    ///                       Modifiers                        ///
    //////////////////////////////////////////////////////////////

    modifier whenNotPaused() {
        require(!paused, Paused());
        _;
    }

    modifier isValidIxs(Ix[] calldata ixs) {
        SVMLib.validateIxs(ixs);
        _;
    }

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @notice Constructs the Bridge contract.
    ///
    /// @param remoteBridge           The pubkey of the remote bridge on Solana.
    /// @param twinBeacon             The address of the Twin beacon.
    /// @param crossChainErc20Factory The address of the CrossChainERC20Factory.
    /// @param bridgeValidator        The address of the contract used to validate Bridge messages
    constructor(Pubkey remoteBridge, address twinBeacon, address crossChainErc20Factory, address bridgeValidator) {
        require(twinBeacon != address(0), ZeroAddress());
        require(crossChainErc20Factory != address(0), ZeroAddress());
        require(bridgeValidator != address(0), ZeroAddress());

        REMOTE_BRIDGE = remoteBridge;
        TWIN_BEACON = twinBeacon;
        CROSS_CHAIN_ERC20_FACTORY = crossChainErc20Factory;
        BRIDGE_VALIDATOR = bridgeValidator;

        _disableInitializers();
    }

    /// @notice Initializes the Bridge contract with an owner and guardians with bridge pausing permissions.
    ///
    /// @param owner     The owner of the Bridge contract.
    /// @param guardians An array of guardian addresses approved to pause the Bridge.
    function initialize(address owner, address[] calldata guardians) external initializer {
        require(owner != address(0), ZeroAddress());

        // Initialize ownership
        _initializeOwner(owner);

        // Initialize guardians
        for (uint256 i; i < guardians.length; i++) {
            require(guardians[i] != address(0), ZeroAddress());
            _grantRoles(guardians[i], GUARDIAN_ROLE);
        }
    }

    /// @notice Bridges a call to the Solana bridge.
    ///
    /// @param ixs The instructions to execute on Solana.
    function bridgeCall(Ix[] calldata ixs) external nonReentrant whenNotPaused isValidIxs(ixs) {
        bytes memory data = SVMBridgeLib.serializeCall(ixs);
        require(data.length <= SVMLib.MAX_SOLANA_DATA_LENGTH, SerializedMessageTooBig());
        MessageStorageLib.sendMessage({sender: msg.sender, data: data});
    }

    /// @notice Bridges a transfer with an optional list of instructions to the Solana bridge.
    ///
    /// @dev If `localToken` is a wrapped version of a Solana asset, `remoteToken` is an optional arg.
    ///      If the received `remoteToken` is bytes32(0), the bridge will override it with the correct value
    ///      automatically
    ///
    /// @param transfer The token transfer to execute.
    /// @param ixs      The optional Solana instructions.
    function bridgeToken(Transfer memory transfer, Ix[] calldata ixs)
        external
        payable
        nonReentrant
        whenNotPaused
        isValidIxs(ixs)
    {
        // IMPORTANT: The `TokenLib.initializeTransfer` function might modify the `transfer.remoteAmount` field to
        //            account for potential transfer fees.
        SolanaTokenType transferType =
            TokenLib.initializeTransfer({transfer: transfer, crossChainErc20Factory: CROSS_CHAIN_ERC20_FACTORY});

        bytes memory data = SVMBridgeLib.serializeTransfer({transfer: transfer, tokenType: transferType, ixs: ixs});
        require(data.length <= SVMLib.MAX_SOLANA_DATA_LENGTH, SerializedMessageTooBig());
        MessageStorageLib.sendMessage({sender: msg.sender, data: data});
    }

    /// @notice Relays messages sent from Solana to Base.
    ///
    /// @param messages The messages to relay.
    function relayMessages(IncomingMessage[] calldata messages) external nonReentrant whenNotPaused {
        for (uint256 i; i < messages.length; i++) {
            _validateAndRelay(messages[i]);
        }
    }

    /// @notice Relays a message sent from Solana to Base.
    ///
    /// @dev This function can only be called from `_validateAndRelay`.
    ///
    /// @param message The message to relay.
    function __relayMessage(IncomingMessage calldata message) external {
        _assertSenderIsEntrypoint();

        // Special case where the message sender is directly the Solana bridge.
        // For now this is only the case when a Wrapped Token is deployed on Solana and is being registered on Base.
        // When this happens the message is guaranteed to be a single operation that encode the parameters of the
        // `registerRemoteToken` function.
        if (message.sender == REMOTE_BRIDGE) {
            Call memory call = abi.decode(message.data, (Call));
            (address localToken, Pubkey remoteToken, uint8 scalarExponent) =
                abi.decode(call.data, (address, Pubkey, uint8));

            TokenLib.registerRemoteToken({
                localToken: localToken, remoteToken: remoteToken, scalarExponent: scalarExponent
            });
            return;
        }

        // For simple transfers, skip the twin logic.
        // This avoids the need to deploy a Twin contract for users that only want to transfer tokens.
        if (message.ty == MessageType.Transfer) {
            Transfer memory transfer = abi.decode(message.data, (Transfer));
            TokenLib.finalizeTransfer({transfer: transfer, crossChainErc20Factory: CROSS_CHAIN_ERC20_FACTORY});
            return;
        }

        // For calls, get (and deploy if needed) the Twin contract.
        address twinAddress = twins[message.sender];
        if (twinAddress == address(0)) {
            twinAddress = LibClone.deployDeterministicERC1967BeaconProxy({
                beacon: TWIN_BEACON, salt: Pubkey.unwrap(message.sender)
            });
            twins[message.sender] = twinAddress;
        }

        if (message.ty == MessageType.Call) {
            Call memory call = abi.decode(message.data, (Call));
            Twin(payable(twinAddress)).execute(call);
        } else if (message.ty == MessageType.TransferAndCall) {
            (Transfer memory transfer, Call memory call) = abi.decode(message.data, (Transfer, Call));
            TokenLib.finalizeTransfer({transfer: transfer, crossChainErc20Factory: CROSS_CHAIN_ERC20_FACTORY});
            Twin(payable(twinAddress)).execute(call);
        }
    }

    /// @notice Pauses or unpauses the bridge.
    ///
    /// @dev This function can only be called by a guardian.
    ///
    /// @param isPaused Boolean representing the desired paused status
    function setPaused(bool isPaused) external onlyRoles(GUARDIAN_ROLE) {
        paused = isPaused;
        emit PauseSwitched(isPaused);
    }

    /// @notice Get the current root of the MMR.
    ///
    /// @return The current root of the MMR.
    function getRoot() external view returns (bytes32) {
        return MessageStorageLib.getMessageStorageLibStorage().root;
    }

    /// @notice Get the next outgoing Message nonce.
    ///
    /// @return The next outgoing Message nonce.
    function getNextNonce() external view returns (uint64) {
        return MessageStorageLib.getMessageStorageLibStorage().nextNonce;
    }

    /// @notice Generates a Merkle proof for a specific leaf in the MMR.
    ///
    /// @dev This function may consume significant gas for large MMRs (O(log N) storage reads).
    ///
    /// @param leafIndex The 0-indexed position of the leaf to prove.
    ///
    /// @return proof          Array of sibling hashes for the proof.
    function generateProof(uint64 leafIndex) external view returns (bytes32[] memory proof) {
        return MessageStorageLib.generateProof(leafIndex);
    }

    /// @notice Predict the address of the Twin contract for a given Solana sender pubkey.
    ///
    /// @param sender The Solana sender's pubkey.
    ///
    /// @return The predicted address of the Twin contract for the given Solana sender pubkey.
    function getPredictedTwinAddress(Pubkey sender) external view returns (address) {
        return LibClone.predictDeterministicAddressERC1967BeaconProxy({
            beacon: TWIN_BEACON, salt: Pubkey.unwrap(sender), deployer: address(this)
        });
    }

    /// @notice Get the deposit amount for a given local token and remote token.
    ///
    /// @param localToken  The address of the local token.
    /// @param remoteToken The pubkey of the remote token.
    ///
    /// @return _ The deposit amount for the given local token and remote token.
    function deposits(address localToken, Pubkey remoteToken) external view returns (uint256) {
        return TokenLib.getTokenLibStorage().deposits[localToken][remoteToken];
    }

    /// @notice Get the scalar used to convert local token amounts to remote token amounts.
    ///
    /// @param localToken  The address of the local token.
    /// @param remoteToken The pubkey of the remote token.
    ///
    /// @return _ The scalar used to convert local token amounts to remote token amounts.
    function scalars(address localToken, Pubkey remoteToken) external view returns (uint256) {
        return TokenLib.getTokenLibStorage().scalars[localToken][remoteToken];
    }

    /// @notice Returns the message hash of a given message to be used as its ID
    ///
    /// @param message The `IncomingMessage` to retrieve the message hash for
    ///
    /// @return messageHash The hash of `message`
    function getMessageHash(IncomingMessage calldata message) public pure returns (bytes32) {
        return MessageLib.getMessageHashCd(message);
    }

    //////////////////////////////////////////////////////////////
    ///                   Internal Functions                   ///
    //////////////////////////////////////////////////////////////

    /// @inheritdoc ReentrancyGuardTransient
    function _useTransientReentrancyGuardOnlyOnMainnet() internal pure override returns (bool) {
        return false;
    }

    //////////////////////////////////////////////////////////////
    ///                    Private Functions                   ///
    //////////////////////////////////////////////////////////////

    function _validateAndRelay(IncomingMessage calldata message) private {
        bytes32 messageHash = getMessageHash(message);

        // Check that the message has not already been relayed.
        if (successes[messageHash]) {
            return;
        }

        require(BridgeValidator(BRIDGE_VALIDATOR).validMessages(messageHash), InvalidMessage());

        try this.__relayMessage{gas: message.gasLimit}(message) {
            // Register the message as successfully relayed.
            delete failures[messageHash];
            successes[messageHash] = true;
            emit MessageSuccessfullyRelayed(msg.sender, messageHash);
        } catch {
            // Register the message as failed to relay.
            failures[messageHash] = true;
            emit FailedToRelayMessage(msg.sender, messageHash);
        }
    }

    /// @notice Asserts that the caller is the entrypoint.
    function _assertSenderIsEntrypoint() private view {
        require(msg.sender == address(this), SenderIsNotEntrypoint());
    }
}
