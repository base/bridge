// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DeployScript} from "../../script/Deploy.s.sol";

import {BridgeValidator} from "../../src/BridgeValidator.sol";
import {Call, CallType} from "../../src/libraries/CallLib.sol";
import {IncomingMessage, MessageType} from "../../src/libraries/MessageLib.sol";
import {Pubkey} from "../../src/libraries/SVMLib.sol";
import {RelayerOrchestrator} from "../../src/periphery/RelayerOrchestrator.sol";
import {CommonTest} from "../CommonTest.t.sol";
import {TestTarget} from "../mocks/TestTarget.sol";

contract RelayerOrchestratorTest is CommonTest {
    function setUp() public {
        DeployScript deployer = new DeployScript();
        (twinBeacon, bridgeValidator, bridge, factory, relayerOrchestrator, helperConfig,) = deployer.run();

        cfg = helperConfig.getConfig();
    }

    function test_constructor_reverts_on_zero_addresses() public {
        vm.expectRevert(RelayerOrchestrator.ZeroAddress.selector);
        new RelayerOrchestrator(address(0), address(1));

        vm.expectRevert(RelayerOrchestrator.ZeroAddress.selector);
        new RelayerOrchestrator(address(1), address(0));
    }

    function test_getters_return_constructor_args() public view {
        assertEq(relayerOrchestrator.BRIDGE(), address(bridge), "BRIDGE mismatch");
        assertEq(relayerOrchestrator.BRIDGE_VALIDATOR(), address(bridgeValidator), "BRIDGE_VALIDATOR mismatch");
    }

    function test_validateAndRelay_happyPath_executes_call_and_marks_success() public {
        // Prepare a simple target and call
        TestTarget target = new TestTarget();
        uint256 newValue = 12345;

        Call memory call_ = Call({
            ty: CallType.Call,
            to: address(target),
            value: 0,
            data: abi.encodeWithSelector(TestTarget.setValue.selector, newValue)
        });

        // Build message aligned with current BridgeValidator nonce
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE,
            nonce: uint64(bridgeValidator.nextNonce()),
            sender: Pubkey.wrap(bytes32(uint256(0x01))),
            gasLimit: GAS_LIMIT,
            ty: MessageType.Call,
            data: abi.encode(call_)
        });

        // Compute inner message hash and corresponding validator signatures
        BridgeValidator.SignedMessage[] memory signedMessages = _messageToSignedMessages(messages[0]);
        bytes memory sigs = _getValidatorSigs(signedMessages);

        // Call orchestrator
        relayerOrchestrator.validateAndRelay(signedMessages, messages, sigs);

        // Effects: target updated, success recorded, nonce incremented
        assertEq(target.value(), newValue, "call not executed");

        bytes32 msgHash = bridge.getMessageHash(messages[0]);
        assertTrue(bridge.successes(msgHash), "message not marked success");
        assertEq(bridgeValidator.nextNonce(), uint256(messages[0].nonce) + 1, "nonce not incremented");
    }
}
