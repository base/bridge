// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockERC20} from "./MockERC20.sol";

// Mock ERC20 with transfer fees for testing
contract MockFeeERC20 is MockERC20 {
    uint256 public feePercent = 100; // 1% fee (100 basis points)

    constructor(string memory _name, string memory _symbol, uint8 _decimals) MockERC20(_name, _symbol, _decimals) {}

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");

        uint256 fee = (amount * feePercent) / 10000;
        uint256 actualAmount = amount - fee;

        balanceOf[from] -= amount;
        balanceOf[to] += actualAmount;
        allowance[from][msg.sender] -= amount;
        return true;
    }
}
