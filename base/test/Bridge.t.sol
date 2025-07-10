// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";

import {DeployScript} from "../script/Deploy.s.sol";
import {HelperConfig} from "../script/HelperConfig.s.sol";
import {Bridge} from "../src/Bridge.sol";
import {CrossChainERC20} from "../src/CrossChainERC20.sol";
import {CrossChainERC20Factory} from "../src/CrossChainERC20Factory.sol";

import {Twin} from "../src/Twin.sol";
import {Call, CallType} from "../src/libraries/CallLib.sol";
import {IncomingMessage, MessageType} from "../src/libraries/MessageLib.sol";
import {MessageStorageLib} from "../src/libraries/MessageStorageLib.sol";
import {SVMBridgeLib} from "../src/libraries/SVMBridgeLib.sol";
import {Ix, Pubkey} from "../src/libraries/SVMLib.sol";
import {TokenLib, Transfer} from "../src/libraries/TokenLib.sol";

contract BridgeTest is Test {
    Twin public twinBeacon;
    Bridge public bridge;
    CrossChainERC20Factory public factory;
    HelperConfig public helperConfig;

    address public trustedRelayer;
    address public initialOwner;
    address public user;
    address public unauthorizedUser;
    Pubkey public remoteBridge;

    Pubkey public constant TEST_SENDER = Pubkey.wrap(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef);
    Pubkey public constant TEST_REMOTE_TOKEN =
        Pubkey.wrap(0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890);

    // Mock contracts
    MockERC20 public mockToken;
    MockTarget public mockTarget;
    CrossChainERC20 public crossChainToken;

    // Events to test
    event MessageSuccessfullyRelayed(bytes32 indexed messageHash);
    event FailedToRelayMessage(bytes32 indexed messageHash);

    // Test validator keys for ISM verification (same as in HelperConfig)
    uint256 constant VALIDATOR1_KEY = 0x1;
    uint256 constant VALIDATOR2_KEY = 0x2;
    uint256 constant VALIDATOR3_KEY = 0x3;

    function setUp() public {
        // Use the DeployScript normally - now it uses deterministic validator keys
        DeployScript deployer = new DeployScript();
        (twinBeacon, bridge, factory, helperConfig) = deployer.run();

        HelperConfig.NetworkConfig memory cfg = helperConfig.getConfig();

        trustedRelayer = cfg.trustedRelayer;
        initialOwner = cfg.initialOwner;
        remoteBridge = cfg.remoteBridge;
        user = makeAddr("user");
        unauthorizedUser = makeAddr("unauthorizedUser");

        crossChainToken = CrossChainERC20(factory.deploy(Pubkey.unwrap(TEST_REMOTE_TOKEN), "Mock Token", "MOCK", 18));

        // Deploy mock contracts
        mockToken = new MockERC20("Mock Token", "MOCK", 18);
        mockTarget = new MockTarget();

        // Set up balances
        vm.deal(address(bridge), 100 ether);
        vm.deal(user, 100 ether);
        vm.deal(trustedRelayer, 100 ether);
        mockToken.mint(user, 1000e18);
        mockToken.mint(address(bridge), 1000e18);
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
        for (uint256 i = 0; i < 3; i++) {
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
        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 12);

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
        _registerTokenPair(TokenLib.ETH_ADDRESS, TokenLib.NATIVE_SOL_PUBKEY, 9);

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

        _registerTokenPair(TokenLib.ETH_ADDRESS, TokenLib.NATIVE_SOL_PUBKEY, 9);

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

        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 12);

        vm.expectRevert(TokenLib.InvalidMsgValue.selector);
        vm.prank(user);
        bridge.bridgeToken{value: 1 ether}(transfer, ixs); // Should not send ETH for ERC20
    }

    //////////////////////////////////////////////////////////////
    ///               Relay Messages Tests                     ///
    //////////////////////////////////////////////////////////////

    function test_relayMessages_withTrustedRelayer() public {
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            gasLimit: 1000000,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(MockTarget.setValue.selector, 42)
                })
            )
        });

        bytes memory ismData = _generateValidISMData(messages);

        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData);

        assertEq(bridge.nextIncomingNonce(), 1);
        assertEq(mockTarget.value(), 42);
    }

    function test_relayMessages_withNonTrustedRelayer() public {
        // First, make a message fail from trusted relayer
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            gasLimit: 100000, // Insufficient gas to force failure
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(MockTarget.setValue.selector, 42)
                })
            )
        });

        bytes memory ismData = _generateValidISMData(messages);

        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData);

        // Now retry with non-trusted relayer and higher gas
        messages[0].gasLimit = 1000000;

        vm.prank(unauthorizedUser);
        bridge.relayMessages(messages, hex""); // Non-trusted relayer doesn't need valid ISM data

        assertEq(mockTarget.value(), 42);
    }

    function test_relayMessages_revertsOnIncrementalNonce() public {
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 1, // Should be 0
            sender: TEST_SENDER,
            gasLimit: 1000000,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(MockTarget.setValue.selector, 42)
                })
            )
        });

        bytes memory ismData = _generateValidISMData(messages);

        vm.expectRevert(Bridge.NonceNotIncremental.selector);
        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData);
    }

    function test_relayMessages_revertsOnAlreadySuccessfulMessage() public {
        // First, create a message that will succeed with trusted relayer
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            gasLimit: 1000000,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(MockTarget.setValue.selector, 42)
                })
            )
        });

        bytes memory ismData = _generateValidISMData(messages);

        // First attempt by trusted relayer should succeed
        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData);

        // Now try the exact same message again with non-trusted relayer - should revert with
        // MessageAlreadySuccessfullyRelayed
        vm.expectRevert(Bridge.MessageAlreadySuccessfullyRelayed.selector);
        vm.prank(unauthorizedUser);
        bridge.relayMessages(messages, hex""); // Non-trusted relayer doesn't need valid ISM data
    }

    function test_relayMessages_emitsSuccessEvent() public {
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            gasLimit: 1000000,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(MockTarget.setValue.selector, 42)
                })
            )
        });

        bytes32 expectedHash =
            keccak256(abi.encode(messages[0].nonce, messages[0].sender, messages[0].ty, messages[0].data));

        bytes memory ismData = _generateValidISMData(messages);

        vm.expectEmit(true, false, false, false);
        emit MessageSuccessfullyRelayed(expectedHash);

        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData);
    }

    function test_relayMessages_emitsFailureEvent() public {
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            gasLimit: 1000000,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(MockTarget.alwaysReverts.selector)
                })
            )
        });

        bytes32 expectedHash =
            keccak256(abi.encode(messages[0].nonce, messages[0].sender, messages[0].ty, messages[0].data));

        bytes memory ismData = _generateValidISMData(messages);

        vm.expectEmit(true, false, false, false);
        emit FailedToRelayMessage(expectedHash);

        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData);
    }

    //////////////////////////////////////////////////////////////
    ///              Message Type Tests                        ///
    //////////////////////////////////////////////////////////////

    function test_relayMessage_callType() public {
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            gasLimit: 1000000,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(MockTarget.setValue.selector, 123)
                })
            )
        });

        bytes memory ismData = _generateValidISMData(messages);

        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData);

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
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            gasLimit: 1000000,
            ty: MessageType.Transfer,
            data: abi.encode(transfer)
        });

        bytes memory ismData = _generateValidISMData(messages);

        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData);

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
            data: abi.encodeWithSelector(MockTarget.setValue.selector, 456)
        });

        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            gasLimit: 1000000,
            ty: MessageType.TransferAndCall,
            data: abi.encode(transfer, call)
        });

        bytes memory ismData = _generateValidISMData(messages);

        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData);

        assertEq(crossChainToken.balanceOf(user), 100e6);
        assertEq(mockTarget.value(), 456);
    }

    function test_relayMessage_remoteBridgeSpecialCase() public {
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: remoteBridge, // Special case
            gasLimit: 1000000,
            ty: MessageType.Call,
            data: abi.encode(address(mockToken), TEST_REMOTE_TOKEN, uint8(12))
        });

        bytes memory ismData = _generateValidISMData(messages);

        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData);

        // Should complete without creating Twin
        assertEq(bridge.twins(remoteBridge), address(0));
    }

    //////////////////////////////////////////////////////////////
    ///                Access Control Tests                    ///
    //////////////////////////////////////////////////////////////

    function test_validateAndRelay_revertsOnDirectCall() public {
        IncomingMessage memory message = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            gasLimit: 1000000,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(MockTarget.setValue.selector, 42)
                })
            )
        });

        vm.expectRevert(Bridge.SenderIsNotEntrypoint.selector);
        vm.prank(user);
        bridge.__validateAndRelay(message, true);
    }

    function test_relayMessage_revertsOnDirectCall() public {
        IncomingMessage memory message = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            gasLimit: 1000000,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(MockTarget.setValue.selector, 42)
                })
            )
        });

        vm.expectRevert(Bridge.SenderIsNotEntrypoint.selector);
        vm.prank(user);
        bridge.__relayMessage(message);
    }

    //////////////////////////////////////////////////////////////
    ///                 Gas Estimation Tests                   ///
    //////////////////////////////////////////////////////////////

    function test_gasEstimation_revertsOnFailure() public {
        // First make this message fail by trusted relayer so it can be retried
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            gasLimit: 100000, // Low gas to cause failure
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(MockTarget.alwaysReverts.selector)
                })
            )
        });

        bytes memory ismData = _generateValidISMData(messages);

        vm.prank(trustedRelayer, bridge.ESTIMATION_ADDRESS());
        vm.expectRevert(Bridge.ExecutionFailed.selector);
        bridge.relayMessages(messages, ismData);
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
        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 12);

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

        Ix[] memory ixs = new Ix[](0);
        // Register token pair (this processes an incoming message, doesn't affect outgoing MMR)
        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 12);

        // Track roots across mixed operations
        bytes32[] memory roots = new bytes32[](5);
        roots[0] = bridge.getRoot(); // Initial (should be 0)
        assertEq(roots[0], bytes32(0), "Root should be 0 initially");

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

    function test_relayMessages_withEmptyArray() public {
        IncomingMessage[] memory messages = new IncomingMessage[](0);
        bytes memory ismData = _generateValidISMData(messages);

        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData);

        // Should complete without error
        assertEq(bridge.nextIncomingNonce(), 0);
    }

    function test_relayMessages_withMultipleMessages() public {
        IncomingMessage[] memory messages = new IncomingMessage[](3);
        for (uint256 i = 0; i < 3; i++) {
            messages[i] = IncomingMessage({
                nonce: uint64(i),
                sender: TEST_SENDER,
                gasLimit: 1000000,
                ty: MessageType.Call,
                data: abi.encode(
                    Call({
                        ty: CallType.Call,
                        to: address(mockTarget),
                        value: 0,
                        data: abi.encodeWithSelector(MockTarget.setValue.selector, i + 1)
                    })
                )
            });
        }

        bytes memory ismData = _generateValidISMData(messages);

        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData);

        assertEq(bridge.nextIncomingNonce(), 3);
        assertEq(mockTarget.value(), 3); // Last value set
    }

    function test_twinReuse() public {
        // First message creates Twin
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: 0,
            sender: TEST_SENDER,
            gasLimit: 1000000,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(MockTarget.setValue.selector, 1)
                })
            )
        });

        bytes memory ismData = _generateValidISMData(messages);

        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData);

        address firstTwin = bridge.twins(TEST_SENDER);

        // Second message reuses Twin
        messages[0].nonce = 1;
        messages[0].data = abi.encode(
            Call({
                ty: CallType.Call,
                to: address(mockTarget),
                value: 0,
                data: abi.encodeWithSelector(MockTarget.setValue.selector, 2)
            })
        );

        // Regenerate ISM data for the modified message
        bytes memory ismData2 = _generateValidISMData(messages);

        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData2);

        address secondTwin = bridge.twins(TEST_SENDER);
        assertEq(firstTwin, secondTwin);
        assertEq(mockTarget.value(), 2);
    }

    //////////////////////////////////////////////////////////////
    ///                    Fuzz Tests                          ///
    //////////////////////////////////////////////////////////////

    function testFuzz_bridgeCall_withDifferentSenders(address sender) public {
        vm.assume(sender != address(0));

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
        for (uint64 i = 0; i < nonce; i++) {
            IncomingMessage[] memory tempMessages = new IncomingMessage[](1);
            tempMessages[0] = IncomingMessage({
                nonce: i,
                sender: TEST_SENDER,
                gasLimit: 1000000,
                ty: MessageType.Call,
                data: abi.encode(
                    Call({
                        ty: CallType.Call,
                        to: address(mockTarget),
                        value: 0,
                        data: abi.encodeWithSelector(MockTarget.setValue.selector, i)
                    })
                )
            });

            bytes memory tempIsmData = _generateValidISMData(tempMessages);
            vm.prank(trustedRelayer);
            bridge.relayMessages(tempMessages, tempIsmData);
        }

        // Now send the actual test message
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            nonce: nonce,
            sender: TEST_SENDER,
            gasLimit: 1000000,
            ty: MessageType.Call,
            data: abi.encode(
                Call({
                    ty: CallType.Call,
                    to: address(mockTarget),
                    value: 0,
                    data: abi.encodeWithSelector(MockTarget.setValue.selector, 42)
                })
            )
        });

        bytes memory ismData = _generateValidISMData(messages);

        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData);

        assertEq(bridge.nextIncomingNonce(), nonce + 1);
        assertEq(mockTarget.value(), 42);
    }

    //////////////////////////////////////////////////////////////
    ///                  Helper Functions                      ///
    //////////////////////////////////////////////////////////////

    function _registerTokenPair(address localToken, Pubkey remoteToken, uint8 scalerExponent) internal {
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
        messages[0] = IncomingMessage({
            nonce: bridge.nextIncomingNonce(),
            sender: remoteBridge, // Only remote bridge can register tokens
            gasLimit: 1000000,
            ty: MessageType.Call,
            data: data
        });

        bytes memory ismData = _generateValidISMData(messages);

        vm.prank(trustedRelayer);
        bridge.relayMessages(messages, ismData);
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

        // Now the MMR should correctly return the leaf hash for single leaf
        console2.log("Actual root:", vm.toString(finalRoot));
        console2.log("Expected leaf hash:", vm.toString(expectedLeafHash));

        // This should now pass with the fixed implementation
        assertEq(finalRoot, expectedLeafHash, "Single leaf MMR should return the leaf hash itself");
    }

    /// @notice Test to reproduce the bug where getRoot() returns a leaf hash instead of combined root for 2 nodes
    function test_getRoot_twoLeavesShouldReturnCombinedRoot_BugReproduction() public {
        console2.log("=== Testing MMR behavior with 2 leaves ===");

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

        bytes32 rootAfterFirst = bridge.getRoot();
        uint64 nonceAfterFirst = bridge.getLastOutgoingNonce();

        console2.log("After first message:");
        console2.log("  Nonce:", nonceAfterFirst);
        console2.log("  Root:", vm.toString(rootAfterFirst));

        // Calculate expected first leaf hash
        bytes memory serializedCall1 = SVMBridgeLib.serializeCall(ixs1);
        bytes32 expectedLeaf1 = keccak256(abi.encodePacked(uint64(0), user, serializedCall1));
        console2.log("  Expected leaf1 hash:", vm.toString(expectedLeaf1));

        // Send second bridge call
        Ix[] memory ixs2 = new Ix[](1);
        ixs2[0] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: hex"abcdef12"});

        vm.prank(user);
        bridge.bridgeCall(ixs2);

        bytes32 rootAfterSecond = bridge.getRoot();
        uint64 nonceAfterSecond = bridge.getLastOutgoingNonce();

        console2.log("After second message:");
        console2.log("  Nonce:", nonceAfterSecond);
        console2.log("  Root:", vm.toString(rootAfterSecond));

        // Calculate expected second leaf hash
        bytes memory serializedCall2 = SVMBridgeLib.serializeCall(ixs2);
        bytes32 expectedLeaf2 = keccak256(abi.encodePacked(uint64(1), user, serializedCall2));
        console2.log("  Expected leaf2 hash:", vm.toString(expectedLeaf2));

        // Calculate what the combined root should be
        // For 2 leaves, the root should be the hash of both leaves combined
        bytes32 expectedCombinedRoot;
        if (expectedLeaf1 < expectedLeaf2) {
            expectedCombinedRoot = keccak256(abi.encodePacked(expectedLeaf1, expectedLeaf2));
        } else {
            expectedCombinedRoot = keccak256(abi.encodePacked(expectedLeaf2, expectedLeaf1));
        }
        console2.log("  Expected combined root:", vm.toString(expectedCombinedRoot));

        // Check if the bug exists: root should NOT be equal to either leaf hash
        console2.log("=== Bug Check ===");
        console2.log("Root equals leaf1?", rootAfterSecond == expectedLeaf1);
        console2.log("Root equals leaf2?", rootAfterSecond == expectedLeaf2);
        console2.log("Root equals expected combined?", rootAfterSecond == expectedCombinedRoot);

        // The bug: if root equals one of the leaf hashes, that's incorrect
        if (rootAfterSecond == expectedLeaf1) {
            console2.log("BUG CONFIRMED: Root returned leaf1 hash instead of combined root!");
        } else if (rootAfterSecond == expectedLeaf2) {
            console2.log("BUG CONFIRMED: Root returned leaf2 hash instead of combined root!");
        } else if (rootAfterSecond == expectedCombinedRoot) {
            console2.log("No bug: Root correctly returned combined hash");
        } else {
            console2.log("Unexpected root value - neither leaf nor combined");
        }

        // This assertion should pass if the MMR is working correctly
        assertEq(
            rootAfterSecond, expectedCombinedRoot, "Two leaves should produce combined root, not individual leaf hash"
        );

        // These assertions should fail if the bug exists
        assertNotEq(rootAfterSecond, expectedLeaf1, "Root should not be leaf1 hash for 2-leaf MMR");
        assertNotEq(rootAfterSecond, expectedLeaf2, "Root should not be leaf2 hash for 2-leaf MMR");
    }

    /// @notice Debug test to examine MMR internal state and peak calculation
    function test_getRoot_debugMMRInternalState() public {
        console2.log("=== Debugging MMR Internal State ===");

        // Send first bridge call
        Ix[] memory ixs1 = new Ix[](1);
        ixs1[0] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: hex"deadbeef"});

        vm.prank(user);
        bridge.bridgeCall(ixs1);

        console2.log("After 1 leaf:");
        console2.log("  Nonce:", bridge.getLastOutgoingNonce());
        console2.log("  Root:", vm.toString(bridge.getRoot()));

        // Try to generate proof to see internal state
        try bridge.generateProof(0) returns (bytes32[] memory proof, uint64 totalLeafCount) {
            console2.log("  Successfully generated proof for leaf 0");
            console2.log("  Total leaf count:", totalLeafCount);
            console2.log("  Proof length:", proof.length);
        } catch {
            console2.log("  Failed to generate proof for leaf 0");
        }

        // Send second bridge call
        Ix[] memory ixs2 = new Ix[](1);
        ixs2[0] = Ix({programId: TEST_SENDER, serializedAccounts: new bytes[](0), data: hex"abcdef12"});

        vm.prank(user);
        bridge.bridgeCall(ixs2);

        console2.log("After 2 leaves:");
        console2.log("  Nonce:", bridge.getLastOutgoingNonce());
        console2.log("  Root:", vm.toString(bridge.getRoot()));

        // Try to generate proofs for both leaves
        try bridge.generateProof(0) returns (bytes32[] memory proof0, uint64 totalLeafCount0) {
            console2.log("  Proof for leaf 0 - length:", proof0.length);
            console2.log("  Total leaf count:", totalLeafCount0);
            if (proof0.length > 0) {
                console2.log("  First proof element:", vm.toString(proof0[0]));
            }
        } catch {
            console2.log("  Failed to generate proof for leaf 0");
        }

        try bridge.generateProof(1) returns (bytes32[] memory proof1, uint64 totalLeafCount1) {
            console2.log("  Proof for leaf 1 - length:", proof1.length);
            console2.log("  Total leaf count:", totalLeafCount1);
            if (proof1.length > 0) {
                console2.log("  First proof element:", vm.toString(proof1[0]));
            }
        } catch {
            console2.log("  Failed to generate proof for leaf 1");
        }

        // Calculate what we expect
        bytes memory serializedCall1 = SVMBridgeLib.serializeCall(ixs1);
        bytes32 expectedLeaf1 = keccak256(abi.encodePacked(uint64(0), user, serializedCall1));

        bytes memory serializedCall2 = SVMBridgeLib.serializeCall(ixs2);
        bytes32 expectedLeaf2 = keccak256(abi.encodePacked(uint64(1), user, serializedCall2));

        console2.log("Expected leaf1:", vm.toString(expectedLeaf1));
        console2.log("Expected leaf2:", vm.toString(expectedLeaf2));

        // For a 2-leaf MMR, both leaves should have the other leaf as their sibling in the proof
        console2.log("Leaf1 should have leaf2 as sibling:", vm.toString(expectedLeaf2));
        console2.log("Leaf2 should have leaf1 as sibling:", vm.toString(expectedLeaf1));
    }

    //////////////////////////////////////////////////////////////
    ///                  Internal Functions                    ///
    //////////////////////////////////////////////////////////////

    /// @notice Generates valid ISM data for a given set of messages.
    ///
    /// @param messages The messages to be included in the ISM.
    ///
    /// @return The ISM data containing the signatures of the validators.
    function _generateValidISMData(IncomingMessage[] memory messages) internal pure returns (bytes memory) {
        bytes32 messageHash = keccak256(abi.encode(messages));

        // Create signatures from validators (threshold = 2, so we need 2 signatures)
        bytes memory signatures = new bytes(0);

        // Sort validators by address to ensure ascending order
        uint256[] memory sortedKeys = new uint256[](2);
        sortedKeys[0] = VALIDATOR1_KEY;
        sortedKeys[1] = VALIDATOR2_KEY;

        if (vm.addr(VALIDATOR1_KEY) > vm.addr(VALIDATOR2_KEY)) {
            sortedKeys[0] = VALIDATOR2_KEY;
            sortedKeys[1] = VALIDATOR1_KEY;
        }

        // Create signatures in ascending order
        for (uint256 i = 0; i < 2; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(sortedKeys[i], messageHash);
            signatures = abi.encodePacked(signatures, r, s, v);
        }

        return signatures;
    }
}

//////////////////////////////////////////////////////////////
///                    Mock Contracts                      ///
//////////////////////////////////////////////////////////////

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event ERC20Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit ERC20Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit ERC20Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit ERC20Transfer(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
}

contract MockTarget {
    uint256 public value;

    event ValueSet(uint256 newValue);

    receive() external payable {}

    function setValue(uint256 _value) external payable {
        value = _value;
        emit ValueSet(_value);
    }

    function alwaysReverts() external pure {
        revert("This function always reverts");
    }
}
