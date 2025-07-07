// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LibClone} from "solady/utils/LibClone.sol";
import {ReentrancyGuardTransient} from "solady/utils/ReentrancyGuardTransient.sol";
import {UpgradeableBeacon} from "solady/utils/UpgradeableBeacon.sol";

import {Call} from "./libraries/CallLib.sol";
import {IncomingMessage, MessageType} from "./libraries/MessageLib.sol";
import {MessageStorageLib} from "./libraries/MessageStorageLib.sol";
import {SVMBridgeLib} from "./libraries/SVMBridgeLib.sol";
import {Ix, Pubkey} from "./libraries/SVMLib.sol";
import {SolanaTokenType, TokenLib, Transfer} from "./libraries/TokenLib.sol";

import {ISMVerification} from "./ISMVerification.sol";
import {Twin} from "./Twin.sol";

/// @title Bridge
///
/// @notice The Bridge enables sending calls from Solana to Base.
///
/// @dev Calls sent from Solana to Base are relayed via a Twin contract that is specific per Solana sender pubkey.
contract Bridge is ReentrancyGuardTransient {
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

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when the ISM verification fails.
    error ISMVerificationFailed();

    /// @notice Thrown when doing gas estimation and the call's gas left is insufficient to cover the `minGas` plus the
    ///         `reservedGas`.
    error EstimationInsufficientGas();

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

    /// @notice Thrown when an Anchor instruction is invalid.
    error UnsafeIxTarget();

    //////////////////////////////////////////////////////////////
    ///                       Structs                          ///
    //////////////////////////////////////////////////////////////

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

    /// @notice Pubkey of the remote bridge on Solana.
    Pubkey public immutable REMOTE_BRIDGE;

    /// @notice Address of the trusted relayer.
    address public immutable TRUSTED_RELAYER;

    /// @notice Address of the Twin beacon.
    address public immutable TWIN_BEACON;

    /// @notice Address of the ISM verification contract.
    address public immutable ISM_VERIFICATION;

    /// @notice Address of the CrossChainERC20Factory.
    address public immutable CROSS_CHAIN_ERC20_FACTORY;

    /// @notice Gas required to run the execution prologue section of `__validateAndRelay`.
    ///
    /// @dev Simulated via a forge test performing a call to `relayMessages` with a single message where:
    ///      - The execution and the execution epilogue sections were commented out to isolate the execution section.
    ///      - `isTrustedRelayer` was true to estimate the worst case scenario of doing an additional SSTORE.
    ///      - The `message.data` field was 4KB large which is sufficient given that the message has to be built from a
    ///        single Solana transaction (which currently is 1232 bytes).
    ///      - The metered gas was 30,252 gas.
    ///
    uint256 private constant _EXECUTION_PROLOGUE_GAS_BUFFER = 35_000;

    /// @notice Gas required to run the execution section of `__validateAndRelay`.
    ///
    /// @dev Simulated via a forge test performing a single call to `__validateAndRelay` where:
    ///      - The execution epilogue section was commented out to isolate the execution section.
    ///      - The `message.data` field was 4KB large which is sufficient given that the message has to be built from a
    ///        single Solana transaction (which currently is 1232 bytes).
    ///      - The metered gas (including the execution prologue section) was 32,858 gas thus the isolated
    ///        execution section was 32,858 - 30,252 = 2,606 gas.
    ///      - No buffer is strictly needed as the `_EXECUTION_PROLOGUE_GAS_BUFFER` is already rounded up and above
    ///        that.
    uint256 private constant _EXECUTION_GAS_BUFFER = 3_000;

    /// @notice Gas required to run the execution epilogue section of `__validateAndRelay`.
    ///
    /// @dev Simulated via a forge test performing a single call to `__validateAndRelay` where:
    ///      - The `message.data` field was 4KB large which is sufficient given that the message has to be built from a
    ///        single Solana transaction (which currently is 1232 bytes).
    ///      - The metered gas (including the execution prologue and execution sections) was 54,481 gas thus the
    ///        isolated execution epilogue section was 54,481 - 32,858 = 21,623 gas.
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

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @notice Constructs the Bridge contract.
    ///
    /// @param remoteBridge The pubkey of the remote bridge on Solana.
    /// @param trustedRelayer The address of the trusted relayer.
    /// @param twinBeacon The address of the Twin beacon.
    /// @param ismVerification The address of the ISM verification contract.
    /// @param crossChainErc20Factory The address of the CrossChainERC20Factory.
    constructor(
        Pubkey remoteBridge,
        address trustedRelayer,
        address twinBeacon,
        address ismVerification,
        address crossChainErc20Factory
    ) {
        REMOTE_BRIDGE = remoteBridge;
        TRUSTED_RELAYER = trustedRelayer;
        TWIN_BEACON = twinBeacon;
        ISM_VERIFICATION = ismVerification;
        CROSS_CHAIN_ERC20_FACTORY = crossChainErc20Factory;
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
    function bridgeCall(Ix[] memory ixs) external {
        MessageStorageLib.sendMessage({sender: msg.sender, data: SVMBridgeLib.serializeCall(ixs)});
    }

    /// @notice Bridges a transfer with optional an optional list of instructions to the Solana bridge.
    ///
    /// @dev The `Transfer` struct MUST be in memory because the `TokenLib.initializeTransfer` function might modify the
    ///      `transfer.remoteAmount` field to account for potential transfer fees.
    ///
    /// @param transfer The token transfer to execute.
    /// @param ixs The optional Solana instructions.
    function bridgeToken(Transfer memory transfer, Ix[] memory ixs) external payable {
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
    function relayMessages(IncomingMessage[] calldata messages, bytes calldata ismData) external nonReentrant {
        bool isTrustedRelayer = msg.sender == TRUSTED_RELAYER;
        if (isTrustedRelayer) {
            ISMVerification(ISM_VERIFICATION).verifyISM({messages: messages, ismData: ismData});
        }

        for (uint256 i; i < messages.length; i++) {
            IncomingMessage calldata message = messages[i];
            this.__validateAndRelay{gas: message.gasLimit}({message: message, isTrustedRelayer: isTrustedRelayer});
        }
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
