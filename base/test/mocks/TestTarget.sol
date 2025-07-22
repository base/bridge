// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract TestTarget {
    uint256 public value;

    receive() external payable {}

    function setValue(uint256 _value) external payable {
        value = _value;
    }

    function alwaysReverts() external pure {
        revert("Always reverts");
    }
}
