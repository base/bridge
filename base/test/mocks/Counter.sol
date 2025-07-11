// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract Counter {
    uint256 public count;

    function increment() external {
        count++;
    }

    function incrementPayable() external payable {
        count++;
    }
}
