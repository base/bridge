// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract TestDelegateTarget {
    function setStorageValue(uint256 _value) external {
        assembly {
            sstore(0, _value)
        }
    }

    function alwaysReverts() external pure {
        revert("Delegate reverts");
    }
}
