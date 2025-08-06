// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {HelperConfig} from "../script/HelperConfig.s.sol";

import {Bridge} from "../src/Bridge.sol";
import {BridgeValidator} from "../src/BridgeValidator.sol";
import {CrossChainERC20Factory} from "../src/CrossChainERC20Factory.sol";
import {Twin} from "../src/Twin.sol";
import {IncomingMessage} from "../src/libraries/MessageLib.sol";

contract CommonTest is Test {
    BridgeValidator public bridgeValidator;
    Bridge public bridge;
    Twin public twinBeacon;
    CrossChainERC20Factory public factory;
    HelperConfig public helperConfig;
    HelperConfig.NetworkConfig public cfg;

    function _registerMessage(IncomingMessage memory message) internal {
        bytes32[] memory messageHashes = _messageToMessageHashes(message);
        vm.startPrank(cfg.trustedRelayer);
        bridgeValidator.registerMessages(messageHashes, _getValidatorSigs(messageHashes));
        vm.stopPrank();
    }

    function _messageToMessageHashes(IncomingMessage memory message) internal view returns (bytes32[] memory) {
        bytes32[] memory messageHashes = new bytes32[](1);
        messageHashes[0] = bridge.getMessageHash(message);
        return messageHashes;
    }

    function _getValidatorSigs(bytes32[] memory messageHashes) internal pure returns (bytes memory) {
        return _createSignature(keccak256(abi.encode(messageHashes)), 1);
    }

    function _createSignature(bytes32 messageHash, uint256 privateKey) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
}
