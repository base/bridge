// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LibClone} from "solady/utils/LibClone.sol";

import {CrossChainERC20} from "./CrossChainERC20.sol";

/// @title CrossChainERC20Factory
///
/// @notice Factory contract for deploying ERC-1967 beacon proxies of CrossChainERC20 tokens.
contract CrossChainERC20Factory {
    //////////////////////////////////////////////////////////////
    ///                       Events                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Emitted when a CrossChainERC20 token is successfully deployed
    ///
    /// @dev The salt used for CREATE2 is derived from keccak256(abi.encode(remoteToken, name, symbol, decimals))
    ///
    /// @param localToken  Address of the newly deployed CrossChainERC20 contract on this chain
    /// @param remoteToken The 32-byte identifier of the corresponding token on the remote chain
    /// @param deployer    Address of the account that initiated the token deployment
    event CrossChainERC20Created(address indexed localToken, bytes32 indexed remoteToken, address deployer);

    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice Address of the CrossChainERC20 beacon proxy.
    address public immutable BEACON;

    //////////////////////////////////////////////////////////////
    ///                       Storage                          ///
    //////////////////////////////////////////////////////////////

    /// @notice Mapping of token addresses to boolean values indicating whether they have been deployed by this factory
    ///         and thus have cross-chain functionality.
    mapping(address token => bool isCrossChainErc20) public isCrossChainErc20;

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @notice Constructs the CrossChainERC20Factory contract
    ///
    /// @dev Disables initializers to prevent the implementation contract from being initialized
    constructor(address beacon) {
        BEACON = beacon;
    }

    /// @notice Deploys a new CrossChainERC20 token with deterministic address using CREATE2
    ///
    /// @dev Uses CREATE2 with a salt derived from token parameters to ensure deterministic addresses.
    ///      The same parameters will always result in the same deployment address.
    ///      Deploys the proxy and initializes it with the provided parameters.
    ///      Emits CrossChainERC20Created event upon successful deployment.
    ///
    /// @param remoteToken The 32-byte identifier of the corresponding token on the remote chain
    /// @param name The human-readable name of the token (e.g., "My Token")
    /// @param symbol The symbol of the token (e.g., "MTK")
    /// @param decimals The number of decimal places the token uses
    ///
    /// @return crossChainERC20 The address of the newly deployed CrossChainERC20 contract
    function deploy(bytes32 remoteToken, string memory name, string memory symbol, uint8 decimals)
        external
        returns (address crossChainERC20)
    {
        bytes32 salt = keccak256(abi.encode(remoteToken, name, symbol, decimals));
        address localToken = LibClone.deployDeterministicERC1967BeaconProxy({beacon: BEACON, salt: salt});

        // Initialize the deployed proxy with the token parameters
        CrossChainERC20(localToken).initialize({
            remoteToken_: remoteToken,
            name_: name,
            symbol_: symbol,
            decimals_: decimals
        });

        isCrossChainErc20[localToken] = true;

        emit CrossChainERC20Created({localToken: localToken, remoteToken: remoteToken, deployer: msg.sender});

        return localToken;
    }
}
