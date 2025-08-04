// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {OwnableRoles} from "solady/auth/OwnableRoles.sol";
import {Initializable} from "solady/utils/Initializable.sol";
import {LibClone} from "solady/utils/LibClone.sol";
import {ReentrancyGuardTransient} from "solady/utils/ReentrancyGuardTransient.sol";
import {UpgradeableBeacon} from "solady/utils/UpgradeableBeacon.sol";

import {Call} from "./libraries/CallLib.sol";
import {IncomingMessage, MessageType} from "./libraries/MessageLib.sol";
import {MessageStorageLib} from "./libraries/MessageStorageLib.sol";
import {SVMBridgeLib} from "./libraries/SVMBridgeLib.sol";
import {Ix, Pubkey} from "./libraries/SVMLib.sol";
import {SolanaTokenType, TokenLib, Transfer} from "./libraries/TokenLib.sol";

import {Twin} from "./Twin.sol";
import {ISMVerificationLib} from "./libraries/ISMVerificationLib.sol";

/// @title Bridge
///
/// @notice Cross-chain bridge enabling bidirectional communication and token transfers between Solana and Base.
contract Bridge is ReentrancyGuardTransient, Initializable, OwnableRoles {
    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice Special address used as the tx origin for gas estimation calls.
    ///
    /// @dev You only need to use this address if the minimum gas limit specified by the user is not actually enough to
    ///      execute the given message and you're attempting to estimate the actual necessary gas limit. We use
    ///      address(1) because it's the ecrecover precompile and therefore guaranteed to never have any code on any EVM
    ///      chain.
    address public constant ESTIMATION_ADDRESS = address(1);

    /// @notice Pubkey of the remote bridge program on Solana.
    ///
    /// @dev Used to identify messages originating directly from the Solana bridge program itself (rather than from
    ///      user Twin contracts). When a message's sender equals this pubkey, it indicates the message contains
    ///      bridge-level operations such as wrapped token registration that require special handling.
    Pubkey public immutable REMOTE_BRIDGE;

    /// @notice Address of the trusted relayer that processes new messages from Solana.
    ///
    /// @dev The trusted relayer is the primary relayer with special privileges:
    ///      - Must provide valid ISM verification data when relaying messages
    ///      - Must relay messages in sequential order (incremental nonces)
    ///      - Cannot retry messages that have already failed
    ///      Non-trusted relayers serve as backup and can only retry messages that have already
    ///      been marked as failed by the trusted relayer, without requiring ISM verification.
    address public immutable TRUSTED_RELAYER;

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

    /// @notice Guardian Role to pause the bridge.
    uint256 public constant GUARDIAN_ROLE = 1 << 0;

    /// @notice Gas required to run the execution prologue section of `__validateAndRelay`.
    ///
    /// @dev Simulated via a forge test performing a call to `relayMessages` with a single message where:
    ///      - The execution and the execution epilogue sections were commented out to isolate the execution section.
    ///      - `isTrustedRelayer` was true to estimate the worst case scenario of doing an additional SSTORE.
    ///      - The `message.data` field was 8Kb large which is the maximum size allowed for the data field of an
    ///        `OutgoingMessage` on the Solana side.
    ///      - The metered gas was 14,798 gas.
    uint256 private constant _EXECUTION_PROLOGUE_GAS_BUFFER = 20_000;

    /// @notice Gas required to run the execution section of `__validateAndRelay`.
    ///
    /// @dev Simulated via a forge test performing a single call to `__validateAndRelay` where:
    ///      - The execution epilogue section was commented out to isolate the execution section. The execution section
    ///        (body of the `__relayMessage` function) was commented out to isolate the cost of performing the public
    ///        call to `this.__relayMessage` specifically.
    ///      - The `message.data` field was 8Kb large which is the maximum size allowed for the data field of an
    ///        `OutgoingMessage` on the Solana side.
    ///      - The metered gas (including the execution prologue section) was 18,495 gas thus the isolated
    ///        execution section was 18,495 - 14,798 = 3,697 gas.
    ///      - No buffer is strictly needed as the `_EXECUTION_PROLOGUE_GAS_BUFFER` is already rounded up and above
    ///        that.
    uint256 private constant _EXECUTION_GAS_BUFFER = 5_000;

    /// @notice Gas required to run the execution epilogue section of `__validateAndRelay`.
    ///
    /// @dev Simulated via a forge test performing a single call to `__validateAndRelay` where:
    ///      - The execution section (body of the `__relayMessage` function) was commented out to isolate the cost of
    ///        performing the public call to `this.__relayMessage` and the success / failure bookkeeping specifically.
    ///      - The `message.data` field was 8kb large which is the maximum size allowed for the data field of an
    ///        `OutgoingMessage` on the Solana side.
    ///      - The metered gas (including the execution prologue and execution sections) was 40,118 gas thus the
    ///        isolated execution epilogue section was 40,118 - 18,495 = 21,623 gas.
    uint256 private constant _EXECUTION_EPILOGUE_GAS_BUFFER = 25_000;

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

    /// @notice The nonce used for the next incoming message relayed.
    uint64 public nextIncomingNonce;

    /// @notice Whether the bridge is paused.
    bool public paused;

    //////////////////////////////////////////////////////////////
    ///                       Events                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Emitted whenever a message is successfully relayed and executed.
    ///
    /// @param messageHash Keccak256 hash of the message that was successfully relayed.
    event MessageSuccessfullyRelayed(bytes32 indexed messageHash);

    /// @notice Emitted whenever a message fails to be relayed.
    ///
    /// @param messageHash Keccak256 hash of the message that failed to be relayed.
    event FailedToRelayMessage(bytes32 indexed messageHash);

    /// @notice Emitted whenever the bridge is paused or unpaused.
    ///
    /// @param paused Whether the bridge is paused.
    event PauseSwitched(bool paused);

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when the ISM verification fails.
    error ISMVerificationFailed();

    /// @notice Thrown when the call execution fails.
    error ExecutionFailed();

    /// @notice Thrown when the sender is not the entrypoint.
    error SenderIsNotEntrypoint();

    /// @notice Thrown when the nonce is not incremental.
    error NonceNotIncremental();

    /// @notice Thrown when a message has already been successfully relayed.
    error MessageAlreadySuccessfullyRelayed();

    /// @notice Thrown when a message has already failed to relay.
    error MessageAlreadyFailedToRelay();

    /// @notice Thrown when a message has not been marked as failed by the relayer but a user tries to relay it
    /// manually.
    error MessageNotAlreadyFailedToRelay();

    /// @notice Thrown when the bridge is paused.
    error Paused();

    //////////////////////////////////////////////////////////////
    ///                       Modifiers                        ///
    //////////////////////////////////////////////////////////////

    modifier whenNotPaused() {
        require(!paused, Paused());
        _;
    }

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @notice Constructs the Bridge contract.
    ///
    /// @param remoteBridge The pubkey of the remote bridge on Solana.
    /// @param trustedRelayer The address of the trusted relayer.
    /// @param twinBeacon The address of the Twin beacon.
    /// @param crossChainErc20Factory The address of the CrossChainERC20Factory.
    constructor(Pubkey remoteBridge, address trustedRelayer, address twinBeacon, address crossChainErc20Factory) {
        REMOTE_BRIDGE = remoteBridge;
        TRUSTED_RELAYER = trustedRelayer;
        TWIN_BEACON = twinBeacon;
        CROSS_CHAIN_ERC20_FACTORY = crossChainErc20Factory;

        _disableInitializers();
    }

    /// @notice Initializes the Bridge contract with ISM verification parameters.
    ///
    /// @dev This function should be called immediately after deployment when using with a proxy.
    ///      Can only be called once due to the initializer modifier.
    ///
    /// @param validators Array of validator addresses for ISM verification.
    /// @param threshold The ISM verification threshold.
    /// @param ismOwner The owner of the ISM verification system.
    /// @param guardians An array of guardian addresses approved to pause the Bridge.
    function initialize(
        address[] calldata validators,
        uint128 threshold,
        address ismOwner,
        address[] calldata guardians
    ) external initializer {
        // Initialize ownership
        _initializeOwner(ismOwner);

        // Initialize guardians
        for (uint256 i; i < guardians.length; i++) {
            _grantRoles(guardians[i], GUARDIAN_ROLE);
        }

        // Initialize ISM verification library
        ISMVerificationLib.initialize(validators, threshold);

        nextIncomingNonce = 1;
    }

    /// @notice Get the current root of the MMR.
    ///
    /// @return The current root of the MMR.
    function getRoot() external view returns (bytes32) {
        return MessageStorageLib.getMessageStorageLibStorage().root;
    }

    /// @notice Get the last outgoing Message nonce.
    ///
    /// @return The last outgoing Message nonce.
    function getLastOutgoingNonce() external view returns (uint64) {
        return MessageStorageLib.getMessageStorageLibStorage().lastOutgoingNonce;
    }

    /// @notice Generates a Merkle proof for a specific leaf in the MMR.
    ///
    /// @dev This function may consume significant gas for large MMRs (O(log N) storage reads).
    ///
    /// @param leafIndex The 0-indexed position of the leaf to prove.
    ///
    /// @return proof Array of sibling hashes for the proof.
    /// @return totalLeafCount The total number of leaves when proof was generated.
    function generateProof(uint64 leafIndex) external view returns (bytes32[] memory proof, uint64 totalLeafCount) {
        return MessageStorageLib.generateProof(leafIndex);
    }

    /// @notice Predict the address of the Twin contract for a given Solana sender pubkey.
    ///
    /// @param sender The Solana sender's pubkey.
    ///
    /// @return The predicted address of the Twin contract for the given Solana sender pubkey.
    function getPredictedTwinAddress(Pubkey sender) external view returns (address) {
        return LibClone.predictDeterministicAddressERC1967BeaconProxy({
            beacon: TWIN_BEACON,
            salt: Pubkey.unwrap(sender),
            deployer: address(this)
        });
    }

    /// @notice Get the deposit amount for a given local token and remote token.
    ///
    /// @param localToken The address of the local token.
    /// @param remoteToken The pubkey of the remote token.
    ///
    /// @return The deposit amount for the given local token and remote token.
    function deposits(address localToken, Pubkey remoteToken) external view returns (uint256) {
        return TokenLib.getTokenLibStorage().deposits[localToken][remoteToken];
    }

    /// @notice Get the scalar used to convert local token amounts to remote token amounts.
    ///
    /// @param localToken The address of the local token.
    /// @param remoteToken The pubkey of the remote token.
    ///
    /// @return The scalar used to convert local token amounts to remote token amounts.
    function scalars(address localToken, Pubkey remoteToken) external view returns (uint256) {
        return TokenLib.getTokenLibStorage().scalars[localToken][remoteToken];
    }

    /// @notice Bridges a call to the Solana bridge.
    ///
    /// @param ixs The Solana instructions.
    function bridgeCall(Ix[] memory ixs) external nonReentrant whenNotPaused {
        MessageStorageLib.sendMessage({sender: msg.sender, data: SVMBridgeLib.serializeCall(ixs)});
    }

    /// @notice Bridges a transfer with optional an optional list of instructions to the Solana bridge.
    ///
    /// @dev The `Transfer` struct MUST be in memory because the `TokenLib.initializeTransfer` function might modify the
    ///      `transfer.remoteAmount` field to account for potential transfer fees.
    ///
    /// @param transfer The token transfer to execute.
    /// @param ixs The optional Solana instructions.
    function bridgeToken(Transfer memory transfer, Ix[] memory ixs) external payable nonReentrant whenNotPaused {
        // IMPORTANT: The `TokenLib.initializeTransfer` function might modify the `transfer.remoteAmount` field to
        //            account for potential transfer fees.
        SolanaTokenType transferType =
            TokenLib.initializeTransfer({transfer: transfer, crossChainErc20Factory: CROSS_CHAIN_ERC20_FACTORY});

        // IMPORTANT: At this point the `transfer.remoteAmount` field is safe to be used for bridging.
        MessageStorageLib.sendMessage({
            sender: msg.sender,
            data: SVMBridgeLib.serializeTransfer({transfer: transfer, tokenType: transferType, ixs: ixs})
        });
    }

    /// @notice Relays messages sent from Solana to Base.
    ///
    /// @param messages The messages to relay.
    /// @param ismData Encoded ISM data used to verify the messages.
    function relayMessages(IncomingMessage[] calldata messages, bytes calldata ismData)
        external
        nonReentrant
        whenNotPaused
    {
        bool isTrustedRelayer = msg.sender == TRUSTED_RELAYER;
        if (isTrustedRelayer) {
            require(ISMVerificationLib.isApproved(messages, ismData), ISMVerificationFailed());
        }

        for (uint256 i; i < messages.length; i++) {
            IncomingMessage calldata message = messages[i];
            this.__validateAndRelay{gas: message.gasLimit}({message: message, isTrustedRelayer: isTrustedRelayer});
        }
    }

    /// @notice Pauses or unpauses the bridge.
    ///
    /// @dev This function can only be called by a guardian.
    function pauseSwitch() external onlyRoles(GUARDIAN_ROLE) {
        paused = !paused;
        emit PauseSwitched(paused);
    }

    /// @notice Validates and relays a message sent from Solana to Base.
    ///
    /// @dev This function can only be called from `relayMessages`.
    ///
    /// @param message The message to relay.
    /// @param isTrustedRelayer Whether the caller was the trusted relayer.
    function __validateAndRelay(IncomingMessage calldata message, bool isTrustedRelayer) external {
        // ==================== METERED GAS SECTION: Execution Prologue ==================== //
        _assertSenderIsEntrypoint();

        // NOTE: Intentionally not including the gas limit in the hash to allow for replays with higher gas limits.
        bytes32 messageHash = keccak256(abi.encode(message.nonce, message.sender, message.ty, message.data));

        // Check that the message has not already been relayed.
        require(!successes[messageHash], MessageAlreadySuccessfullyRelayed());

        // Check that the relay is allowed.
        if (isTrustedRelayer) {
            require(message.nonce == nextIncomingNonce, NonceNotIncremental());
            nextIncomingNonce = message.nonce + 1;

            require(!failures[messageHash], MessageAlreadyFailedToRelay());
        } else {
            require(failures[messageHash], MessageNotAlreadyFailedToRelay());
        }
        // ==================================================================================== //

        // ==================== METERED GAS SECTION: Execution & Epilogue ===================== //
        uint256 gasLimit = gasleft() - _EXECUTION_GAS_BUFFER - _EXECUTION_EPILOGUE_GAS_BUFFER;
        try this.__relayMessage{gas: gasLimit}(message) {
            // Register the message as successfully relayed.
            delete failures[messageHash];
            successes[messageHash] = true;

            emit MessageSuccessfullyRelayed(messageHash);
        } catch {
            // Register the message as failed to relay.
            failures[messageHash] = true;
            emit FailedToRelayMessage(messageHash);

            // Revert for gas estimation.
            if (tx.origin == ESTIMATION_ADDRESS) {
                revert ExecutionFailed();
            }
        }
        // ==================================================================================== //
    }

    /// @notice Relays a message sent from Solana to Base.
    ///
    /// @dev This function can only be called from `__validateAndRelay`.
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
                localToken: localToken,
                remoteToken: remoteToken,
                scalarExponent: scalarExponent
            });
            return;
        }

        // Get (and deploy if needed) the Twin contract.
        address twinAddress = twins[message.sender];
        if (twinAddress == address(0)) {
            twinAddress = LibClone.deployDeterministicERC1967BeaconProxy({
                beacon: TWIN_BEACON,
                salt: Pubkey.unwrap(message.sender)
            });
            twins[message.sender] = twinAddress;
        }

        if (message.ty == MessageType.Call) {
            Call memory call = abi.decode(message.data, (Call));
            Twin(payable(twins[message.sender])).execute(call);
        } else if (message.ty == MessageType.Transfer) {
            Transfer memory transfer = abi.decode(message.data, (Transfer));
            TokenLib.finalizeTransfer({transfer: transfer, crossChainErc20Factory: CROSS_CHAIN_ERC20_FACTORY});
        } else if (message.ty == MessageType.TransferAndCall) {
            (Transfer memory transfer, Call memory call) = abi.decode(message.data, (Transfer, Call));
            TokenLib.finalizeTransfer({transfer: transfer, crossChainErc20Factory: CROSS_CHAIN_ERC20_FACTORY});
            Twin(payable(twins[message.sender])).execute(call);
        }
    }

    /// @notice Sets the ISM verification threshold.
    ///
    /// @param newThreshold The new ISM verification threshold.
    function setISMThreshold(uint128 newThreshold) external onlyOwner {
        ISMVerificationLib.setThreshold(newThreshold);
    }

    /// @notice Add a validator to the ISM verification set.
    ///
    /// @param validator Address to add as validator.
    function addISMValidator(address validator) external onlyOwner {
        ISMVerificationLib.addValidator(validator);
    }

    /// @notice Remove a validator from the ISM verification set.
    ///
    /// @param validator Address to remove.
    function removeISMValidator(address validator) external onlyOwner {
        ISMVerificationLib.removeValidator(validator);
    }

    /// @notice Gets the current ISM verification threshold.
    ///
    /// @return The current threshold.
    function getISMThreshold() external view returns (uint128) {
        return ISMVerificationLib.getThreshold();
    }

    /// @notice Gets the current ISM validator count.
    ///
    /// @return The current validator count.
    function getISMValidatorCount() external view returns (uint128) {
        return ISMVerificationLib.getValidatorCount();
    }

    /// @notice Checks if an address is an ISM validator.
    ///
    /// @param validator The address to check.
    /// @return True if the address is a validator, false otherwise.
    function isISMValidator(address validator) external view returns (bool) {
        return ISMVerificationLib.isValidator(validator);
    }

    //////////////////////////////////////////////////////////////
    ///                       Internal Functions                ///
    //////////////////////////////////////////////////////////////

    /// @inheritdoc ReentrancyGuardTransient
    ///
    /// @dev We know Base mainnet supports transient storage.
    function _useTransientReentrancyGuardOnlyOnMainnet() internal pure override returns (bool) {
        return false;
    }

    //////////////////////////////////////////////////////////////
    ///                       Private Functions                ///
    //////////////////////////////////////////////////////////////

    /// @notice Asserts that the caller is the entrypoint.
    function _assertSenderIsEntrypoint() private view {
        require(msg.sender == address(this), SenderIsNotEntrypoint());
    }
}
