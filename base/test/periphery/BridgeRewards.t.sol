// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {TokenLib} from "../../src/libraries/TokenLib.sol";
import {BridgeRewards} from "../../src/periphery/BridgeRewards.sol";

import {MockBuilderCodes} from "../mocks/MockBuilderCodes.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

contract BridgeRewardsTest is Test {
    //////////////////////////////////////////////////////////////
    ///                       Test Setup                       ///
    //////////////////////////////////////////////////////////////

    // Contract under test
    BridgeRewards public bridgeRewards;

    // Mock contracts
    MockERC20 public mockToken;
    MockBuilderCodes public mockBuilderCodes;

    // Test addresses
    address public owner = makeAddr("owner");
    address public feeRecipient = makeAddr("feeRecipient");
    address public user = makeAddr("user");
    address public otherUser = makeAddr("otherUser");

    // Test constants
    bytes32 public constant TEST_CODE = keccak256("test_code");
    uint256 public constant VALID_FEE_PERCENT = 100; // 1.00%
    uint256 public constant INITIAL_TOKEN_BALANCE = 1000e18;
    uint256 public constant INITIAL_ETH_BALANCE = 100 ether;

    function setUp() public {
        mockBuilderCodes = new MockBuilderCodes();
        bridgeRewards = new BridgeRewards(address(mockBuilderCodes));
        mockToken = new MockERC20("Mock Token", "MOCK", 18);

        // Set up balances
        vm.deal(user, INITIAL_ETH_BALANCE);
        mockToken.mint(user, INITIAL_TOKEN_BALANCE);

        // Set up mock builder code
        mockBuilderCodes.setOwner({tokenId: uint256(TEST_CODE), owner: owner});
        mockBuilderCodes.setPayoutAddress({tokenId: uint256(TEST_CODE), payoutAddr: feeRecipient});
    }

    //////////////////////////////////////////////////////////////
    ///                   receive Tests                        ///
    //////////////////////////////////////////////////////////////

    function test_receive_acceptsEther() public {
        uint256 sendAmount = 1 ether;

        (bool success,) = address(bridgeRewards).call{value: sendAmount}("");

        assertTrue(success);
        assertEq(address(bridgeRewards).balance, sendAmount);
    }

    //////////////////////////////////////////////////////////////
    ///                 setFeePercent Tests                    ///
    //////////////////////////////////////////////////////////////

    function test_setFeePercent_success() public {
        vm.expectEmit(true, false, false, true);
        emit BridgeRewards.FeePercentSet({code: TEST_CODE, feePercent: VALID_FEE_PERCENT});

        vm.prank(owner);
        bridgeRewards.setFeePercent({code: TEST_CODE, feePercent: VALID_FEE_PERCENT});

        // Verify fee percent was stored
        assertEq(bridgeRewards.feePercents(TEST_CODE), VALID_FEE_PERCENT);
    }

    function test_setFeePercent_revertsWhenNotOwner() public {
        vm.expectRevert(BridgeRewards.SenderIsNotBuilderCodeOwner.selector);
        vm.prank(otherUser);
        bridgeRewards.setFeePercent({code: TEST_CODE, feePercent: VALID_FEE_PERCENT});
    }

    function test_setFeePercent_revertsWhenFeePercentTooHigh() public {
        uint256 maxFeePercent = bridgeRewards.MAX_FEE_PERCENT();

        vm.expectRevert(BridgeRewards.FeePercentTooHigh.selector);
        vm.prank(owner);
        bridgeRewards.setFeePercent({code: TEST_CODE, feePercent: maxFeePercent + 1});
    }

    //////////////////////////////////////////////////////////////
    ///                 useBuilderCode Tests                   ///
    //////////////////////////////////////////////////////////////

    function test_useBuilderCode_withETH() public {
        // Set fee percent for the builder code
        vm.prank(owner);
        bridgeRewards.setFeePercent({code: TEST_CODE, feePercent: VALID_FEE_PERCENT});

        // Calculate expected fees: 1% of 10 ETH = 0.1 ETH
        uint256 ethAmount = 10 ether;
        uint256 expectedFees = (ethAmount * VALID_FEE_PERCENT) / bridgeRewards.FEE_PERCENT_DIVISOR();

        vm.expectEmit(true, true, true, true);
        emit BridgeRewards.BuilderCodeUsed({
            code: TEST_CODE,
            token: TokenLib.ETH_ADDRESS,
            recipient: user,
            balance: ethAmount,
            fees: expectedFees
        });

        vm.prank(user);
        bridgeRewards.useBuilderCode{value: ethAmount}(TEST_CODE, TokenLib.ETH_ADDRESS, user);

        // Verify balances
        assertEq(feeRecipient.balance, expectedFees);
        assertEq(user.balance, INITIAL_ETH_BALANCE - expectedFees);
        assertEq(address(bridgeRewards).balance, 0);
    }

    function test_useBuilderCode_withERC20() public {
        // Set fee percent for the builder code
        vm.prank(owner);
        bridgeRewards.setFeePercent({code: TEST_CODE, feePercent: VALID_FEE_PERCENT});

        // Send tokens to contract
        uint256 tokenAmount = 1000e18;
        vm.prank(user);
        mockToken.transfer({to: address(bridgeRewards), amount: tokenAmount});

        // Calculate expected fees: 1% of 1000 tokens = 10 tokens
        uint256 expectedFees = (tokenAmount * VALID_FEE_PERCENT) / bridgeRewards.FEE_PERCENT_DIVISOR();

        vm.expectEmit(true, true, true, true);
        emit BridgeRewards.BuilderCodeUsed({
            code: TEST_CODE,
            token: address(mockToken),
            recipient: user,
            balance: tokenAmount,
            fees: expectedFees
        });

        vm.prank(user);
        bridgeRewards.useBuilderCode({code: TEST_CODE, token: address(mockToken), recipient: user});

        // Verify balances
        assertEq(mockToken.balanceOf(feeRecipient), expectedFees);
        assertEq(mockToken.balanceOf(user), INITIAL_TOKEN_BALANCE - expectedFees);
        assertEq(mockToken.balanceOf(address(bridgeRewards)), 0);
    }

    function test_useBuilderCode_revertsWhenBalanceIsZero() public {
        // Set fee percent for the builder code
        vm.prank(owner);
        bridgeRewards.setFeePercent({code: TEST_CODE, feePercent: VALID_FEE_PERCENT});

        // Contract has no ETH balance (0 by default)
        vm.expectRevert(BridgeRewards.BalanceIsZero.selector);
        vm.prank(user);
        bridgeRewards.useBuilderCode({code: TEST_CODE, token: TokenLib.ETH_ADDRESS, recipient: user});
    }

    function test_useBuilderCode_revertsWhenERC20BalanceIsZero() public {
        // Set fee percent for the builder code
        vm.prank(owner);
        bridgeRewards.setFeePercent({code: TEST_CODE, feePercent: VALID_FEE_PERCENT});

        // Contract has no token balance
        vm.expectRevert(BridgeRewards.BalanceIsZero.selector);
        vm.prank(user);
        bridgeRewards.useBuilderCode({code: TEST_CODE, token: address(mockToken), recipient: user});
    }

    function test_useBuilderCode_revertsWhenCodeOwnerNotSet() public {
        // Use a code that doesn't have an owner set in the mock
        bytes32 unownedCode = keccak256("unowned_code");

        // This should revert because the mock will return address(0) for ownerOf
        vm.expectRevert(BridgeRewards.SenderIsNotBuilderCodeOwner.selector);
        vm.prank(user);
        bridgeRewards.setFeePercent({code: unownedCode, feePercent: VALID_FEE_PERCENT});
    }
}
