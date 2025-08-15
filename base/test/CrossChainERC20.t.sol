// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC1967Factory} from "solady/utils/ERC1967Factory.sol";
import {UpgradeableBeacon} from "solady/utils/UpgradeableBeacon.sol";

import {DeployScript} from "../script/Deploy.s.sol";
import {Bridge} from "../src/Bridge.sol";
import {BridgeValidator} from "../src/BridgeValidator.sol";
import {CrossChainERC20} from "../src/CrossChainERC20.sol";
import {CrossChainERC20Factory} from "../src/CrossChainERC20Factory.sol";
import {CommonTest} from "./CommonTest.t.sol";

contract CrossChainERC20Test is CommonTest {
    //////////////////////////////////////////////////////////////
    ///                       Test Setup                       ///
    //////////////////////////////////////////////////////////////
    CrossChainERC20 public token;

    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");

    bytes32 public constant REMOTE_TOKEN = bytes32("remote_token_address");
    string public constant TOKEN_NAME = "Cross Chain Token";
    string public constant TOKEN_SYMBOL = "CCT";
    uint8 public constant TOKEN_DECIMALS = 18;

    uint256 public constant MINT_AMOUNT = 1000 * 10 ** 18;
    uint256 public constant BURN_AMOUNT = 500 * 10 ** 18;

    function setUp() public {
        DeployScript deployer = new DeployScript();
        (,, bridge, factory,) = deployer.run();
        token = CrossChainERC20(factory.deploy(REMOTE_TOKEN, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS));
    }

    //////////////////////////////////////////////////////////////
    ///                    Constructor Tests                   ///
    //////////////////////////////////////////////////////////////

    function test_constructor_setsCorrectValues() public view {
        assertEq(token.bridge(), address(bridge));
        assertEq(token.remoteToken(), REMOTE_TOKEN);
        assertEq(token.name(), TOKEN_NAME);
        assertEq(token.symbol(), TOKEN_SYMBOL);
        assertEq(token.decimals(), TOKEN_DECIMALS);
        assertEq(token.totalSupply(), 0);
    }

    function test_constructor_revertsOnZeroBridgeAddress() public {
        vm.expectRevert(CrossChainERC20.ZeroAddress.selector);
        new CrossChainERC20(address(0));
    }

    //////////////////////////////////////////////////////////////
    ///                     View Function Tests                ///
    //////////////////////////////////////////////////////////////

    function test_bridge_returnsCorrectAddress() public view {
        assertEq(token.bridge(), address(bridge));
    }

    function test_remoteToken_returnsCorrectValue() public view {
        assertEq(token.remoteToken(), REMOTE_TOKEN);
    }

    function test_name_returnsCorrectValue() public view {
        assertEq(token.name(), TOKEN_NAME);
    }

    function test_symbol_returnsCorrectValue() public view {
        assertEq(token.symbol(), TOKEN_SYMBOL);
    }

    function test_decimals_returnsCorrectValue() public view {
        assertEq(token.decimals(), TOKEN_DECIMALS);
    }

    //////////////////////////////////////////////////////////////
    ///                      Mint Tests                        ///
    //////////////////////////////////////////////////////////////

    function test_mint_successfulMint() public {
        vm.prank(address(bridge));
        vm.expectEmit(true, true, true, true);
        emit CrossChainERC20.Mint(user1, MINT_AMOUNT);

        token.mint(user1, MINT_AMOUNT);

        assertEq(token.balanceOf(user1), MINT_AMOUNT);
        assertEq(token.totalSupply(), MINT_AMOUNT);
    }

    function test_mint_multipleMints() public {
        vm.startPrank(address(bridge));

        // First mint
        token.mint(user1, MINT_AMOUNT);
        assertEq(token.balanceOf(user1), MINT_AMOUNT);
        assertEq(token.totalSupply(), MINT_AMOUNT);

        // Second mint to same user
        token.mint(user1, MINT_AMOUNT);
        assertEq(token.balanceOf(user1), MINT_AMOUNT * 2);
        assertEq(token.totalSupply(), MINT_AMOUNT * 2);

        // Mint to different user
        token.mint(user2, MINT_AMOUNT);
        assertEq(token.balanceOf(user2), MINT_AMOUNT);
        assertEq(token.totalSupply(), MINT_AMOUNT * 3);

        vm.stopPrank();
    }

    function test_mint_zeroAmount() public {
        vm.prank(address(bridge));
        vm.expectEmit(true, true, true, true);
        emit CrossChainERC20.Mint(user1, 0);

        token.mint(user1, 0);

        assertEq(token.balanceOf(user1), 0);
        assertEq(token.totalSupply(), 0);
    }

    function test_mint_maxAmount() public {
        vm.prank(address(bridge));

        token.mint(user1, type(uint256).max);

        assertEq(token.balanceOf(user1), type(uint256).max);
        assertEq(token.totalSupply(), type(uint256).max);
    }

    function test_mint_revert_fromUnauthorizedAddress() public {
        vm.prank(user1);
        vm.expectRevert(CrossChainERC20.SenderIsNotBridge.selector);
        token.mint(user1, MINT_AMOUNT);
    }

    function test_mint_revert_toZeroAddress() public {
        vm.prank(address(bridge));
        vm.expectRevert(CrossChainERC20.MintToZeroAddress.selector);
        token.mint(address(0), MINT_AMOUNT);
    }

    function test_mint_revert_fromUser() public {
        vm.prank(user1);
        vm.expectRevert(CrossChainERC20.SenderIsNotBridge.selector);
        token.mint(user1, MINT_AMOUNT);
    }

    function test_mint_eventEmission() public {
        vm.prank(address(bridge));

        vm.expectEmit(address(token));
        emit CrossChainERC20.Mint(user1, MINT_AMOUNT);

        token.mint(user1, MINT_AMOUNT);
    }

    //////////////////////////////////////////////////////////////
    ///                      Burn Tests                        ///
    //////////////////////////////////////////////////////////////

    function test_burn_successfulBurn() public {
        // First mint tokens to burn
        vm.prank(address(bridge));
        token.mint(user1, MINT_AMOUNT);

        // Then burn some of them
        vm.prank(address(bridge));
        vm.expectEmit(true, true, true, true);
        emit CrossChainERC20.Burn(user1, BURN_AMOUNT);

        token.burn(user1, BURN_AMOUNT);

        assertEq(token.balanceOf(user1), MINT_AMOUNT - BURN_AMOUNT);
        assertEq(token.totalSupply(), MINT_AMOUNT - BURN_AMOUNT);
    }

    function test_burn_entireBalance() public {
        // Mint tokens
        vm.prank(address(bridge));
        token.mint(user1, MINT_AMOUNT);

        // Burn entire balance
        vm.prank(address(bridge));
        token.burn(user1, MINT_AMOUNT);

        assertEq(token.balanceOf(user1), 0);
        assertEq(token.totalSupply(), 0);
    }

    function test_burn_zeroAmount() public {
        // Mint tokens first
        vm.prank(address(bridge));
        token.mint(user1, MINT_AMOUNT);

        // Burn zero amount
        vm.prank(address(bridge));
        vm.expectEmit(true, true, true, true);
        emit CrossChainERC20.Burn(user1, 0);

        token.burn(user1, 0);

        assertEq(token.balanceOf(user1), MINT_AMOUNT);
        assertEq(token.totalSupply(), MINT_AMOUNT);
    }

    function test_burn_multipleUsers() public {
        vm.startPrank(address(bridge));

        // Mint to multiple users
        token.mint(user1, MINT_AMOUNT);
        token.mint(user2, MINT_AMOUNT);

        // Burn from user1
        token.burn(user1, BURN_AMOUNT);
        assertEq(token.balanceOf(user1), MINT_AMOUNT - BURN_AMOUNT);
        assertEq(token.balanceOf(user2), MINT_AMOUNT);
        assertEq(token.totalSupply(), MINT_AMOUNT * 2 - BURN_AMOUNT);

        // Burn from user2
        token.burn(user2, BURN_AMOUNT);
        assertEq(token.balanceOf(user1), MINT_AMOUNT - BURN_AMOUNT);
        assertEq(token.balanceOf(user2), MINT_AMOUNT - BURN_AMOUNT);
        assertEq(token.totalSupply(), MINT_AMOUNT * 2 - BURN_AMOUNT * 2);

        vm.stopPrank();
    }

    function test_burn_revert_fromUnauthorizedAddress() public {
        // Mint tokens first
        vm.prank(address(bridge));
        token.mint(user1, MINT_AMOUNT);

        // Try to burn from unauthorized address
        vm.prank(user1);
        vm.expectRevert(CrossChainERC20.SenderIsNotBridge.selector);
        token.burn(user1, BURN_AMOUNT);
    }

    function test_burn_revert_fromZeroAddress() public {
        vm.prank(address(bridge));
        vm.expectRevert(CrossChainERC20.BurnFromZeroAddress.selector);
        token.burn(address(0), BURN_AMOUNT);
    }

    //////////////////////////////////////////////////////////////
    ///                 Initialization Validation              ///
    //////////////////////////////////////////////////////////////

    function test_initialize_revertsOnZeroRemoteToken() public {
        // Deploy fresh infra to access a new factory instance
        DeployScript deployer = new DeployScript();
        (,, /* bridgeLocal */, CrossChainERC20Factory factoryLocal,) = deployer.run();

        // Expect the initialize validation to bubble up through the factory deployment
        vm.expectRevert(CrossChainERC20.ZeroAddress.selector);
        factoryLocal.deploy(bytes32(0), TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS);
    }

    function test_burn_revert_fromUser() public {
        // Mint tokens first
        vm.prank(address(bridge));
        token.mint(user1, MINT_AMOUNT);

        // User tries to burn their own tokens (should fail)
        vm.prank(user1);
        vm.expectRevert(CrossChainERC20.SenderIsNotBridge.selector);
        token.burn(user1, BURN_AMOUNT);
    }

    function test_burn_revert_insufficientBalance() public {
        // Mint less than we want to burn
        vm.prank(address(bridge));
        token.mint(user1, BURN_AMOUNT - 1);

        // Try to burn more than balance (should revert due to ERC20 logic)
        vm.prank(address(bridge));
        vm.expectRevert(); // ERC20 will revert with arithmetic error
        token.burn(user1, BURN_AMOUNT);
    }

    function test_burn_eventEmission() public {
        // Mint tokens first
        vm.prank(address(bridge));
        token.mint(user1, MINT_AMOUNT);

        // Burn and check event
        vm.prank(address(bridge));
        vm.expectEmit(address(token));
        emit CrossChainERC20.Burn(user1, BURN_AMOUNT);

        token.burn(user1, BURN_AMOUNT);
    }

    //////////////////////////////////////////////////////////////
    ///                   Access Control Tests                 ///
    //////////////////////////////////////////////////////////////

    function test_onlyBridge_modifier_allowsBridge() public {
        vm.prank(address(bridge));
        token.mint(user1, MINT_AMOUNT);
        // Should succeed without revert
    }

    function test_onlyBridge_modifier_rejectsNonBridge() public {
        address[] memory nonBridgeAddresses = new address[](2);
        nonBridgeAddresses[0] = user1;
        nonBridgeAddresses[1] = user2;

        for (uint256 i = 0; i < nonBridgeAddresses.length; i++) {
            vm.prank(nonBridgeAddresses[i]);
            vm.expectRevert(CrossChainERC20.SenderIsNotBridge.selector);
            token.mint(user1, MINT_AMOUNT);

            vm.prank(nonBridgeAddresses[i]);
            vm.expectRevert(CrossChainERC20.SenderIsNotBridge.selector);
            token.burn(user1, BURN_AMOUNT);
        }
    }

    //////////////////////////////////////////////////////////////
    ///                    Integration Tests                   ///
    //////////////////////////////////////////////////////////////

    function test_mintAndBurn_integration() public {
        vm.startPrank(address(bridge));

        // Initial state
        assertEq(token.balanceOf(user1), 0);
        assertEq(token.totalSupply(), 0);

        // Mint tokens
        token.mint(user1, MINT_AMOUNT);
        assertEq(token.balanceOf(user1), MINT_AMOUNT);
        assertEq(token.totalSupply(), MINT_AMOUNT);

        // Burn partial amount
        token.burn(user1, BURN_AMOUNT);
        assertEq(token.balanceOf(user1), MINT_AMOUNT - BURN_AMOUNT);
        assertEq(token.totalSupply(), MINT_AMOUNT - BURN_AMOUNT);

        // Burn remaining amount
        token.burn(user1, MINT_AMOUNT - BURN_AMOUNT);
        assertEq(token.balanceOf(user1), 0);
        assertEq(token.totalSupply(), 0);

        vm.stopPrank();
    }

    function test_erc20_standardFunctionality() public {
        // Mint tokens to user1
        vm.prank(address(bridge));
        token.mint(user1, MINT_AMOUNT);

        // Test transfer
        vm.prank(user1);
        token.transfer(user2, BURN_AMOUNT);

        assertEq(token.balanceOf(user1), MINT_AMOUNT - BURN_AMOUNT);
        assertEq(token.balanceOf(user2), BURN_AMOUNT);
        assertEq(token.totalSupply(), MINT_AMOUNT);

        // Test approve and transferFrom
        vm.prank(user2);
        token.approve(user1, BURN_AMOUNT / 2);

        vm.prank(user1);
        token.transferFrom(user2, user1, BURN_AMOUNT / 2);

        assertEq(token.balanceOf(user1), MINT_AMOUNT - BURN_AMOUNT + BURN_AMOUNT / 2);
        assertEq(token.balanceOf(user2), BURN_AMOUNT - BURN_AMOUNT / 2);
    }

    //////////////////////////////////////////////////////////////
    ///                      Fuzz Tests                        ///
    //////////////////////////////////////////////////////////////

    function testFuzz_mint_validAddressAndAmount(address to, uint256 amount) public {
        vm.assume(to != address(0));

        vm.prank(address(bridge));
        token.mint(to, amount);

        assertEq(token.balanceOf(to), amount);
        assertEq(token.totalSupply(), amount);
    }

    function testFuzz_burn_validAddressAndAmount(address from, uint256 mintAmount, uint256 burnAmount) public {
        vm.assume(from != address(0));
        vm.assume(burnAmount <= mintAmount);

        vm.startPrank(address(bridge));

        token.mint(from, mintAmount);
        token.burn(from, burnAmount);

        assertEq(token.balanceOf(from), mintAmount - burnAmount);
        assertEq(token.totalSupply(), mintAmount - burnAmount);

        vm.stopPrank();
    }

    function testFuzz_onlyBridge_rejectsRandomAddresses(address caller, uint256 amount) public {
        vm.assume(caller != address(bridge));

        vm.prank(caller);
        vm.expectRevert(CrossChainERC20.SenderIsNotBridge.selector);
        token.mint(user1, amount);

        vm.prank(caller);
        vm.expectRevert(CrossChainERC20.SenderIsNotBridge.selector);
        token.burn(user1, amount);
    }

    //////////////////////////////////////////////////////////////
    ///                     Edge Case Tests                    ///
    //////////////////////////////////////////////////////////////

    function test_extremeValues() public {
        vm.startPrank(address(bridge));

        // Test minting maximum uint256
        token.mint(user1, type(uint256).max);
        assertEq(token.balanceOf(user1), type(uint256).max);

        // Test burning maximum uint256
        token.burn(user1, type(uint256).max);
        assertEq(token.balanceOf(user1), 0);

        vm.stopPrank();
    }
}
