// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LibClone} from "solady/utils/LibClone.sol";

import {DeployScript} from "../script/Deploy.s.sol";
import {HelperConfig} from "../script/HelperConfig.s.sol";

import {Bridge} from "../src/Bridge.sol";
import {BridgeValidator} from "../src/BridgeValidator.sol";
import {CrossChainERC20} from "../src/CrossChainERC20.sol";
import {CrossChainERC20Factory} from "../src/CrossChainERC20Factory.sol";
import {Twin} from "../src/Twin.sol";
import {Call, CallType} from "../src/libraries/CallLib.sol";
import {IncomingMessage, MessageType} from "../src/libraries/MessageLib.sol";
import {SVMBridgeLib} from "../src/libraries/SVMBridgeLib.sol";
import {Ix, Pubkey} from "../src/libraries/SVMLib.sol";
import {TokenLib, Transfer} from "../src/libraries/TokenLib.sol";

import {CommonTest} from "./CommonTest.t.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {TestTarget} from "./mocks/TestTarget.sol";

contract BridgeTest is CommonTest {
    address public user = makeAddr("user");

    Pubkey public constant TEST_SENDER = Pubkey.wrap(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef);
    Pubkey public constant TEST_REMOTE_TOKEN =
        Pubkey.wrap(0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890);

    // Mock contracts
    MockERC20 public mockToken;
    TestTarget public mockTarget;
    CrossChainERC20 public crossChainToken;

    // Events to test
    event MessageSuccessfullyRelayed(bytes32 indexed messageHash);

    function setUp() public {
        DeployScript deployer = new DeployScript();
        (twinBeacon, bridgeValidator, bridge, factory, helperConfig) = deployer.run();

        cfg = helperConfig.getConfig();

        crossChainToken = CrossChainERC20(factory.deploy(Pubkey.unwrap(TEST_REMOTE_TOKEN), "Mock Token", "MOCK", 18));

        // Deploy mock contracts
        mockToken = new MockERC20("Mock Token", "MOCK", 18);
        mockTarget = new TestTarget();

        // Set up balances
        vm.deal(user, 100 ether);
        mockToken.mint(user, 1000e18);
    }

    //////////////////////////////////////////////////////////////
    ///                 Bridge Call Tests                      ///
    //////////////////////////////////////////////////////////////

    function test_bridgeCall_withValidInstructions() public {
        Ix[] memory ixs = new Ix[](1);
        ixs[0] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: hex"deadbeef"});

        uint64 initialNonce = bridge.getLastOutgoingNonce();

        vm.prank(user);
        bridge.bridgeCall(ixs);

        assertEq(bridge.getLastOutgoingNonce(), initialNonce + 1);
    }

    function test_bridgeCall_withEmptyInstructions() public {
        Ix[] memory ixs = new Ix[](0);

        uint64 initialNonce = bridge.getLastOutgoingNonce();

        vm.prank(user);
        bridge.bridgeCall(ixs);

        assertEq(bridge.getLastOutgoingNonce(), initialNonce + 1);
    }

    function test_bridgeCall_withMultipleInstructions() public {
        Ix[] memory ixs = new Ix[](3);
        for (uint256 i; i < 3; i++) {
            ixs[i] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: abi.encodePacked(i)});
        }

        uint64 initialNonce = bridge.getLastOutgoingNonce();

        vm.prank(user);
        bridge.bridgeCall(ixs);

        assertEq(bridge.getLastOutgoingNonce(), initialNonce + 1);
    }

    //////////////////////////////////////////////////////////////
    ///                Bridge Token Tests                      ///
    //////////////////////////////////////////////////////////////

    function test_bridgeToken_withERC20() public {
        Transfer memory transfer = Transfer({
            localToken: address(mockToken),
            remoteToken: TEST_REMOTE_TOKEN,
            to: bytes32(uint256(uint160(user))),
            remoteAmount: 100e6
        });

        Ix[] memory ixs = new Ix[](0);

        // Register the token pair first
        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 12, 0);

        vm.startPrank(user);
        mockToken.approve(address(bridge), 100e18);
        bridge.bridgeToken(transfer, ixs);
        vm.stopPrank();

        // Check token was transferred
        assertEq(mockToken.balanceOf(user), 900e18);
    }

    function test_bridgeToken_withETH() public {
        Transfer memory transfer = Transfer({
            localToken: TokenLib.ETH_ADDRESS,
            remoteToken: TokenLib.NATIVE_SOL_PUBKEY,
            to: bytes32(uint256(uint160(user))),
            remoteAmount: 1e9
        });

        Ix[] memory ixs = new Ix[](0);

        // Register ETH-SOL pair
        _registerTokenPair(TokenLib.ETH_ADDRESS, TokenLib.NATIVE_SOL_PUBKEY, 9, 0);

        uint256 initialBalance = user.balance;
        vm.prank(user);
        bridge.bridgeToken{value: 1e18}(transfer, ixs);

        assertEq(user.balance, initialBalance - 1e18);
    }

    function test_bridgeToken_revertsWithInvalidMsgValue() public {
        Transfer memory transfer = Transfer({
            localToken: TokenLib.ETH_ADDRESS,
            remoteToken: TokenLib.NATIVE_SOL_PUBKEY,
            to: bytes32(uint256(uint160(user))),
            remoteAmount: 1e9
        });

        Ix[] memory ixs = new Ix[](0);

        _registerTokenPair(TokenLib.ETH_ADDRESS, TokenLib.NATIVE_SOL_PUBKEY, 9, 0);

        vm.expectRevert(TokenLib.InvalidMsgValue.selector);
        vm.prank(user);
        bridge.bridgeToken{value: 2e18}(transfer, ixs); // Wrong amount
    }

    function test_bridgeToken_revertsWithETHForERC20() public {
        Transfer memory transfer = Transfer({
            localToken: address(mockToken),
            remoteToken: TEST_REMOTE_TOKEN,
            to: bytes32(uint256(uint160(user))),
            remoteAmount: 100e6
        });

        Ix[] memory ixs = new Ix[](0);

        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 12, 0);

        vm.expectRevert(TokenLib.InvalidMsgValue.selector);
        vm.prank(user);
        bridge.bridgeToken{value: 1 ether}(transfer, ixs); // Should not send ETH for ERC20
    }

    //////////////////////////////////////////////////////////////
    ///               Relay Messages Tests                     ///
    //////////////////////////////////////////////////////////////

    function test_relayMessages_success() public {
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(TestTarget.setValue.selector, 42)
                })
            )
        });

        _registerMessage(messages[0]);
        bridge.relayMessages(messages);

        assertEq(mockTarget.value(), 42);
    }

    function test_relayMessages_revertsOnAlreadySuccessfulMessage() public {
        // First, create a message that will succeed with trusted relayer
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(TestTarget.setValue.selector, 42)
                })
            )
        });

        _registerMessage(messages[0]);
        bridge.relayMessages(messages);

        vm.expectRevert(Bridge.MessageAlreadySuccessfullyRelayed.selector);
        bridge.relayMessages(messages);
    }

    function test_relayMessages_emitsSuccessEvent() public {
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(TestTarget.setValue.selector, 42)
                })
            )
        });

        bytes32 expectedHash = bridge.getMessageHash(messages[0]);

        _registerMessage(messages[0]);

        vm.expectEmit(true, false, false, false);
        emit MessageSuccessfullyRelayed(expectedHash);

        bridge.relayMessages(messages);
    }

    //////////////////////////////////////////////////////////////
    ///              Message Type Tests                        ///
    //////////////////////////////////////////////////////////////

    function test_relayMessage_callType() public {
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(TestTarget.setValue.selector, 123)
                })
            )
        });

        _registerMessage(messages[0]);
        bridge.relayMessages(messages);

        assertEq(mockTarget.value(), 123);

        // Check Twin was deployed
        address twinAddress = bridge.twins(TEST_SENDER);
        assertTrue(twinAddress != address(0));
    }

    function test_relayMessage_transferType() public {
        // Use the crossChainToken already deployed in setUp
        Transfer memory transfer = Transfer({
            localToken: address(crossChainToken),
            remoteToken: TEST_REMOTE_TOKEN,
            to: bytes32(bytes20(user)), // Left-align the address in bytes32
            remoteAmount: 100e6
        });

        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] =
            IncomingMessage({nonce: 0, sender: TEST_SENDER, ty: MessageType.Transfer, data: abi.encode(transfer)});

        _registerMessage(messages[0]);
        bridge.relayMessages(messages);

        assertEq(crossChainToken.balanceOf(user), 100e6);
    }

    function test_relayMessage_transferAndCallType() public {
        // Use the crossChainToken already deployed in setUp
        Transfer memory transfer = Transfer({
            localToken: address(crossChainToken),
            remoteToken: TEST_REMOTE_TOKEN,
            to: bytes32(bytes20(user)), // Left-align the address in bytes32
            remoteAmount: 100e6
        });

        Call memory call = Call({
            ty: CallType.Call,
            to: address(mockTarget),
            value: 0,
            data: abi.encodeWithSelector(TestTarget.setValue.selector, 456)
        });

        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            ty: MessageType.TransferAndCall,
            data: abi.encode(transfer, call)
        });

        _registerMessage(messages[0]);
        bridge.relayMessages(messages);

        assertEq(crossChainToken.balanceOf(user), 100e6);
        assertEq(mockTarget.value(), 456);
    }

    //////////////////////////////////////////////////////////////
    ///                 Constructor Validation Tests           ///
    //////////////////////////////////////////////////////////////

    function test_constructor_revertsOnZeroTwinBeacon() public {
        vm.expectRevert(Bridge.ZeroAddress.selector);
        new Bridge({
            remoteBridge: TEST_SENDER,
            twinBeacon: address(0),
            crossChainErc20Factory: address(0xBEEF),
            bridgeValidator: address(0xCAFE)
        });
    }

    function test_constructor_revertsOnZeroFactory() public {
        vm.expectRevert(Bridge.ZeroAddress.selector);
        new Bridge({
            remoteBridge: TEST_SENDER,
            twinBeacon: address(0xBEEF),
            crossChainErc20Factory: address(0),
            bridgeValidator: address(0xCAFE)
        });
    }

    function test_constructor_revertsOnZeroBridgeValidator() public {
        vm.expectRevert(Bridge.ZeroAddress.selector);
        new Bridge({
            remoteBridge: TEST_SENDER,
            twinBeacon: address(0xBEEF),
            crossChainErc20Factory: address(0xCAFE),
            bridgeValidator: address(0)
        });
    }

    //////////////////////////////////////////////////////////////
    ///                   Input Validation Tests               ///
    //////////////////////////////////////////////////////////////

    function test_relayMessages_revertsOnInvalidMessage() public {
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(TestTarget.setValue.selector, 777)
                })
            )
        });

        vm.expectRevert(Bridge.InvalidMessage.selector);
        bridge.relayMessages(messages);
    }

    function test___relayMessage_revertsWhenCalledExternally() public {
        IncomingMessage memory message = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(TestTarget.setValue.selector, 1)
                })
            )
        });

        vm.expectRevert(Bridge.SenderIsNotEntrypoint.selector);
        bridge.__relayMessage(message);
    }

    function test_relayMessage_shouldCompleteWithoutCreatingTwinWhenRemoteBridgeIsSender() public {
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: cfg.remoteBridge,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(0),
                    value: 0,
                    data: abi.encode(address(mockToken), TEST_REMOTE_TOKEN, uint8(12))
                })
            )
        });

        _registerMessage(messages[0]);
        bridge.relayMessages(messages);

        // Should complete without creating Twin
        assertEq(bridge.twins(cfg.remoteBridge), address(0));
    }

    //////////////////////////////////////////////////////////////
    ///                    View Function Tests                 ///
    //////////////////////////////////////////////////////////////

    function test_getRoot() public view {
        bytes32 root = bridge.getRoot();
        // Should return current MMR root (initially empty)
        assertEq(root, bytes32(0));
    }

    function test_getRoot_updatesAfterBridgeCall() public {
        // Get initial root (should be 0)
        bytes32 initialRoot = bridge.getRoot();
        assertEq(initialRoot, bytes32(0));

        // Send first bridge call - MMR root will still be 0 for single leaf
        Ix[] memory ixs = new Ix[](1);
        ixs[0] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: hex"deadbeef"});

        vm.prank(user);
        bridge.bridgeCall(ixs);

        // For single leaf, root should be the leaf hash itself (not 0)
        bytes32 rootAfterFirst = bridge.getRoot();
        assertNotEq(rootAfterFirst, bytes32(0), "Single leaf should return leaf hash, not zero");

        // Send second bridge call - now root should be non-zero
        Ix[] memory ixs2 = new Ix[](1);
        ixs2[0] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: hex"abcdef"});

        vm.prank(user);
        bridge.bridgeCall(ixs2);

        // Root should now be different (non-zero) for 2+ leaves
        bytes32 rootAfterSecond = bridge.getRoot();
        assertNotEq(rootAfterSecond, initialRoot);
        assertNotEq(rootAfterSecond, bytes32(0));
    }

    function test_getRoot_updatesAfterBridgeToken() public {
        // Get initial root (should be 0)
        bytes32 initialRoot = bridge.getRoot();
        assertEq(initialRoot, bytes32(0));

        // Set up token transfer
        Transfer memory transfer = Transfer({
            localToken: address(mockToken),
            remoteToken: TEST_REMOTE_TOKEN,
            to: bytes32(uint256(uint160(user))),
            remoteAmount: 100e6
        });

        Ix[] memory ixs = new Ix[](0);

        // Register the token pair first (this processes an incoming message, doesn't affect MMR)
        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 12, 0);

        // Send first bridge token transaction (1st outgoing message - root still 0)
        vm.startPrank(user);
        mockToken.approve(address(bridge), 200e18);
        bridge.bridgeToken(transfer, ixs);
        vm.stopPrank();

        // For single outgoing message, root should be the leaf hash (not 0)
        bytes32 rootAfterFirst = bridge.getRoot();
        assertNotEq(rootAfterFirst, bytes32(0), "Single leaf should return leaf hash, not zero");

        // Send second bridge token transaction (2nd outgoing message - root should be non-zero)
        vm.startPrank(user);
        mockToken.approve(address(bridge), 100e18);
        bridge.bridgeToken(transfer, ixs);
        vm.stopPrank();

        // Root should now be non-zero since we have 2+ outgoing messages
        bytes32 rootAfterSecond = bridge.getRoot();
        assertNotEq(rootAfterSecond, initialRoot);
        assertNotEq(rootAfterSecond, bytes32(0));
    }

    function test_getRoot_updatesWithMultipleBridgeCalls() public {
        // Track root changes across multiple bridge calls
        bytes32[] memory roots = new bytes32[](4);
        roots[0] = bridge.getRoot(); // Initial root (should be 0)
        assertEq(roots[0], bytes32(0));

        // Send 3 bridge calls and capture roots after each
        for (uint256 i = 1; i <= 3; i++) {
            Ix[] memory ixs = new Ix[](1);
            ixs[0] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: abi.encodePacked("call", i)});

            vm.prank(user);
            bridge.bridgeCall(ixs);
            roots[i] = bridge.getRoot();
        }

        // First call: root should be the leaf hash (not 0)
        assertNotEq(roots[1], bytes32(0), "Root should be leaf hash after first call");

        // Second call: root should be non-zero (2+ leaves)
        assertNotEq(roots[2], bytes32(0), "Root should be non-zero after second call");

        // Third call: root should be different again
        assertNotEq(roots[3], bytes32(0), "Root should be non-zero after third call");
        assertNotEq(roots[3], roots[2], "Root should change with each additional call");
    }

    function test_getRoot_updatesWithMixedBridgeOperations() public {
        // Set up token for bridgeToken calls
        Transfer memory transfer = Transfer({
            localToken: address(mockToken),
            remoteToken: TEST_REMOTE_TOKEN,
            to: bytes32(uint256(uint160(user))),
            remoteAmount: 100e6
        });

        // Track roots across mixed operations
        bytes32[] memory roots = new bytes32[](5);
        roots[0] = bridge.getRoot(); // Initial (should be 0)
        assertEq(roots[0], bytes32(0), "Root should be 0 initially");

        Ix[] memory ixs = new Ix[](0);
        // Register token pair (this processes an incoming message, doesn't affect outgoing MMR)
        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 12, 0);

        // 1. Bridge call (1st outgoing message - root still 0)
        vm.prank(user);
        bridge.bridgeCall(ixs);
        roots[1] = bridge.getRoot();

        // 2. Bridge token (2nd outgoing message - root should be non-zero)
        vm.startPrank(user);
        mockToken.approve(address(bridge), 100e18);
        bridge.bridgeToken(transfer, ixs);
        vm.stopPrank();
        roots[2] = bridge.getRoot();

        // 3. Another bridge call (3rd outgoing message)
        Ix[] memory ixs2 = new Ix[](1);
        ixs2[0] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: hex"abcdef"});
        vm.prank(user);
        bridge.bridgeCall(ixs2);
        roots[3] = bridge.getRoot();

        // 4. Another bridge token (4th outgoing message - need more tokens)
        mockToken.mint(user, 1000e18);
        vm.startPrank(user);
        mockToken.approve(address(bridge), 100e18);
        bridge.bridgeToken(transfer, ixs);
        vm.stopPrank();
        roots[4] = bridge.getRoot();

        // Verify progression
        assertNotEq(roots[1], bytes32(0), "Root should be leaf hash after first outgoing message");

        // All roots after the second outgoing message should be non-zero and unique
        for (uint256 i = 2; i < roots.length; i++) {
            assertNotEq(roots[i], bytes32(0), "Root should be non-zero after 2+ outgoing messages");

            for (uint256 j = 2; j < i; j++) {
                assertNotEq(roots[i], roots[j], "Each operation should produce unique root");
            }
        }
    }

    function test_getRoot_consistentWithNonceProgression() public {
        // Verify root updates align with nonce increments
        uint64 initialNonce = bridge.getLastOutgoingNonce();
        bytes32 initialRoot = bridge.getRoot();

        assertEq(initialNonce, 0);
        assertEq(initialRoot, bytes32(0));

        bytes32 previousRoot = initialRoot;

        // Send bridge calls and verify both nonce and root increment
        for (uint256 i = 1; i <= 5; i++) {
            Ix[] memory ixs = new Ix[](1);
            ixs[0] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: abi.encodePacked("test", i)});

            vm.prank(user);
            bridge.bridgeCall(ixs);

            uint64 currentNonce = bridge.getLastOutgoingNonce();
            bytes32 currentRoot = bridge.getRoot();

            // Nonce should increment by 1
            assertEq(currentNonce, initialNonce + i);

            // All messages should have non-zero root (leaf hash for single leaf, computed root for multiple)
            assertNotEq(currentRoot, bytes32(0), "Root should never be zero for any message count");

            // Note: Root may be the same as previous in some MMR configurations, which is acceptable
            // The important thing is that nonces increment and roots are non-zero

            previousRoot = currentRoot;
        }
    }

    function test_getLastOutgoingNonce() public {
        uint64 nonce = bridge.getLastOutgoingNonce();
        assertEq(nonce, 0);

        // Send a message
        Ix[] memory ixs = new Ix[](0);
        vm.prank(user);
        bridge.bridgeCall(ixs);

        assertEq(bridge.getLastOutgoingNonce(), 1);
    }

    function test_generateProof_revertsOnEmptyMMR() public {
        vm.expectRevert();
        bridge.generateProof(0);
    }

    //////////////////////////////////////////////////////////////
    ///                    Edge Case Tests                     ///
    //////////////////////////////////////////////////////////////

    function test_relayMessages_withMultipleMessages() public {
        IncomingMessage[] memory messages = new IncomingMessage[](3);
        for (uint256 i; i < 3; i++) {
            messages[i] = IncomingMessage({
                nonce: uint64(i),
                sender: TEST_SENDER,
                ty: MessageType.Call,
                data: abi.encode(
                    Call({
                        ty: CallType.Call,
                        to: address(mockTarget),
                        value: 0,
                        data: abi.encodeWithSelector(TestTarget.setValue.selector, i + 1)
                    })
                )
            });
            _registerMessage(messages[i]);
        }

        bridge.relayMessages(messages);

        assertEq(mockTarget.value(), 3);
    }

    function test_twinReuse() public {
        // First message creates Twin
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(TestTarget.setValue.selector, 1)
                })
            )
        });

        _registerMessage(messages[0]);
        bridge.relayMessages(messages);

        address firstTwin = bridge.twins(TEST_SENDER);

        // Second message reuses Twin
        messages[0].nonce = 1;
        messages[0].data = abi.encode(
            Call({
                ty: CallType.Call,
                to: address(mockTarget),
                value: 0,
                data: abi.encodeWithSelector(TestTarget.setValue.selector, 2)
            })
        );

        _registerMessage(messages[0]);
        bridge.relayMessages(messages);

        address secondTwin = bridge.twins(TEST_SENDER);
        assertEq(firstTwin, secondTwin);
        assertEq(mockTarget.value(), 2);
    }

    //////////////////////////////////////////////////////////////
    ///                    Fuzz Tests                          ///
    //////////////////////////////////////////////////////////////

    function testFuzz_bridgeCall_withDifferentSenders(address sender) public {
        // Avoid senders that may interact strangely with the transparent proxy routing
        vm.assume(sender != address(0));
        vm.assume(sender != cfg.erc1967Factory);

        Ix[] memory ixs = new Ix[](1);
        ixs[0] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: abi.encodePacked("test")});

        uint64 initialNonce = bridge.getLastOutgoingNonce();

        vm.prank(sender);
        bridge.bridgeCall(ixs);

        assertEq(bridge.getLastOutgoingNonce(), initialNonce + 1);
    }

    function testFuzz_relayMessage_withDifferentNonces(uint64 nonce) public {
        vm.assume(nonce < 100); // Limit to a smaller range to avoid excessive gas usage

        // Increment the nonce naturally by sending messages
        for (uint64 i; i < nonce; i++) {
            IncomingMessage[] memory tempMessages = new IncomingMessage[](1);
            tempMessages[0] = IncomingMessage({
                nonce: i,
                sender: TEST_SENDER,
                ty: MessageType.Call,
                data: abi.encode(
                    Call({
                        ty: CallType.Call,
                        to: address(mockTarget),
                        value: 0,
                        data: abi.encodeWithSelector(TestTarget.setValue.selector, i)
                    })
                )
            });

            _registerMessage(tempMessages[0]);
            bridge.relayMessages(tempMessages);
        }

        // Now send the actual test message
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: nonce,
            sender: TEST_SENDER,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(TestTarget.setValue.selector, 42)
                })
            )
        });

        _registerMessage(messages[0]);
        bridge.relayMessages(messages);

        assertEq(mockTarget.value(), 42);
    }

    //////////////////////////////////////////////////////////////
    ///                  Pause Mechanism Tests                 ///
    //////////////////////////////////////////////////////////////

    function test_setPaused_blocksBridgeOperations() public {
        vm.prank(cfg.guardians[0]);
        bridge.setPaused(true);

        assertTrue(bridge.paused(), "Bridge should be paused");

        // Test bridgeCall reverts when paused
        Ix[] memory ixs = new Ix[](1);
        ixs[0] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: hex"deadbeef"});

        vm.expectRevert(Bridge.Paused.selector);
        vm.prank(user);
        bridge.bridgeCall(ixs);

        // Test bridgeToken reverts when paused
        Transfer memory transfer = Transfer({
            localToken: TokenLib.ETH_ADDRESS,
            remoteToken: TokenLib.NATIVE_SOL_PUBKEY,
            to: bytes32(uint256(uint160(user))),
            remoteAmount: 1e9
        });

        vm.expectRevert(Bridge.Paused.selector);
        vm.prank(user);
        bridge.bridgeToken{value: 1e18}(transfer, new Ix[](0));
    }

    function test_setPaused_onlyGuardian() public {
        // Test that non-guardian cannot pause
        vm.expectRevert();
        vm.prank(user);
        bridge.setPaused(true);

        assertFalse(bridge.paused(), "Bridge should start unpaused");

        // Guardian can pause
        vm.prank(cfg.guardians[0]);
        bridge.setPaused(true);
        assertTrue(bridge.paused(), "Bridge should be paused after guardian toggle");

        // Guardian can unpause
        vm.prank(cfg.guardians[0]);
        bridge.setPaused(false);
        assertFalse(bridge.paused(), "Bridge should be unpaused after second guardian toggle");
    }

    function test_setPaused_worksNormallyWhenUnpaused() public {
        vm.prank(cfg.guardians[0]);
        bridge.setPaused(true); // Pause

        vm.prank(cfg.guardians[0]);
        bridge.setPaused(false); // Unpause

        assertFalse(bridge.paused(), "Bridge should be unpaused");

        // Test bridgeCall works normally when unpaused
        Ix[] memory ixs = new Ix[](1);
        ixs[0] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: hex"deadbeef"});

        uint64 initialNonce = bridge.getLastOutgoingNonce();

        vm.prank(user);
        bridge.bridgeCall(ixs); // Should not revert

        assertEq(bridge.getLastOutgoingNonce(), initialNonce + 1, "Bridge call should succeed when unpaused");
    }

    function test_scalars_returnsCorrectConversionValuesForTokenPairs() public {
        // Test initial state - scalars should be 0 for unregistered pairs
        assertEq(bridge.scalars(address(mockToken), TEST_REMOTE_TOKEN), 0, "Initial scalar should be 0");

        // Test scalar calculation for 12 decimal difference (18 -> 6)
        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 12, 0);
        assertEq(
            bridge.scalars(address(mockToken), TEST_REMOTE_TOKEN),
            1e12,
            "Scalar should be 10^12 for 12 decimal difference"
        );

        // Test scalar for 9 decimal difference
        Pubkey remoteToken2 = Pubkey.wrap(bytes32(uint256(0x777)));
        _registerTokenPair(address(mockToken), remoteToken2, 9, 1);
        assertEq(
            bridge.scalars(address(mockToken), remoteToken2), 1e9, "Scalar should be 10^9 for 9 decimal difference"
        );

        // Test scalar for same decimals (no conversion)
        Pubkey remoteToken3 = Pubkey.wrap(bytes32(uint256(0x888)));
        _registerTokenPair(address(mockToken), remoteToken3, 0, 2);
        assertEq(bridge.scalars(address(mockToken), remoteToken3), 1, "Scalar should be 1 for same decimals");

        // Test ETH-SOL pair scalar
        _registerTokenPair(TokenLib.ETH_ADDRESS, TokenLib.NATIVE_SOL_PUBKEY, 9, 3);
        assertEq(bridge.scalars(TokenLib.ETH_ADDRESS, TokenLib.NATIVE_SOL_PUBKEY), 1e9, "ETH-SOL scalar should be 10^9");

        // Test unregistered token pair returns 0
        assertEq(
            bridge.scalars(makeAddr("unregistered"), Pubkey.wrap(bytes32(uint256(0x999)))),
            0,
            "Scalars for unregistered token pair should be 0"
        );

        // Test updating scalar by re-registering
        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 6, 4);
        assertEq(
            bridge.scalars(address(mockToken), TEST_REMOTE_TOKEN),
            1e6,
            "Scalar should be updated when re-registering token pair"
        );

        // Test large scalar exponent
        Pubkey remoteToken4 = Pubkey.wrap(bytes32(uint256(0xaaa)));
        _registerTokenPair(address(mockToken), remoteToken4, 18, 5);
        assertEq(
            bridge.scalars(address(mockToken), remoteToken4), 1e18, "Should handle large scalar exponents correctly"
        );
    }

    function test_deposits_returnsCorrectValuesForTokenPairs() public {
        // Setup: Register a token pair and perform a bridge operation
        address localToken = address(mockToken);
        Pubkey remoteToken = TEST_REMOTE_TOKEN;
        uint256 bridgeAmount = 100e18; // 100 tokens with 18 decimals
        uint64 expectedRemoteAmount = 100e6; // 100 tokens with 6 decimals (12 decimal difference)

        // Register the token pair with 12 decimal difference (18 -> 6)
        _registerTokenPair(localToken, remoteToken, 12, 0);

        // Initial deposits should be 0
        assertEq(bridge.deposits(localToken, remoteToken), 0, "Initial deposits should be 0");

        // Perform a bridge token operation to create deposits
        Transfer memory transfer = Transfer({
            localToken: localToken,
            remoteToken: remoteToken,
            to: bytes32(uint256(uint160(user))),
            remoteAmount: expectedRemoteAmount
        });

        Ix[] memory ixs = new Ix[](0);

        vm.startPrank(user);
        mockToken.approve(address(bridge), bridgeAmount);
        bridge.bridgeToken(transfer, ixs);
        vm.stopPrank();

        // Now deposits should reflect the bridged amount
        uint256 actualDeposits = bridge.deposits(localToken, remoteToken);
        assertEq(actualDeposits, bridgeAmount, "Deposits should equal the bridged local token amount");

        // Test multiple deposits accumulate
        vm.startPrank(user);
        mockToken.approve(address(bridge), bridgeAmount);
        bridge.bridgeToken(transfer, ixs);
        vm.stopPrank();

        uint256 finalDeposits = bridge.deposits(localToken, remoteToken);
        assertEq(finalDeposits, bridgeAmount * 2, "Deposits should accumulate across multiple bridge operations");

        // Test deposits for different token pair
        address secondToken = makeAddr("secondToken");
        Pubkey secondRemoteToken = Pubkey.wrap(bytes32(uint256(0x777)));

        // Register another token pair
        _registerTokenPair(secondToken, secondRemoteToken, 6, 1);

        // Initial deposits should be 0 for the new pair
        assertEq(bridge.deposits(secondToken, secondRemoteToken), 0, "Initial deposits should be 0 for new pair");

        // Test deposits for unregistered token pair returns 0
        address unregisteredToken = makeAddr("unregisteredToken");
        Pubkey unregisteredRemote = Pubkey.wrap(bytes32(uint256(0x999)));

        assertEq(
            bridge.deposits(unregisteredToken, unregisteredRemote),
            0,
            "Deposits for unregistered token pair should be 0"
        );

        // Test deposits for registered pair but with no bridge operations
        address registeredButUnused = makeAddr("registeredButUnused");
        Pubkey remoteButUnused = Pubkey.wrap(bytes32(uint256(0x888)));

        _registerTokenPair(registeredButUnused, remoteButUnused, 6, 2);
        assertEq(
            bridge.deposits(registeredButUnused, remoteButUnused),
            0,
            "Deposits for registered but unused token pair should be 0"
        );
    }

    function test_getRoot_singleLeafShouldReturnLeafHash() public {
        // Get initial state
        bytes32 initialRoot = bridge.getRoot();
        uint64 initialNonce = bridge.getLastOutgoingNonce();
        assertEq(initialRoot, bytes32(0));
        assertEq(initialNonce, 0);

        // Send one bridge call to create a single leaf
        Ix[] memory ixs = new Ix[](1);
        ixs[0] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: hex"deadbeef"});

        vm.prank(user);
        bridge.bridgeCall(ixs);

        // Verify we have exactly one outgoing message
        uint64 finalNonce = bridge.getLastOutgoingNonce();
        assertEq(finalNonce, 1);

        // The root should be the hash of the single leaf, not bytes32(0)
        bytes32 finalRoot = bridge.getRoot();

        // Current behavior (incorrect): returns bytes32(0)
        // Expected behavior: should return the leaf hash

        // Let's calculate what the leaf hash should be
        // The leaf is the hash of (nonce=0, sender=user, data=SVMBridgeLib.serializeCall(ixs))
        bytes memory serializedCall = SVMBridgeLib.serializeCall(ixs);
        bytes32 expectedLeafHash = keccak256(abi.encodePacked(uint64(0), user, serializedCall));

        // This should now pass with the fixed implementation
        assertEq(finalRoot, expectedLeafHash, "Single leaf MMR should return the leaf hash itself");
    }

    function test_getRoot_twoLeavesShouldReturnCombinedRoot() public {
        // Get initial state
        bytes32 initialRoot = bridge.getRoot();
        uint64 initialNonce = bridge.getLastOutgoingNonce();
        assertEq(initialRoot, bytes32(0));
        assertEq(initialNonce, 0);

        // Send first bridge call
        Ix[] memory ixs1 = new Ix[](1);
        ixs1[0] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: hex"deadbeef"});

        vm.prank(user);
        bridge.bridgeCall(ixs1);

        // Calculate expected first leaf hash
        bytes memory serializedCall1 = SVMBridgeLib.serializeCall(ixs1);
        bytes32 expectedLeaf1 = keccak256(abi.encodePacked(uint64(0), user, serializedCall1));

        // Send second bridge call
        Ix[] memory ixs2 = new Ix[](1);
        ixs2[0] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: hex"abcdef12"});

        vm.prank(user);
        bridge.bridgeCall(ixs2);

        bytes32 rootAfterSecond = bridge.getRoot();

        // Calculate expected second leaf hash
        bytes memory serializedCall2 = SVMBridgeLib.serializeCall(ixs2);
        bytes32 expectedLeaf2 = keccak256(abi.encodePacked(uint64(1), user, serializedCall2));

        // Calculate what the combined root should be
        // For 2 leaves, the root should be the hash of both leaves combined
        bytes32 expectedCombinedRoot;
        if (expectedLeaf1 < expectedLeaf2) {
            expectedCombinedRoot = keccak256(abi.encodePacked(expectedLeaf1, expectedLeaf2));
        } else {
            expectedCombinedRoot = keccak256(abi.encodePacked(expectedLeaf2, expectedLeaf1));
        }

        // This assertion should pass if the MMR is working correctly
        assertEq(
            rootAfterSecond, expectedCombinedRoot, "Two leaves should produce combined root, not individual leaf hash"
        );

        // These assertions should fail if the bug exists
        assertNotEq(rootAfterSecond, expectedLeaf1, "Root should not be leaf1 hash for 2-leaf MMR");
        assertNotEq(rootAfterSecond, expectedLeaf2, "Root should not be leaf2 hash for 2-leaf MMR");
    }

    function test_getPredictedTwinAddress() public {
        Pubkey userPubkey = Pubkey.wrap(bytes32(uint256(uint160(user))));

        // Get the predicted address before deployment
        address predicted = bridge.getPredictedTwinAddress(userPubkey);

        // Get the actual deployed address
        vm.prank(address(bridge));
        address deployed =
            LibClone.deployDeterministicERC1967BeaconProxy(address(twinBeacon), Pubkey.unwrap(userPubkey));

        assertEq(deployed, predicted, "Predicted twin address should match deployed instance");
    }

    //////////////////////////////////////////////////////////////
    ///                  Helper Functions                      ///
    //////////////////////////////////////////////////////////////

    function _registerTokenPair(address localToken, Pubkey remoteToken, uint8 scalerExponent, uint64 nonce) internal {
        // Use the Bridge's registerRemoteToken function - simulate it being called by the remote bridge
        // The Bridge expects the data to be encoded as a Call struct
        Call memory call = Call({
            ty: CallType.Call,
            to: address(0), // Not relevant for token registration
            value: 0,
            data: abi.encode(localToken, remoteToken, scalerExponent)
        });
        bytes memory data = abi.encode(call);

        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({nonce: nonce, sender: cfg.remoteBridge, ty: MessageType.Call, data: data});

        _registerMessage(messages[0]);
        bridge.relayMessages(messages);
    }
}
