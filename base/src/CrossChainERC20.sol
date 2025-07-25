// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "solady/tokens/ERC20.sol";
import {Initializable} from "solady/utils/Initializable.sol";

/// @title CrossChainERC20
///
/// @notice A cross-chain ERC20 token implementation that can be minted and burned by an authorized bridge contract.
contract CrossChainERC20 is ERC20, Initializable {
    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice The bridge contract address that has minting and burning privileges.
    address private immutable _BRIDGE;

    //////////////////////////////////////////////////////////////
    ///                       Storage                          ///
    //////////////////////////////////////////////////////////////

    /// @notice The name of the token.
    string private _name;

    /// @notice The symbol of the token.
    string private _symbol;

    /// @notice The address of the corresponding token on the remote chain.
    bytes32 private _remoteToken;

    /// @notice The number of decimal places for this token.
    uint8 private _decimals;

    //////////////////////////////////////////////////////////////
    ///                       Events                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Emitted whenever tokens are minted for an account.
    ///
    /// @param to     Address of the account tokens are being minted for.
    /// @param amount Amount of tokens minted.
    event Mint(address indexed to, uint256 amount);

    /// @notice Emitted whenever tokens are burned from an account.
    ///
    /// @param from   Address of the account tokens are being burned from.
    /// @param amount Amount of tokens burned.
    event Burn(address indexed from, uint256 amount);

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when the sender is not the bridge.
    error SenderIsNotBridge();

    /// @notice Thrown when the minting to the zero address is attempted.
    error MintToZeroAddress();

    /// @notice Thrown when the burning from the zero address is attempted.
    error BurnFromZeroAddress();

    //////////////////////////////////////////////////////////////
    ///                       Modifiers                        ///
    //////////////////////////////////////////////////////////////

    /// @notice A modifier that only allows the Bridge to call.
    modifier onlyBridge() {
        require(msg.sender == _BRIDGE, SenderIsNotBridge());
        _;
    }

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @notice Constructs the CrossChainERC20 contract.
    ///
    /// @param bridge_ Address of the bridge contract that will have minting and burning privileges.
    constructor(address bridge_) {
        _BRIDGE = bridge_;
        _disableInitializers();
    }

    /// @notice Initializes the CrossChainERC20 contract.
    ///
    /// @param remoteToken_ Address of the corresponding token on the remote chain.
    /// @param name_ ERC20 name of the token.
    /// @param symbol_ ERC20 symbol of the token.
    /// @param decimals_ ERC20 decimals for the token.
    function initialize(bytes32 remoteToken_, string memory name_, string memory symbol_, uint8 decimals_)
        external
        reinitializer(1)
    {
        _remoteToken = remoteToken_;
        _decimals = decimals_;
        _name = name_;
        _symbol = symbol_;
    }

    /// @notice Returns the bridge contract address.
    ///
    /// @dev This is the only address authorized to mint and burn tokens.
    function bridge() public view returns (address) {
        return _BRIDGE;
    }

    /// @notice Returns the remote token address.
    ///
    /// @dev This represents the corresponding token on the remote chain.
    function remoteToken() public view returns (bytes32) {
        return _remoteToken;
    }

    /// @notice Returns the name of the token.
    ///
    /// @dev Overrides the ERC20 name function.
    function name() public view override returns (string memory) {
        return _name;
    }

    /// @notice Returns the symbol of the token.
    ///
    /// @dev Overrides the ERC20 symbol function.
    function symbol() public view override returns (string memory) {
        return _symbol;
    }

    /// @notice Returns the decimals places of the token.
    ///
    /// @dev Overrides the ERC20 decimals function.
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Allows the Bridge to mint tokens.
    ///
    /// @dev Only callable by the authorized bridge contract. Emits a Mint event.
    ///
    /// @param to     Address to mint tokens to.
    /// @param amount Amount of tokens to mint.
    function mint(address to, uint256 amount) external onlyBridge {
        require(to != address(0), MintToZeroAddress());

        _mint(to, amount);
        emit Mint(to, amount);
    }

    /// @notice Allows the Bridge to burn tokens.
    ///
    /// @dev Only callable by the authorized bridge contract. Emits a Burn event.
    ///
    /// @param from   Address to burn tokens from.
    /// @param amount Amount of tokens to burn.
    function burn(address from, uint256 amount) external onlyBridge {
        require(from != address(0), BurnFromZeroAddress());

        _burn(from, amount);
        emit Burn(from, amount);
    }
}
