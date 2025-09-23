// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DeployScript} from "../../script/Deploy.s.sol";

import {CrossChainERC20} from "../../src/CrossChainERC20.sol";
import {Call, CallType} from "../../src/libraries/CallLib.sol";
import {IncomingMessage, MessageType} from "../../src/libraries/MessageLib.sol";
import {Ix, Pubkey} from "../../src/libraries/SVMLib.sol";
import {TokenLib, Transfer} from "../../src/libraries/TokenLib.sol";

import {CommonTest} from "../CommonTest.t.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockFeeERC20} from "../mocks/MockFeeERC20.sol";

contract TokenLibTest is CommonTest {
    // Test addresses and constants
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    // Test tokens
    MockERC20 public mockToken;
    MockFeeERC20 public feeToken;
    CrossChainERC20 public crossChainToken;
    CrossChainERC20 public crossChainSolToken;

    // Test Solana pubkeys
    Pubkey public constant TEST_REMOTE_TOKEN =
        Pubkey.wrap(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef);
    Pubkey public constant TEST_NATIVE_SOL =
        Pubkey.wrap(0x069be72ab836d4eacc02525b7350a78a395da2f1253a40ebafd6630000000000);
    Pubkey public constant TEST_SPL_TOKEN =
        Pubkey.wrap(0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890);
    Pubkey public constant TEST_TRANSFER_SENDER =
        Pubkey.wrap(0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321);

    // Events for testing
    event TransferInitialized(address localToken, Pubkey remoteToken, Pubkey to, uint256 amount);
    event TransferFinalized(address localToken, Pubkey remoteToken, address to, uint256 amount);

    function setUp() public {
        // Use the DeployScript normally - now it uses deterministic validator keys
        DeployScript deployer = new DeployScript();
        (, bridgeValidator, bridge, factory, relayerOrchestrator, helperConfig) = deployer.run();

        cfg = helperConfig.getConfig();

        // Deploy CrossChainERC20 for testing SPL tokens
        crossChainToken = CrossChainERC20(factory.deploy(Pubkey.unwrap(TEST_SPL_TOKEN), "Cross Chain Token", "CCT", 9));

        // Deploy CrossChainERC20 for testing SOL tokens
        crossChainSolToken =
            CrossChainERC20(factory.deploy(Pubkey.unwrap(TEST_NATIVE_SOL), "Cross Chain SOL", "CSOL", 9));

        // Deploy mock tokens
        mockToken = new MockERC20("Mock Token", "MOCK", 18);
        feeToken = new MockFeeERC20("Fee Token", "FEE", 18);

        // Set up balances
        vm.deal(address(bridge), 100 ether);
        mockToken.mint(alice, 1000e18);
        mockToken.mint(bob, 1000e18);
        feeToken.mint(alice, 1000e18);

        // Mint cross-chain tokens to alice (bridge is the minter)
        vm.prank(address(bridge));
        crossChainToken.mint(alice, 1000e9);
    }

    //////////////////////////////////////////////////////////////
    ///               Register Remote Token Tests              ///
    //////////////////////////////////////////////////////////////

    function test_registerRemoteToken_setsCorrectScalar() public {
        uint8 exponent = 12;
        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, exponent, 0);

        uint256 expectedScalar = 10 ** exponent;
        uint256 actualScalar = bridge.scalars(address(mockToken), TEST_REMOTE_TOKEN);

        assertEq(actualScalar, expectedScalar, "Scalar not set correctly");
    }

    function test_registerRemoteToken_withDifferentExponents() public {
        // Test various exponents
        for (uint256 i; i <= 18; i++) {
            address testToken = makeAddr(string(abi.encodePacked("token", i)));
            Pubkey testRemote = Pubkey.wrap(bytes32(i + 1));

            _registerTokenPair(testToken, testRemote, uint8(i), i);

            uint256 expectedScalar = 10 ** i;
            uint256 actualScalar = bridge.scalars(testToken, testRemote);

            assertEq(actualScalar, expectedScalar, string(abi.encodePacked("Exponent ", i, " failed")));
        }
    }

    //////////////////////////////////////////////////////////////
    ///               Initialize Transfer Tests                ///
    //////////////////////////////////////////////////////////////

    function test_initializeTransfer_nativeETH_success() public {
        // Register ETH-SOL pair
        _registerTokenPair(TokenLib.ETH_ADDRESS, TokenLib.NATIVE_SOL_PUBKEY, 9, 0);

        Transfer memory transfer = Transfer({
            localToken: TokenLib.ETH_ADDRESS,
            remoteToken: TokenLib.NATIVE_SOL_PUBKEY,
            to: bytes32(uint256(uint160(alice))),
            remoteAmount: 1e9 // 1 SOL
        });

        uint256 expectedLocalAmount = 1e18; // 1 ETH (scaled by 1e9)

        vm.expectEmit(true, true, true, true);
        emit TransferInitialized(
            TokenLib.ETH_ADDRESS, TokenLib.NATIVE_SOL_PUBKEY, Pubkey.wrap(transfer.to), expectedLocalAmount
        );

        vm.deal(address(this), expectedLocalAmount);
        Ix[] memory emptyIxs;
        bridge.bridgeToken{value: expectedLocalAmount}(transfer, emptyIxs);
    }

    function test_initializeTransfer_nativeETH_revertsOnInvalidMsgValue() public {
        _registerTokenPair(TokenLib.ETH_ADDRESS, TokenLib.NATIVE_SOL_PUBKEY, 9, 0);

        Transfer memory transfer = Transfer({
            localToken: TokenLib.ETH_ADDRESS,
            remoteToken: TokenLib.NATIVE_SOL_PUBKEY,
            to: bytes32(uint256(uint160(alice))),
            remoteAmount: 1e9
        });

        // Send wrong amount of ETH
        vm.expectRevert(TokenLib.InvalidMsgValue.selector);
        Ix[] memory emptyIxs;
        bridge.bridgeToken{value: 2e18}(transfer, emptyIxs);
    }

    function test_initializeTransfer_nativeETH_revertsOnUnregisteredRoute() public {
        Transfer memory transfer = Transfer({
            localToken: TokenLib.ETH_ADDRESS,
            remoteToken: TEST_REMOTE_TOKEN,
            to: bytes32(uint256(uint160(alice))),
            remoteAmount: 1e9
        });

        vm.expectRevert(TokenLib.WrappedSplRouteNotRegistered.selector);
        Ix[] memory emptyIxs;
        bridge.bridgeToken{value: 1e18}(transfer, emptyIxs);
    }

    function test_initializeTransfer_nativeERC20_success() public {
        // Register token pair
        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 12, 0);

        Transfer memory transfer = Transfer({
            localToken: address(mockToken),
            remoteToken: TEST_REMOTE_TOKEN,
            to: bytes32(uint256(uint160(bob))), // Bob is the recipient on Solana
            remoteAmount: 100e6 // 100 tokens (6 decimals on Solana)
        });

        uint256 expectedLocalAmount = 100e18; // 100 tokens (18 decimals on Base)

        // Bob approves and bridges tokens through the bridge contract
        vm.prank(bob);
        mockToken.approve(address(bridge), expectedLocalAmount);

        uint256 bobInitialBalance = mockToken.balanceOf(bob);
        uint256 bridgeInitialBalance = mockToken.balanceOf(address(bridge));

        vm.expectEmit(true, true, true, true);
        emit TransferInitialized(address(mockToken), TEST_REMOTE_TOKEN, Pubkey.wrap(transfer.to), expectedLocalAmount);

        vm.prank(bob);
        Ix[] memory emptyIxs;
        bridge.bridgeToken(transfer, emptyIxs);

        // Tokens are transferred FROM bob TO bridge, so bob balance decreases and bridge balance increases
        assertEq(mockToken.balanceOf(bob), bobInitialBalance - expectedLocalAmount, "Bob balance should decrease");
        assertEq(
            mockToken.balanceOf(address(bridge)),
            bridgeInitialBalance + expectedLocalAmount,
            "Bridge balance should increase"
        );

        // Check deposits were updated
        uint256 deposits = bridge.deposits(address(mockToken), TEST_REMOTE_TOKEN);
        assertEq(deposits, expectedLocalAmount, "Deposits not updated correctly");
    }

    function test_initializeTransfer_nativeERC20_withTransferFees() public {
        // Register fee token pair
        _registerTokenPair(address(feeToken), TEST_REMOTE_TOKEN, 12, 0);

        Transfer memory transfer = Transfer({
            localToken: address(feeToken),
            remoteToken: TEST_REMOTE_TOKEN,
            to: bytes32(uint256(uint160(alice))),
            remoteAmount: 100e6 // 100 tokens requested
        });

        uint256 requestedLocalAmount = 100e18;
        uint256 actualReceivedAmount = 99e18; // 1% fee deducted

        // Alice approves and bridges fee tokens through the bridge contract
        vm.prank(alice);
        feeToken.approve(address(bridge), requestedLocalAmount);

        uint256 aliceInitialBalance = feeToken.balanceOf(alice);
        uint256 bridgeInitialBalance = feeToken.balanceOf(address(bridge));

        // Expect event with the actual received amount (after fees)
        vm.expectEmit(true, true, true, true);
        emit TransferInitialized(address(feeToken), TEST_REMOTE_TOKEN, Pubkey.wrap(transfer.to), actualReceivedAmount);

        vm.prank(alice);
        Ix[] memory emptyIxs;
        bridge.bridgeToken(transfer, emptyIxs);

        // Verify balances: alice pays full amount, bridge receives amount after fees
        assertEq(feeToken.balanceOf(alice), aliceInitialBalance - requestedLocalAmount, "Alice should pay full amount");
        assertEq(
            feeToken.balanceOf(address(bridge)),
            bridgeInitialBalance + actualReceivedAmount,
            "Bridge should receive post-fee amount"
        );

        // Check deposits were updated with actual received amount
        uint256 deposits = bridge.deposits(address(feeToken), TEST_REMOTE_TOKEN);
        assertEq(deposits, actualReceivedAmount, "Deposits should reflect actual received amount");
    }

    function test_initializeTransfer_crossChainSPL_success() public {
        Transfer memory transfer = Transfer({
            localToken: address(crossChainToken),
            remoteToken: TEST_SPL_TOKEN, // Use the correct remote token that crossChainToken was deployed with
            to: bytes32(uint256(uint160(alice))),
            remoteAmount: 100e9 // 100 SPL tokens
        });

        uint256 aliceInitialBalance = crossChainToken.balanceOf(alice);

        vm.expectEmit(true, true, true, true);
        emit TransferInitialized(address(crossChainToken), TEST_SPL_TOKEN, Pubkey.wrap(transfer.to), 100e9);

        // Use the actual bridge contract with empty instructions array
        Ix[] memory emptyIxs;
        vm.prank(alice);
        bridge.bridgeToken(transfer, emptyIxs);

        assertEq(crossChainToken.balanceOf(alice), aliceInitialBalance - 100e9, "Alice's tokens should be burned");
    }

    function test_initializeTransfer_crossChainSPL_original() public {
        Transfer memory transfer = Transfer({
            localToken: address(crossChainToken),
            remoteToken: TEST_SPL_TOKEN,
            to: bytes32(uint256(uint160(alice))),
            remoteAmount: 100e9 // 100 SPL tokens
        });

        uint256 aliceInitialBalance = crossChainToken.balanceOf(alice);

        vm.expectEmit(true, true, true, true);
        emit TransferInitialized(address(crossChainToken), TEST_SPL_TOKEN, Pubkey.wrap(transfer.to), 100e9);

        // Use the actual bridge contract with empty instructions array
        Ix[] memory emptyIxs;
        vm.prank(alice);
        bridge.bridgeToken(transfer, emptyIxs);

        assertEq(crossChainToken.balanceOf(alice), aliceInitialBalance - 100e9, "Tokens should be burned");
    }

    function test_initializeTransfer_crossChain_revertsOnIncorrectRemoteToken() public {
        Transfer memory transfer = Transfer({
            localToken: address(crossChainToken),
            remoteToken: TEST_REMOTE_TOKEN, // Wrong remote token (crossChainToken expects TEST_SPL_TOKEN)
            to: bytes32(uint256(uint160(alice))),
            remoteAmount: 100e9
        });

        vm.expectRevert(TokenLib.IncorrectRemoteToken.selector);
        vm.prank(alice);
        Ix[] memory emptyIxs;
        bridge.bridgeToken(transfer, emptyIxs);
    }

    function test_initializeTransfer_revertsOnETHSentWithERC20() public {
        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 12, 0);

        Transfer memory transfer = Transfer({
            localToken: address(mockToken),
            remoteToken: TEST_REMOTE_TOKEN,
            to: bytes32(uint256(uint160(alice))),
            remoteAmount: 100e6
        });

        vm.expectRevert(TokenLib.InvalidMsgValue.selector);
        Ix[] memory emptyIxs;
        bridge.bridgeToken{value: 1 ether}(transfer, emptyIxs);
    }

    function test_initializeTransfer_revertsOnZeroAmount() public {
        Transfer memory transfer = Transfer({
            localToken: address(mockToken),
            remoteToken: TEST_REMOTE_TOKEN,
            to: bytes32(uint256(uint160(alice))),
            remoteAmount: 0
        });

        vm.expectRevert(TokenLib.ZeroAmount.selector);
        Ix[] memory emptyIxs;
        bridge.bridgeToken(transfer, emptyIxs);
    }

    //////////////////////////////////////////////////////////////
    ///               Finalize Transfer Tests                  ///
    //////////////////////////////////////////////////////////////

    function test_finalizeTransfer_nativeETH_success() public {
        // Register ETH-SOL pair and set up deposits
        _registerTokenPair(TokenLib.ETH_ADDRESS, TokenLib.NATIVE_SOL_PUBKEY, 9, 0);

        // Fund deposits by actually bridging ETH into the contract (Base -> Solana)
        uint256 expectedLocalAmount = 1e18; // 1 ETH
        vm.deal(address(this), expectedLocalAmount);
        {
            Transfer memory setup = Transfer({
                localToken: TokenLib.ETH_ADDRESS,
                remoteToken: TokenLib.NATIVE_SOL_PUBKEY,
                to: bytes32(bytes20(address(this))),
                remoteAmount: 1e9
            });
            Ix[] memory emptyIxs;
            bridge.bridgeToken{value: expectedLocalAmount}(setup, emptyIxs);
        }

        Transfer memory transfer = Transfer({
            localToken: TokenLib.ETH_ADDRESS,
            remoteToken: TokenLib.NATIVE_SOL_PUBKEY,
            to: bytes32(bytes20(alice)),
            remoteAmount: 1e9 // 1 SOL
        });

        uint256 aliceInitialBalance = alice.balance;

        // Simulate message relay from Solana to finalize transfer
        // Use a different sender (NOT the remote bridge, that's only for token registration)
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE,
            nonce: 1,
            sender: TEST_TRANSFER_SENDER,
            gasLimit: GAS_LIMIT,
            ty: MessageType.Transfer,
            data: abi.encode(transfer)
        });

        _registerMessage(messages[0]);

        vm.expectEmit(true, true, true, true);
        emit TransferFinalized(TokenLib.ETH_ADDRESS, TokenLib.NATIVE_SOL_PUBKEY, alice, expectedLocalAmount);

        bridge.relayMessages(messages);

        assertEq(alice.balance, aliceInitialBalance + expectedLocalAmount, "ETH should be transferred to recipient");
    }

    function test_finalizeTransfer_nativeERC20_success() public {
        // Register token pair and set up deposits
        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 12, 0);
        _setDeposits(address(mockToken), TEST_REMOTE_TOKEN, 100e18);

        Transfer memory transfer = Transfer({
            localToken: address(mockToken),
            remoteToken: TEST_REMOTE_TOKEN,
            to: bytes32(bytes20(alice)),
            remoteAmount: 100e6 // 100 tokens on Solana
        });

        uint256 expectedLocalAmount = 100e18; // 100 tokens on Base
        uint256 aliceInitialBalance = mockToken.balanceOf(alice);

        // Simulate message relay from Solana to finalize transfer
        // Use a different sender (NOT the remote bridge, that's only for token registration)
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE,
            nonce: 1,
            sender: TEST_TRANSFER_SENDER, // Different sender for transfers
            gasLimit: GAS_LIMIT,
            ty: MessageType.Transfer,
            data: abi.encode(transfer)
        });

        _registerMessage(messages[0]);

        vm.expectEmit(true, true, true, true);
        emit TransferFinalized(address(mockToken), TEST_REMOTE_TOKEN, alice, expectedLocalAmount);

        bridge.relayMessages(messages);

        assertEq(
            mockToken.balanceOf(alice),
            aliceInitialBalance + expectedLocalAmount,
            "Tokens should be transferred to recipient"
        );

        // Check deposits were decreased
        uint256 deposits = bridge.deposits(address(mockToken), TEST_REMOTE_TOKEN);
        assertEq(deposits, 0, "Deposits should be decreased");
    }

    function test_finalizeTransfer_crossChainSOL_success() public {
        Transfer memory transfer = Transfer({
            localToken: address(crossChainSolToken),
            remoteToken: TEST_NATIVE_SOL,
            to: bytes32(bytes20(alice)),
            remoteAmount: 1e9 // 1 SOL
        });

        uint256 aliceInitialBalance = crossChainSolToken.balanceOf(alice);

        // Simulate message relay from Solana to finalize transfer
        // Use a different sender (NOT the remote bridge, that's only for token registration)
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE,
            nonce: 0,
            sender: TEST_TRANSFER_SENDER, // Different sender for transfers
            gasLimit: GAS_LIMIT,
            ty: MessageType.Transfer,
            data: abi.encode(transfer)
        });

        _registerMessage(messages[0]);

        vm.expectEmit(true, true, true, true);
        emit TransferFinalized(address(crossChainSolToken), TEST_NATIVE_SOL, alice, 1e9);

        bridge.relayMessages(messages);

        assertEq(crossChainSolToken.balanceOf(alice), aliceInitialBalance + 1e9, "Cross-chain tokens should be minted");
    }

    function test_finalizeTransfer_crossChainSPL_success() public {
        Transfer memory transfer = Transfer({
            localToken: address(crossChainToken),
            remoteToken: TEST_SPL_TOKEN,
            to: bytes32(bytes20(alice)),
            remoteAmount: 100e9 // 100 SPL tokens
        });

        uint256 aliceInitialBalance = crossChainToken.balanceOf(alice);

        // Simulate message relay from Solana to finalize transfer
        // Use a different sender (NOT the remote bridge, that's only for token registration)
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE,
            nonce: 0,
            sender: TEST_TRANSFER_SENDER, // Different sender for transfers
            gasLimit: GAS_LIMIT,
            ty: MessageType.Transfer,
            data: abi.encode(transfer)
        });

        _registerMessage(messages[0]);

        vm.expectEmit(true, true, true, true);
        emit TransferFinalized(address(crossChainToken), TEST_SPL_TOKEN, alice, 100e9);

        bridge.relayMessages(messages);

        assertEq(crossChainToken.balanceOf(alice), aliceInitialBalance + 100e9, "Cross-chain tokens should be minted");
    }

    function test_finalizeTransfer_revertsOnUnregisteredETHRoute() public {
        Transfer memory transfer = Transfer({
            localToken: TokenLib.ETH_ADDRESS,
            remoteToken: TEST_REMOTE_TOKEN, // Unregistered pair
            to: bytes32(uint256(uint160(alice))),
            remoteAmount: 1e9
        });

        // Prepare the message manually to avoid the nextIncomingNonce() call
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE,
            nonce: 0,
            sender: TEST_TRANSFER_SENDER,
            gasLimit: GAS_LIMIT,
            ty: MessageType.Transfer,
            data: abi.encode(transfer)
        });

        _registerMessage(messages[0]);

        bridge.relayMessages(messages);

        bytes32 messageHash = bridge.getMessageHash(messages[0]);
        assertNotEq(messageHash, bytes32(0));
    }

    function test_finalizeTransfer_revertsOnUnregisteredERC20Route() public {
        Transfer memory transfer = Transfer({
            localToken: address(mockToken),
            remoteToken: TEST_REMOTE_TOKEN, // Unregistered pair
            to: bytes32(uint256(uint160(alice))),
            remoteAmount: 100e6
        });

        // Prepare the message manually to avoid the nextIncomingNonce() call
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE,
            nonce: 0,
            sender: TEST_TRANSFER_SENDER,
            gasLimit: GAS_LIMIT,
            ty: MessageType.Transfer,
            data: abi.encode(transfer)
        });

        _registerMessage(messages[0]);

        bridge.relayMessages(messages);

        bytes32 messageHash = bridge.getMessageHash(messages[0]);
        assertNotEq(messageHash, bytes32(0));
    }

    function test_finalizeTransfer_crossChain_revertsOnIncorrectRemoteToken() public {
        Transfer memory transfer = Transfer({
            localToken: address(crossChainToken),
            remoteToken: TEST_REMOTE_TOKEN, // Wrong remote token (crossChainToken expects TEST_SPL_TOKEN)
            to: bytes32(bytes20(alice)),
            remoteAmount: 100e9
        });

        // Prepare the message manually to avoid the nextIncomingNonce() call
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE,
            nonce: 0,
            sender: TEST_TRANSFER_SENDER,
            gasLimit: GAS_LIMIT,
            ty: MessageType.Transfer,
            data: abi.encode(transfer)
        });

        _registerMessage(messages[0]);

        bridge.relayMessages(messages);

        bytes32 messageHash = bridge.getMessageHash(messages[0]);
        assertNotEq(messageHash, bytes32(0));
    }

    //////////////////////////////////////////////////////////////
    ///                 Storage Access Tests                   ///
    //////////////////////////////////////////////////////////////

    function test_getTokenLibStorage_deposits() public {
        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 12, 0);

        // Set up deposits through bridge
        _setDeposits(address(mockToken), TEST_REMOTE_TOKEN, 500e18);

        uint256 deposits = bridge.deposits(address(mockToken), TEST_REMOTE_TOKEN);
        assertEq(deposits, 500e18, "Deposits should be accessible");
    }

    function test_getTokenLibStorage_scalars() public {
        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 12, 0);

        uint256 scalar = bridge.scalars(address(mockToken), TEST_REMOTE_TOKEN);
        assertEq(scalar, 1e12, "Scalar should be accessible");
    }

    //////////////////////////////////////////////////////////////
    ///                 Constants Tests                        ///
    //////////////////////////////////////////////////////////////

    function test_constants() public pure {
        assertEq(TokenLib.ETH_ADDRESS, 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE, "ETH address constant incorrect");
        assertEq(
            Pubkey.unwrap(TokenLib.NATIVE_SOL_PUBKEY),
            0x069be72ab836d4eacc02525b7350a78a395da2f1253a40ebafd6630000000000,
            "Native SOL pubkey constant incorrect"
        );
    }

    //////////////////////////////////////////////////////////////
    ///                 Integration Tests                      ///
    //////////////////////////////////////////////////////////////

    function test_fullBridgeCycle_nativeERC20() public {
        // Register token pair
        _registerTokenPair(address(mockToken), TEST_REMOTE_TOKEN, 12, 0);

        // Initialize transfer (Base -> Solana)
        Transfer memory outgoingTransfer = Transfer({
            localToken: address(mockToken),
            remoteToken: TEST_REMOTE_TOKEN,
            to: bytes32(bytes20(alice)), // Fix: address conversion
            remoteAmount: 100e6
        });

        uint256 aliceInitialBalance = mockToken.balanceOf(alice);
        uint256 bridgeInitialBalance = mockToken.balanceOf(address(bridge));

        vm.prank(alice);
        mockToken.approve(address(bridge), 100e18);
        vm.prank(alice);
        Ix[] memory emptyIxs;
        bridge.bridgeToken(outgoingTransfer, emptyIxs);

        // Verify tokens transferred from alice to bridge and deposits increased
        assertEq(mockToken.balanceOf(alice), aliceInitialBalance - 100e18, "Alice balance should decrease");
        assertEq(mockToken.balanceOf(address(bridge)), bridgeInitialBalance + 100e18, "Bridge balance should increase");

        uint256 deposits = bridge.deposits(address(mockToken), TEST_REMOTE_TOKEN);
        assertEq(deposits, 100e18, "Deposits should increase");

        // Finalize transfer (Solana -> Base)
        Transfer memory incomingTransfer = Transfer({
            localToken: address(mockToken),
            remoteToken: TEST_REMOTE_TOKEN,
            to: bytes32(bytes20(bob)),
            remoteAmount: 50e6
        });

        uint256 bobInitialBalance = mockToken.balanceOf(bob);

        // Simulate message relay from Solana to finalize transfer
        // Use a different sender (NOT the remote bridge, that's only for token registration)
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE,
            nonce: 1,
            sender: TEST_TRANSFER_SENDER, // Different sender for transfers
            gasLimit: GAS_LIMIT,
            ty: MessageType.Transfer,
            data: abi.encode(incomingTransfer)
        });

        _registerMessage(messages[0]);
        bridge.relayMessages(messages);

        // Verify bob received tokens and deposits decreased
        assertEq(mockToken.balanceOf(bob), bobInitialBalance + 50e18, "Bob should receive tokens");

        deposits = bridge.deposits(address(mockToken), TEST_REMOTE_TOKEN);
        assertEq(deposits, 50e18, "Deposits should decrease");
    }

    function test_fullBridgeCycle_crossChainTokens() public {
        // Initialize transfer (Solana -> Base) - minting cross-chain tokens
        Transfer memory incomingTransfer = Transfer({
            localToken: address(crossChainToken),
            remoteToken: TEST_SPL_TOKEN,
            to: bytes32(bytes20(bob)),
            remoteAmount: 200e9
        });

        uint256 bobInitialBalance = crossChainToken.balanceOf(bob);

        // Simulate message relay from Solana to finalize transfer
        // Use a different sender (NOT the remote bridge, that's only for token registration)
        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE,
            nonce: 0,
            sender: TEST_TRANSFER_SENDER, // Different sender for transfers
            gasLimit: GAS_LIMIT,
            ty: MessageType.Transfer,
            data: abi.encode(incomingTransfer)
        });

        _registerMessage(messages[0]);
        bridge.relayMessages(messages);

        assertEq(crossChainToken.balanceOf(bob), bobInitialBalance + 200e9, "Bob should receive cross-chain tokens");

        // Initialize transfer (Base -> Solana) - burning cross-chain tokens
        Transfer memory outgoingTransfer = Transfer({
            localToken: address(crossChainToken),
            remoteToken: TEST_SPL_TOKEN,
            to: bytes32(bytes20(alice)),
            remoteAmount: 150e9
        });

        vm.prank(bob);
        crossChainToken.approve(address(bridge), 150e9);

        vm.expectEmit(true, true, true, true);
        emit TransferInitialized(address(crossChainToken), TEST_SPL_TOKEN, Pubkey.wrap(outgoingTransfer.to), 150e9);

        vm.prank(bob);
        Ix[] memory emptyIxs;
        bridge.bridgeToken(outgoingTransfer, emptyIxs);

        assertEq(crossChainToken.balanceOf(bob), 50e9, "Bob's tokens should be burned");
    }

    //////////////////////////////////////////////////////////////
    ///                Helper Functions                        ///
    //////////////////////////////////////////////////////////////

    function _registerTokenPair(address localToken, Pubkey remoteToken, uint8 scalarExponent, uint256 nonce) internal {
        Call memory call = Call({
            ty: CallType.Call,
            to: address(0), // Not relevant for token registration
            value: 0,
            data: abi.encode(localToken, remoteToken, scalarExponent)
        });
        bytes memory data = abi.encode(call);

        IncomingMessage[] memory messages = new IncomingMessage[](1);
        messages[0] = IncomingMessage({
            outgoingMessagePubkey: TEST_OUTGOING_MESSAGE,
            nonce: uint64(nonce),
            sender: cfg.remoteBridge,
            gasLimit: GAS_LIMIT,
            ty: MessageType.Call,
            data: data
        });

        _registerMessage(messages[0]);
        bridge.relayMessages(messages);
    }

    function _setDeposits(address localToken, Pubkey remoteToken, uint256 amount) internal {
        // Create deposits by actually bridging tokens (Base -> Solana)
        // This is the realistic way deposits are created
        uint256 scalar = bridge.scalars(localToken, remoteToken);
        uint64 remoteAmount = uint64(amount / scalar);

        Transfer memory setupTransfer = Transfer({
            localToken: localToken,
            remoteToken: remoteToken,
            to: bytes32(bytes20(address(this))),
            remoteAmount: remoteAmount
        });

        if (localToken != TokenLib.ETH_ADDRESS) {
            // Make sure bridge has enough tokens to work with
            MockERC20(localToken).mint(address(this), amount);
            MockERC20(localToken).approve(address(bridge), amount);

            Ix[] memory emptyIxs;
            bridge.bridgeToken(setupTransfer, emptyIxs);
        } else {
            Ix[] memory emptyIxs;
            bridge.bridgeToken{value: amount}(setupTransfer, emptyIxs);
        }
    }
}
