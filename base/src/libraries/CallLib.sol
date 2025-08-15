// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Enum representing the type of call.
enum CallType {
    Call,
    DelegateCall,
    Create,
    Create2
}

/// @notice Struct representing a call to execute.
///
/// @custom:field ty The type of call.
/// @custom:field to The target address to call.
/// @custom:field gasLimit The gas limit for the call.
/// @custom:field value The value to send with the call.
/// @custom:field data The data to pass to the call.
struct Call {
    CallType ty;
    address to;
    uint128 value;
    bytes data;
}

library CallLib {
    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when the delegate call has a value.
    error DelegateCallCannotHaveValue();

    //////////////////////////////////////////////////////////////
    ///                       Internal Functions               ///
    //////////////////////////////////////////////////////////////

    function execute(Call memory call) internal {
        if (call.ty == CallType.Call) {
            (bool success, bytes memory result) = call.to.call{value: call.value}(call.data);
            require(success, string(result));
        } else if (call.ty == CallType.DelegateCall) {
            require(call.value == 0, DelegateCallCannotHaveValue());
            (bool success, bytes memory result) = call.to.delegatecall(call.data);
            require(success, string(result));
        } else if (call.ty == CallType.Create) {
            uint128 value = call.value;
            bytes memory data = call.data;
            assembly {
                let result := create(value, add(data, 0x20), mload(data))
                if iszero(result) { revert(0, 0) }
            }
        } else if (call.ty == CallType.Create2) {
            uint128 value = call.value;
            (bytes32 salt, bytes memory data) = abi.decode(call.data, (bytes32, bytes));
            assembly {
                let result := create2(value, add(data, 0x20), mload(data), salt)
                if iszero(result) { revert(0, 0) }
            }
        }
    }
}
