// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title Builder Codes
///
/// @notice BuilderCodes interface used by the BridgeRewards contract.
interface IBuilderCodes {
    /// @notice Gets the owner of a builder code.
    ///
    /// @param tokenId Token ID of the builder code.
    ///
    /// @return The owner of the builder code
    function ownerOf(uint256 tokenId) external view returns (address);

    /// @notice Gets the default payout address for a builder code.
    ///
    /// @param tokenId Token ID of the builder code.
    ///
    /// @return The default payout address
    function payoutAddress(uint256 tokenId) external view returns (address);
}
