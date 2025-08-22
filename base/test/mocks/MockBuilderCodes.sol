// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IBuilderCodes} from "../../src/interfaces/IBuilderCodes.sol";

contract MockBuilderCodes is IBuilderCodes {
    mapping(uint256 tokenId => address owner) private _owners;
    mapping(uint256 tokenId => address payoutAddr) private _payoutAddresses;

    function setOwner(uint256 tokenId, address owner) external {
        _owners[tokenId] = owner;
    }

    function setPayoutAddress(uint256 tokenId, address payoutAddr) external {
        _payoutAddresses[tokenId] = payoutAddr;
    }

    function ownerOf(uint256 tokenId) external view override returns (address) {
        return _owners[tokenId];
    }

    function payoutAddress(uint256 tokenId) external view override returns (address) {
        return _payoutAddresses[tokenId];
    }
}
