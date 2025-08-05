// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {Call, CallLib, CallType} from "../../src/libraries/CallLib.sol";
import {TestDelegateTarget} from "../mocks/TestDelegateTarget.sol";
import {TestTarget} from "../mocks/TestTarget.sol";

contract CallLibTest is Test {
    using CallLib for Call;

    // Test target contracts
    TestTarget public testTarget;
    TestDelegateTarget public delegateTarget;

    function setUp() public {
        testTarget = new TestTarget();
        delegateTarget = new TestDelegateTarget();
    }

    //////////////////////////////////////////////////////////////
    ///                   Call Type Tests                      ///
    //////////////////////////////////////////////////////////////

    function test_execute_call_success() public {
        Call memory call = Call({
            ty: CallType.Call,
            to: address(testTarget),
            value: 0,
            data: abi.encodeWithSelector(TestTarget.setValue.selector, 42)
        });

        call.execute();
        assertEq(testTarget.value(), 42);
    }

    function test_execute_call_withValue(uint128 amount) public {
        vm.assume(amount >= 0 && amount < 100 ether);
        vm.deal(address(this), amount);
        Call memory call = Call({
            ty: CallType.Call,
            to: address(testTarget),
            value: amount,
            data: abi.encodeWithSelector(TestTarget.setValue.selector, 123)
        });

        call.execute();
        assertEq(testTarget.value(), 123);
        assertEq(address(testTarget).balance, amount);
    }

    function test_execute_call_revertOnFailure() public {
        Call memory call = Call({
            ty: CallType.Call,
            to: address(testTarget),
            value: 0,
            data: abi.encodeWithSelector(TestTarget.alwaysReverts.selector)
        });

        vm.expectRevert("Always reverts");
        call.execute();
    }

    //////////////////////////////////////////////////////////////
    ///                DelegateCall Type Tests                 ///
    //////////////////////////////////////////////////////////////

    function test_execute_delegateCall_success() public {
        Call memory call = Call({
            ty: CallType.DelegateCall,
            to: address(delegateTarget),
            value: 0,
            data: abi.encodeWithSelector(TestDelegateTarget.setStorageValue.selector, 999)
        });

        call.execute();

        // Check that the storage was modified in this contract's context
        uint256 value;
        assembly {
            value := sload(0)
        }
        assertEq(value, 999);
    }

    /// forge-config: default.allow_internal_expect_revert = true
    function test_execute_delegateCall_revertWithValue() public {
        Call memory call = Call({
            ty: CallType.DelegateCall,
            to: address(delegateTarget),
            value: 1 ether,
            data: abi.encodeWithSelector(TestDelegateTarget.setStorageValue.selector, 999)
        });

        // This should revert with DelegateCallCannotHaveValue
        vm.expectRevert(CallLib.DelegateCallCannotHaveValue.selector);
        call.execute();
    }

    function test_execute_delegateCall_revertOnFailure() public {
        Call memory call = Call({
            ty: CallType.DelegateCall,
            to: address(delegateTarget),
            value: 0,
            data: abi.encodeWithSelector(TestDelegateTarget.alwaysReverts.selector)
        });

        vm.expectRevert("Delegate reverts");
        call.execute();
    }

    //////////////////////////////////////////////////////////////
    ///                  Create Type Tests                     ///
    //////////////////////////////////////////////////////////////

    function test_execute_create_success() public {
        // Bytecode for a simple contract that stores a value
        bytes memory bytecode = abi.encodePacked(
            hex"608060405234801561001057600080fd5b506040516020806100ed8339810180604052810190808051906020019092919050505080600081905550506100ac806100416000396000f300608060405260043610603f576000357c0100000000000000000000000000000000000000000000000000000000900463ffffffff1680633fa4f245146044575b600080fd5b348015604f57600080fd5b506056606c565b6040518082815260200191505060405180910390f35b600054815600a165627a7a72305820",
            abi.encode(uint256(42))
        );

        vm.deal(address(this), 1 ether);

        Call memory call = Call({
            ty: CallType.Create,
            to: address(0), // Ignored for create
            value: 0,
            data: bytecode
        });

        // Use Foundry's utility to compute the expected CREATE address
        address expectedAddress = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));

        // Check code size of expected address is zero before deployment
        uint256 beforeDeployedCodeSize;
        assembly {
            beforeDeployedCodeSize := extcodesize(expectedAddress)
        }
        assertEq(beforeDeployedCodeSize, 0, "Code size of expected CREATE address should be zero");

        call.execute();

        // Verify that code was actually deployed at the deterministic address
        uint256 afterDeployedCodeSize;
        assembly {
            afterDeployedCodeSize := extcodesize(expectedAddress)
        }
        assertGt(afterDeployedCodeSize, 0, "No code deployed at expected CREATE address");
    }

    function test_execute_create_withValue() public {
        // Simple bytecode that deploys a minimal contract
        bytes memory bytecode = hex"600a600c600039600a6000f3602a60805260206080f3";

        vm.deal(address(this), 1 ether);

        Call memory call = Call({ty: CallType.Create, to: address(0), value: 0.5 ether, data: bytecode});

        call.execute();
    }

    function test_execute_create_revertOnFailure() public {
        // Invalid bytecode that will cause create to fail
        bytes memory invalidBytecode = hex"ff";

        Call memory call = Call({ty: CallType.Create, to: address(0), value: 0, data: invalidBytecode});

        vm.expectRevert();
        call.execute();
    }

    function test_execute_create_revertOnZeroResult() public {
        // Use bytecode that reverts in constructor - this should cause CREATE to return 0.
        bytes memory revertingConstructor = hex"6000600060006000600060006000fd"; // Assembly that immediately reverts

        Call memory call = Call({ty: CallType.Create, to: address(0), value: 0, data: revertingConstructor});

        // This should trigger the zero result revert condition in CREATE assembly.
        vm.expectRevert();
        call.execute();
    }

    //////////////////////////////////////////////////////////////
    ///                 Create2 Type Tests                     ///
    //////////////////////////////////////////////////////////////

    function test_execute_create2_success() public {
        bytes32 salt = keccak256("test_salt");
        bytes memory bytecode =
            hex"60806040526000805534801561001457600080fd5b50603f806100236000396000f3fe6080604052600080fd";

        vm.deal(address(this), 1 ether);

        Call memory call = Call({
            ty: CallType.Create2,
            to: address(0), // Ignored for create2
            value: 0,
            data: abi.encode(salt, bytecode)
        });

        // Use Foundry's utility to compute the expected CREATE2 address
        address expectedAddress = vm.computeCreate2Address(salt, keccak256(bytecode), address(this));

        // Check code size of expected address is zero before deployment
        uint256 beforeDeployedCodeSize;
        assembly {
            beforeDeployedCodeSize := extcodesize(expectedAddress)
        }
        assertEq(beforeDeployedCodeSize, 0, "Code size of expected CREATE2 address should be zero");

        call.execute();

        // Verify that code was actually deployed at the deterministic address
        uint256 afterDeployedCodeSize;
        assembly {
            afterDeployedCodeSize := extcodesize(expectedAddress)
        }
        assertGt(afterDeployedCodeSize, 0, "No code deployed at expected CREATE2 address");
    }

    function test_execute_create2_withValue() public {
        bytes32 salt = keccak256("test_salt_value");
        bytes memory bytecode = hex"600a600c600039600a6000f3602a60805260206080f3";

        vm.deal(address(this), 1 ether);

        Call memory call =
            Call({ty: CallType.Create2, to: address(0), value: 0.3 ether, data: abi.encode(salt, bytecode)});

        call.execute();
    }
}
