// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {TokenLib} from "../../src/libraries/TokenLib.sol";
import {BuilderCode} from "../../src/periphery/BuilderCode.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {LibString} from "solady/utils/LibString.sol";

contract BuilderCodeTest is Test {
    //////////////////////////////////////////////////////////////
    ///                       Test Setup                       ///
    //////////////////////////////////////////////////////////////

    // Contract under test
    BuilderCode public builderCode;

    // Mock contracts
    MockERC20 public mockToken;

    // Test addresses
    address public owner = makeAddr("owner");
    address public feeRecipient = makeAddr("feeRecipient");
    address public user = makeAddr("user");
    address public otherUser = makeAddr("otherUser");

    // Test constants
    bytes32 public constant TEST_CODE = keccak256("test_code");
    bytes32 public constant OTHER_CODE = keccak256("other_code");
    uint256 public constant VALID_FEE_PERCENT = 100; // 1.00%
    uint256 public constant TEST_AMOUNT = 1000e18;

    function setUp() public {
        builderCode = new BuilderCode("Builder Codes", "BCODE");
        mockToken = new MockERC20("Mock Token", "MOCK", 18);

        // Set up balances
        vm.deal(user, 100 ether);
        mockToken.mint(user, TEST_AMOUNT);
    }

    //////////////////////////////////////////////////////////////
    ///                   constructor Tests                    ///
    //////////////////////////////////////////////////////////////

    function test_constructor_setsNameAndSymbol() public view {
        assertEq(builderCode.name(), "Builder Codes");
        assertEq(builderCode.symbol(), "BCODE");
    }

    function test_constructor_disablesInitializers() public {
        // Should revert because initializers are disabled in constructor
        vm.expectRevert();
        builderCode.initialize("https://example.com/");
    }

    //////////////////////////////////////////////////////////////
    ///                   receive Tests                        ///
    //////////////////////////////////////////////////////////////

    function test_receive_acceptsEther() public {
        uint256 sendAmount = 1 ether;

        (bool success,) = address(builderCode).call{value: sendAmount}("");

        assertTrue(success);
        assertEq(address(builderCode).balance, sendAmount);
    }

    //////////////////////////////////////////////////////////////
    ///               registerBuilderCode Tests                ///
    //////////////////////////////////////////////////////////////

    function test_registerBuilderCode_success() public {
        BuilderCode.Registration memory registration =
            BuilderCode.Registration({recipient: feeRecipient, feePercent: VALID_FEE_PERCENT});

        vm.expectEmit(true, false, false, true);
        emit BuilderCode.BuilderCodeRegistered({code: TEST_CODE, registration: registration});

        vm.prank(owner);
        builderCode.registerBuilderCode({code: TEST_CODE, registration: registration});

        // Verify registration was stored
        (address storedRecipient, uint256 storedFeePercent) = builderCode.registrations(TEST_CODE);
        assertEq(storedRecipient, feeRecipient);
        assertEq(storedFeePercent, VALID_FEE_PERCENT);

        // Verify NFT was minted to the sender
        assertEq(builderCode.ownerOf(uint256(TEST_CODE)), owner);
    }

    function test_registerBuilderCode_revertsWhenAlreadyRegistered() public {
        BuilderCode.Registration memory registration =
            BuilderCode.Registration({recipient: feeRecipient, feePercent: VALID_FEE_PERCENT});

        // Register once
        vm.prank(owner);
        builderCode.registerBuilderCode({code: TEST_CODE, registration: registration});

        // Try to register again
        vm.expectRevert(BuilderCode.AlreadyRegistered.selector);
        vm.prank(owner);
        builderCode.registerBuilderCode({code: TEST_CODE, registration: registration});
    }

    function test_registerBuilderCode_revertsWhenInvalidRegistration() public {
        BuilderCode.Registration memory registration =
            BuilderCode.Registration({recipient: feeRecipient, feePercent: VALID_FEE_PERCENT});

        // Test invalid recipient
        registration.recipient = address(0);
        vm.expectRevert(BuilderCode.RecipientCannotBeZeroAddress.selector);
        vm.prank(owner);
        builderCode.registerBuilderCode({code: TEST_CODE, registration: registration});

        // Reset to valid and test invalid fee percent (zero)
        registration.recipient = feeRecipient;
        registration.feePercent = 0;
        vm.expectRevert(BuilderCode.InvalidFeePercent.selector);
        vm.prank(owner);
        builderCode.registerBuilderCode({code: TEST_CODE, registration: registration});

        // Reset to valid and test invalid fee percent (too high)
        registration.feePercent = builderCode.MAX_FEE_PERCENT() + 1;
        vm.expectRevert(BuilderCode.InvalidFeePercent.selector);
        vm.prank(owner);
        builderCode.registerBuilderCode({code: TEST_CODE, registration: registration});
    }

    //////////////////////////////////////////////////////////////
    ///               updateRegistration Tests                 ///
    //////////////////////////////////////////////////////////////

    function test_updateRegistration_success() public {
        // First register
        BuilderCode.Registration memory originalRegistration =
            BuilderCode.Registration({recipient: feeRecipient, feePercent: VALID_FEE_PERCENT});
        vm.prank(owner);
        builderCode.registerBuilderCode({code: TEST_CODE, registration: originalRegistration});

        // Update registration
        address newRecipient = makeAddr("newRecipient");
        uint256 newFeePercent = 150; // 1.50%
        BuilderCode.Registration memory newRegistration =
            BuilderCode.Registration({recipient: newRecipient, feePercent: newFeePercent});

        vm.expectEmit(true, false, false, true);
        emit BuilderCode.BuilderCodeUpdated({code: TEST_CODE, registration: newRegistration});

        vm.prank(owner);
        builderCode.updateRegistration({code: TEST_CODE, registration: newRegistration});

        // Verify update
        (address storedRecipient, uint256 storedFeePercent) = builderCode.registrations(TEST_CODE);
        assertEq(storedRecipient, newRecipient);
        assertEq(storedFeePercent, newFeePercent);

        // Verify ownership is still correct
        assertEq(builderCode.ownerOf(uint256(TEST_CODE)), owner);
    }

    function test_updateRegistration_revertsWhenNotOwner() public {
        // Register first
        BuilderCode.Registration memory registration =
            BuilderCode.Registration({recipient: feeRecipient, feePercent: VALID_FEE_PERCENT});
        vm.prank(owner);
        builderCode.registerBuilderCode({code: TEST_CODE, registration: registration});

        // Try to update as non-owner
        vm.expectRevert(BuilderCode.SenderIsNotOwner.selector);
        vm.prank(otherUser);
        builderCode.updateRegistration({code: TEST_CODE, registration: registration});
    }

    function test_updateRegistration_revertsWithInvalidRegistration() public {
        // Register first
        BuilderCode.Registration memory registration =
            BuilderCode.Registration({recipient: feeRecipient, feePercent: VALID_FEE_PERCENT});
        vm.prank(owner);
        builderCode.registerBuilderCode({code: TEST_CODE, registration: registration});

        // Create valid registration for updates
        BuilderCode.Registration memory updateRegistration =
            BuilderCode.Registration({recipient: feeRecipient, feePercent: VALID_FEE_PERCENT});

        // Test invalid recipient
        updateRegistration.recipient = address(0);
        vm.expectRevert(BuilderCode.RecipientCannotBeZeroAddress.selector);
        vm.prank(owner);
        builderCode.updateRegistration({code: TEST_CODE, registration: updateRegistration});

        // Reset to valid and test invalid fee percent (zero)
        updateRegistration.recipient = feeRecipient;
        updateRegistration.feePercent = 0;
        vm.expectRevert(BuilderCode.InvalidFeePercent.selector);
        vm.prank(owner);
        builderCode.updateRegistration({code: TEST_CODE, registration: updateRegistration});

        // Reset to valid and test invalid fee percent (too high)
        updateRegistration.feePercent = builderCode.MAX_FEE_PERCENT() + 1;
        vm.expectRevert(BuilderCode.InvalidFeePercent.selector);
        vm.prank(owner);
        builderCode.updateRegistration({code: TEST_CODE, registration: updateRegistration});
    }

    //////////////////////////////////////////////////////////////
    ///                 useBuilderCode Tests                   ///
    //////////////////////////////////////////////////////////////

    function test_useBuilderCode_withETH() public {
        // Register builder code
        BuilderCode.Registration memory registration = BuilderCode.Registration({
            recipient: feeRecipient,
            feePercent: VALID_FEE_PERCENT // 1%
        });
        vm.prank(owner);
        builderCode.registerBuilderCode({code: TEST_CODE, registration: registration});

        // Calculate expected fees: 1% of 10 ETH = 0.1 ETH
        uint256 ethAmount = 10 ether;
        uint256 expectedFees = (ethAmount * VALID_FEE_PERCENT) / builderCode.FEE_PERCENT_DIVISOR();

        uint256 feeRecipientInitialBalance = feeRecipient.balance;
        uint256 userInitialBalance = user.balance;

        vm.expectEmit(true, true, true, true);
        emit BuilderCode.BuilderCodeUsed({
            code: TEST_CODE,
            token: TokenLib.ETH_ADDRESS,
            recipient: user,
            balance: ethAmount,
            fees: expectedFees
        });

        vm.prank(user);
        builderCode.useBuilderCode{value: ethAmount}({code: TEST_CODE, token: TokenLib.ETH_ADDRESS, recipient: user});

        // Verify balances
        assertEq(feeRecipient.balance, feeRecipientInitialBalance + expectedFees);
        assertEq(user.balance, userInitialBalance - expectedFees);
        assertEq(address(builderCode).balance, 0);
    }

    function test_useBuilderCode_withERC20() public {
        // Register builder code
        BuilderCode.Registration memory registration = BuilderCode.Registration({
            recipient: feeRecipient,
            feePercent: VALID_FEE_PERCENT // 1%
        });
        vm.prank(owner);
        builderCode.registerBuilderCode({code: TEST_CODE, registration: registration});

        // Send tokens to contract
        uint256 tokenAmount = 1000e18;
        vm.prank(user);
        mockToken.transfer(address(builderCode), tokenAmount);

        // Calculate expected fees: 1% of 1000 tokens = 10 tokens
        uint256 expectedFees = (tokenAmount * VALID_FEE_PERCENT) / builderCode.FEE_PERCENT_DIVISOR();
        uint256 expectedRemaining = tokenAmount - expectedFees;

        vm.expectEmit(true, true, true, true);
        emit BuilderCode.BuilderCodeUsed({
            code: TEST_CODE,
            token: address(mockToken),
            recipient: user,
            balance: tokenAmount,
            fees: expectedFees
        });

        vm.prank(user);
        builderCode.useBuilderCode({code: TEST_CODE, token: address(mockToken), recipient: user});

        // Verify balances
        assertEq(mockToken.balanceOf(feeRecipient), expectedFees);
        assertEq(mockToken.balanceOf(user), expectedRemaining);
        assertEq(mockToken.balanceOf(address(builderCode)), 0);
    }

    function test_useBuilderCode_revertsWhenCodeNotRegistered() public {
        vm.expectRevert(BuilderCode.CodeNotRegistered.selector);
        builderCode.useBuilderCode({code: TEST_CODE, token: TokenLib.ETH_ADDRESS, recipient: user});
    }

    function test_useBuilderCode_revertsWhenBalanceIsZero() public {
        // Register builder code
        BuilderCode.Registration memory registration =
            BuilderCode.Registration({recipient: feeRecipient, feePercent: VALID_FEE_PERCENT});
        vm.prank(owner);
        builderCode.registerBuilderCode({code: TEST_CODE, registration: registration});

        // Contract has no ETH balance (0 by default)
        vm.expectRevert(BuilderCode.BalanceIsZero.selector);
        vm.prank(user);
        builderCode.useBuilderCode({code: TEST_CODE, token: TokenLib.ETH_ADDRESS, recipient: user});
    }

    function test_useBuilderCode_revertsWhenERC20BalanceIsZero() public {
        // Register builder code
        BuilderCode.Registration memory registration =
            BuilderCode.Registration({recipient: feeRecipient, feePercent: VALID_FEE_PERCENT});
        vm.prank(owner);
        builderCode.registerBuilderCode({code: TEST_CODE, registration: registration});

        // Contract has no token balance
        vm.expectRevert(BuilderCode.BalanceIsZero.selector);
        vm.prank(user);
        builderCode.useBuilderCode({code: TEST_CODE, token: address(mockToken), recipient: user});
    }

    function test_useBuilderCode_calculatesFeesCorrectly() public {
        // Register builder code with 2% fee (max)
        BuilderCode.Registration memory registration = BuilderCode.Registration({
            recipient: feeRecipient,
            feePercent: builderCode.MAX_FEE_PERCENT() // 2%
        });
        vm.prank(owner);
        builderCode.registerBuilderCode({code: TEST_CODE, registration: registration});

        // Expected: 2% of 100 ETH = 2 ETH fees, 98 ETH remaining
        uint256 ethAmount = 100 ether;
        uint256 expectedFees = 2 ether;
        uint256 expectedRemaining = 98 ether;

        vm.prank(user);
        builderCode.useBuilderCode{value: ethAmount}({code: TEST_CODE, token: TokenLib.ETH_ADDRESS, recipient: user});

        assertEq(feeRecipient.balance, expectedFees);
        assertEq(user.balance, expectedRemaining);
    }
}
