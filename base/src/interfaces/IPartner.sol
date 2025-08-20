// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Expose a list of signers with key rotation support.
interface IPartner {
    /// @notice Each signer entity always has [1, 2] keys.
    struct Signer {
        // Regular active EVM address of the signer.
        address evmAddress;
        // New candidate EVM address that each signer will sign with during key rotation.
        // Upon completion of rotation, this will be promoted to evm_address.
        address newEvmAddress;
    }

    /// @notice Returns the full signer set.
    function getSigners() external view returns (Signer[] memory signers);
}
