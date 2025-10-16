// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {Twin} from "../src/Twin.sol";
import {Call, CallLib, CallType} from "../src/libraries/CallLib.sol";
import {TestTarget} from "./mocks/TestTarget.sol";

contract TwinTest is Test {
    Twin public twin;
    address public bridge = makeAddr("bridge");

    // Mock contracts for testing
    TestTarget public mockTarget;

    // Events (Twin doesn't emit any, but CallLib operations might trigger events from targets)
    event MockEvent(uint256 value);

    function setUp() public {
        // Deploy Twin with bridge address
        twin = new Twin(bridge);

        // Deploy mock contracts for testing
        mockTarget = new TestTarget();

        // Fund the twin contract with some ETH for testing
        vm.deal(address(twin), 10 ether);
    }

    //////////////////////////////////////////////////////////////
    ///                   Constructor Tests                    ///
    //////////////////////////////////////////////////////////////

    function test_constructor_setsBridgeCorrectly() public {
        // The constructor sets BRIDGE to msg.sender (the deployer)
        Twin testTwin = new Twin(bridge);

        // Since this test contract deployed it, BRIDGE should be set to this contract's address
        assertEq(testTwin.BRIDGE(), bridge);
    }

    function test_constructor_revertsOnZeroBridge() public {
        vm.expectRevert(Twin.ZeroAddress.selector);
        new Twin(address(0));
    }

    //////////////////////////////////////////////////////////////
    ///                   Receive Tests                        ///
    //////////////////////////////////////////////////////////////

    function test_receive_acceptsEther() public {
        uint256 initialBalance = address(twin).balance;
        uint256 sendAmount = 1 ether;

        (bool success,) = address(twin).call{value: sendAmount}("");

        assertTrue(success);
        assertEq(address(twin).balance, initialBalance + sendAmount);
    }

    function test_receive_acceptsZeroEther() public {
        uint256 initialBalance = address(twin).balance;

        (bool success,) = address(twin).call{value: 0}("");

        assertTrue(success);
        assertEq(address(twin).balance, initialBalance);
    }

    //////////////////////////////////////////////////////////////
    ///                 Execute Access Control Tests          ///
    //////////////////////////////////////////////////////////////

    function test_execute_allowsBridgeCaller() public {
        Call memory call = Call({
            ty: CallType.Call,
            to: address(mockTarget),
            value: 0,
            data: abi.encodeWithSelector(TestTarget.setValue.selector, 42)
        });

        vm.prank(bridge);
        twin.execute(call);

        assertEq(mockTarget.value(), 42);
    }

    function test_execute_allowsSelfCaller() public {
        // Create a call that will be executed by the twin calling itself
        Call memory call = Call({
            ty: CallType.Call,
            to: address(mockTarget),
            value: 0,
            data: abi.encodeWithSelector(TestTarget.setValue.selector, 123)
        });

        // Create a call to execute the above call (recursive call)
        Call memory selfCall = Call({
            ty: CallType.Call, to: address(twin), value: 0, data: abi.encodeWithSelector(Twin.execute.selector, call)
        });

        vm.prank(bridge);
        twin.execute(selfCall);

        assertEq(mockTarget.value(), 123);
    }

    function test_execute_revertsOnUnauthorizedCaller_withExpectRevert() public {
        Call memory call = Call({
            ty: CallType.Call,
            to: address(mockTarget),
            value: 0,
            data: abi.encodeWithSelector(TestTarget.setValue.selector, 42)
        });

        vm.expectRevert(Twin.Unauthorized.selector);
        twin.execute(call);
    }

    //////////////////////////////////////////////////////////////
    ///              Execute Call Type Tests                   ///
    //////////////////////////////////////////////////////////////

    function test_execute_regularCall_success() public {
        Call memory call = Call({
            ty: CallType.Call,
            to: address(mockTarget),
            value: 0,
            data: abi.encodeWithSelector(TestTarget.setValue.selector, 999)
        });

        vm.prank(bridge);
        twin.execute(call);

        assertEq(mockTarget.value(), 999);
    }

    function test_execute_regularCall_withValue() public {
        uint256 initialBalance = address(mockTarget).balance;
        uint256 sendValue = 1 ether;

        Call memory call = Call({
            ty: CallType.Call,
            to: address(mockTarget),
            value: uint128(sendValue),
            data: abi.encodeWithSelector(TestTarget.setValue.selector, 555)
        });

        vm.prank(bridge);
        twin.execute(call);

        assertEq(mockTarget.value(), 555);
        assertEq(address(mockTarget).balance, initialBalance + sendValue);
    }

    function test_execute_regularCall_revertsOnTargetRevert() public {
        Call memory call = Call({
            ty: CallType.Call,
            to: address(mockTarget),
            value: 0,
            data: abi.encodeWithSelector(TestTarget.alwaysReverts.selector)
        });

        vm.prank(bridge);
        vm.expectRevert();
        twin.execute(call);
    }

    function test_execute_delegateCall_success() public {
        Call memory call = Call({
            ty: CallType.DelegateCall,
            to: address(mockTarget),
            value: 0,
            data: abi.encodeWithSelector(TestTarget.setStorageSlot.selector, 42)
        });

        vm.prank(bridge);
        twin.execute(call);

        // Check that the storage was set in the Twin contract's context
        bytes32 slot = vm.load(address(twin), bytes32(uint256(0)));
        assertEq(uint256(slot), 42);
    }

    function test_execute_delegateCall_revertsWithValue() public {
        Call memory call = Call({
            ty: CallType.DelegateCall,
            to: address(mockTarget),
            value: 1, // This should cause a revert
            data: abi.encodeWithSelector(TestTarget.setStorageSlot.selector, 42)
        });

        vm.prank(bridge);
        vm.expectRevert(CallLib.DelegateCallCannotHaveValue.selector);
        twin.execute(call);
    }

    function test_execute_create_success() public {
        // Simple contract bytecode: empty contract that compiles successfully
        bytes memory bytecode =
            hex"6080604052348015600f57600080fd5b50603f80601d6000396000f3fe6080604052600080fdfea26469706673582212200000000000000000000000000000000000000000000000000000000000000000000064736f6c63430008000033";

        Call memory call = Call({
            ty: CallType.Create,
            to: address(0), // Not used for CREATE
            value: 0,
            data: bytecode
        });

        vm.prank(bridge);
        twin.execute(call);

        // If we reach here, the CREATE was successful
        assertTrue(true);
    }

    function test_execute_create2_success() public {
        bytes32 salt = keccak256("test_salt");
        bytes memory bytecode =
            hex"6080604052348015600f57600080fd5b50603f80601d6000396000f3fe6080604052600080fdfea26469706673582212200000000000000000000000000000000000000000000000000000000000000000000064736f6c63430008000033";

        Call memory call = Call({
            ty: CallType.Create2,
            to: address(0), // Not used for CREATE2
            value: 0,
            data: abi.encode(salt, bytecode)
        });

        vm.prank(bridge);
        twin.execute(call);

        // If we reach here, the CREATE2 was successful
        assertTrue(true);
    }

    //////////////////////////////////////////////////////////////
    ///                   Edge Case Tests                      ///
    //////////////////////////////////////////////////////////////

    function test_execute_withMaxValue() public {
        // Test with maximum uint128 value
        Call memory call = Call({
            ty: CallType.Call,
            to: address(mockTarget),
            value: type(uint128).max,
            data: abi.encodeWithSelector(TestTarget.setValue.selector, 1)
        });

        // This should revert due to insufficient balance
        vm.expectRevert();
        twin.execute(call);
    }

    function test_execute_withEmptyData() public {
        Call memory call = Call({ty: CallType.Call, to: address(mockTarget), value: 0, data: ""});

        vm.prank(bridge);
        twin.execute(call);

        // Should succeed (calls fallback/receive)
        assertTrue(true);
    }

    function test_execute_toNonContract() public {
        address nonContract = makeAddr("nonContract");

        Call memory call = Call({ty: CallType.Call, to: nonContract, value: 1 ether, data: ""});

        vm.prank(bridge);
        twin.execute(call);

        assertEq(nonContract.balance, 1 ether);
    }

    //////////////////////////////////////////////////////////////
    ///                 Gas Estimation Tests                   ///
    //////////////////////////////////////////////////////////////

    function test_execute_gasUsage() public {
        Call memory call = Call({
            ty: CallType.Call,
            to: address(mockTarget),
            value: 0,
            data: abi.encodeWithSelector(TestTarget.setValue.selector, 42)
        });

        uint256 gasBefore = gasleft();
        vm.prank(bridge);
        twin.execute(call);
        uint256 gasUsed = gasBefore - gasleft();

        // Should use reasonable amount of gas (this is just a sanity check)
        assertLt(gasUsed, 100000);
    }

    //////////////////////////////////////////////////////////////
    ///                 Fuzz Tests                             ///
    //////////////////////////////////////////////////////////////

    function testFuzz_execute_regularCall_withDifferentValues(uint128 value, uint256 setValue) public {
        vm.assume(value <= address(twin).balance);

        Call memory call = Call({
            ty: CallType.Call,
            to: address(mockTarget),
            value: value,
            data: abi.encodeWithSelector(TestTarget.setValue.selector, setValue)
        });

        uint256 initialBalance = address(mockTarget).balance;

        vm.prank(bridge);
        twin.execute(call);

        assertEq(mockTarget.value(), setValue);
        assertEq(address(mockTarget).balance, initialBalance + value);
    }
}
