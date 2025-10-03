// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LibClone} from "solady/utils/LibClone.sol";

import {CrossChainERC20} from "./CrossChainERC20.sol";

/// @title CrossChainERC20Factory
///
/// @notice Factory contract for deploying ERC-1967 beacon proxies of CrossChainERC20 tokens.
contract CrossChainERC20Factory {
    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice Address of the ERC-1967 beacon contract used by deployed proxies for CrossChainERC20.
    address public immutable BEACON;

    /// @notice Special pubkey designating remote native SOL
    /// @dev This corresponds to `SoL1111111111111111111111111111111111111111` in base58
    bytes32 public constant SOL_PUBKEY = 0x069be72ab836d4eacc02525b7350a78a395da2f1253a40ebafd6630000000000;

    //////////////////////////////////////////////////////////////
    ///                       Storage                          ///
    //////////////////////////////////////////////////////////////

    /// @notice Mapping of token addresses to boolean values indicating whether they have been deployed by this factory
    ///         and thus have cross-chain functionality.
    mapping(address token => bool isCrossChainErc20) public isCrossChainErc20;

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
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when a zero address is detected
    error ZeroAddress();

    /// @notice Thrown when someone tries to deploy a native SOL wrapper. This can only be done once at contract
    ///         initialization
    error CannotWrapNativeSOL();

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @notice Stores the beacon address for proxies and reverts if the beacon is the zero address.
    ///
    /// @param beacon Address of the ERC-1967 beacon contract used by deployed proxies for CrossChainERC20.
    constructor(address beacon) {
        require(beacon != address(0), ZeroAddress());
        BEACON = beacon;
    }

    /// @notice Deploys a native SOL wrapper. Can only be called once.
    function deploySolWrapper() external returns (address) {
        return _deploy(SOL_PUBKEY, "Solana", "SOL", 9);
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
    /// @return localToken The address of the newly deployed CrossChainERC20 contract
    function deploy(bytes32 remoteToken, string memory name, string memory symbol, uint8 decimals)
        external
        returns (address)
    {
        require(remoteToken != SOL_PUBKEY, CannotWrapNativeSOL());
        return _deploy(remoteToken, name, symbol, decimals);
    }

    function _deploy(bytes32 remoteToken, string memory name, string memory symbol, uint8 decimals)
        private
        returns (address localToken)
    {
        bytes32 salt = keccak256(abi.encode(remoteToken, name, symbol, decimals));
        localToken = LibClone.deployDeterministicERC1967BeaconProxy({beacon: BEACON, salt: salt});

        isCrossChainErc20[localToken] = true;

        // Initialize the deployed proxy with the token parameters
        CrossChainERC20(localToken).initialize({
            remoteToken_: remoteToken,
            name_: name,
            symbol_: symbol,
            decimals_: decimals
        });

        emit CrossChainERC20Created({localToken: localToken, remoteToken: remoteToken, deployer: msg.sender});
    }
}
