// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";

import {HelperConfig} from "../script/HelperConfig.s.sol";

import {Bridge} from "../src/Bridge.sol";
import {BridgeValidator} from "../src/BridgeValidator.sol";
import {CrossChainERC20Factory} from "../src/CrossChainERC20Factory.sol";
import {Twin} from "../src/Twin.sol";
import {MessageLib} from "../src/libraries/MessageLib.sol";

import {IncomingMessage} from "../src/libraries/MessageLib.sol";
import {Pubkey} from "../src/libraries/SVMLib.sol";
import {RelayerOrchestrator} from "../src/periphery/RelayerOrchestrator.sol";

contract CommonTest is Test {
    uint64 public constant GAS_LIMIT = 1_000_000;
    Pubkey public constant TEST_OUTGOING_MESSAGE =
        Pubkey.wrap(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef);

    BridgeValidator public bridgeValidator;
    Bridge public bridge;
    Twin public twinBeacon;
    CrossChainERC20Factory public factory;
    RelayerOrchestrator public relayerOrchestrator;
    HelperConfig public helperConfig;
    HelperConfig.NetworkConfig public cfg;

    function _registerMessage(IncomingMessage memory message) internal {
        BridgeValidator.SignedMessage[] memory signedMessages = _messageToSignedMessages(message);
        bridgeValidator.registerMessages(signedMessages, _getValidatorSigs(signedMessages));
        vm.stopPrank();
    }

    function _messageToSignedMessages(IncomingMessage memory message)
        internal
        pure
        returns (BridgeValidator.SignedMessage[] memory)
    {
        BridgeValidator.SignedMessage[] memory signedMessages = new BridgeValidator.SignedMessage[](1);
        signedMessages[0] = BridgeValidator.SignedMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE, innerMessageHash: MessageLib.getInnerMessageHash(message)
        });
        return signedMessages;
    }

    function _getValidatorSigs(BridgeValidator.SignedMessage[] memory signedMessages)
        internal
        view
        returns (bytes memory)
    {
        bytes32[] memory messageHashes = _calculateFinalHashes(signedMessages);
        return _createSignature(abi.encode(messageHashes), 1);
    }

    function _createSignature(bytes memory message, uint256 privateKey) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, ECDSA.toEthSignedMessageHash(message));
        return abi.encodePacked(r, s, v);
    }

    function _calculateFinalHashes(BridgeValidator.SignedMessage[] memory signedMessages)
        internal
        view
        returns (bytes32[] memory)
    {
        bytes32[] memory finalHashes = new bytes32[](signedMessages.length);
        uint256 currentNonce = bridgeValidator.nextNonce();
        for (uint256 i; i < signedMessages.length; i++) {
            finalHashes[i] = keccak256(
                abi.encode(currentNonce++, signedMessages[i].outgoingMessagePubkey, signedMessages[i].innerMessageHash)
            );
        }
        return finalHashes;
    }
}
