// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "solady/tokens/ERC20.sol";
import {ERC721} from "solady/tokens/ERC721.sol";

import {Initializable} from "solady/utils/Initializable.sol";
import {LibString} from "solady/utils/LibString.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

import {TokenLib} from "../libraries/TokenLib.sol";

/// @title Builder Code
///
/// @notice A contract for registering and using builder codes.
contract BuilderCode is ERC721, Initializable {
    //////////////////////////////////////////////////////////////
    ///                       Structs                          ///
    //////////////////////////////////////////////////////////////

    /// @notice Struct representing a Builder Code registration.
    ///
    /// @custom:field recipient Address of the recipient of the fees.
    /// @custom:field feePercent Percentage of the fees to be paid to the recipient.
    struct Registration {
        address recipient;
        uint96 feePercent;
    }

    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice Name of the token.
    bytes32 private immutable _NAME;

    /// @notice Symbol of the token.
    bytes32 private immutable _SYMBOL;

    /// @notice Maximum fee percentage (2.00%).
    uint256 public constant MAX_FEE_PERCENT = 2_00;

    /// @notice Divisor for the fee percentage.
    uint256 public constant FEE_PERCENT_DIVISOR = 1e4;

    //////////////////////////////////////////////////////////////
    ///                       Storage                          ///
    //////////////////////////////////////////////////////////////

    /// @notice Base URI for builder code metadata.
    string private _uriPrefix;

    /// @notice Mapping of builder codes to registrations.
    mapping(bytes32 code => Registration registration) public registrations;

    //////////////////////////////////////////////////////////////
    ///                       Events                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Event emitted when a builder code is registered.
    ///
    /// @param code The builder code that was registered.
    /// @param registration The builder code's registration.
    event BuilderCodeRegistered(bytes32 indexed code, Registration registration);

    /// @notice Event emitted when a builder code is updated.
    ///
    /// @param code The builder code that was updated.
    /// @param registration The builder code's updated registration.
    event BuilderCodeUpdated(bytes32 indexed code, Registration registration);

    /// @notice Event emitted when a builder code is used.
    ///
    /// @param code The builder code that was used.
    /// @param token The token transferred.
    /// @param recipient The recipient of the post-fee amount.
    /// @param amount The amount of the token transferred (post-fee).
    /// @param fees The fees that were paid to the recipient.
    event BuilderCodeUsed(bytes32 indexed code, address token, address recipient, uint256 amount, uint256 fees);

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Error thrown when the Builder Code is already registered.
    error AlreadyRegistered();

    /// @notice Error thrown when the sender is not the owner.
    error SenderIsNotOwner();

    /// @notice Error thrown when the owner is the zero address.
    error OwnerCannotBeZeroAddress();

    /// @notice Error thrown when the recipient is the zero address.
    error RecipientCannotBeZeroAddress();

    /// @notice Error thrown when the fee percentage is invalid.
    error InvalidFeePercent();

    /// @notice Error thrown when the Builder Code is not registered.
    error CodeNotRegistered();

    /// @notice Error thrown when the balance is zero.
    error BalanceIsZero();

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                ///
    //////////////////////////////////////////////////////////////

    /// @notice Constructor.
    constructor(string memory name_, string memory symbol_) {
        _NAME = LibString.toSmallString(name_);
        _SYMBOL = LibString.toSmallString(symbol_);

        _disableInitializers();
    }

    /// @notice Receives ETH.
    ///
    receive() external payable {}

    /// @inheritdoc ERC721
    function name() public view override returns (string memory) {
        return LibString.fromSmallString(_NAME);
    }

    /// @inheritdoc ERC721
    function symbol() public view override returns (string memory) {
        return LibString.fromSmallString(_SYMBOL);
    }

    /// @inheritdoc ERC721
    function tokenURI(uint256 id) public view override returns (string memory) {
        require(_exists(id), CodeNotRegistered());
        return LibString.concat(_uriPrefix, LibString.toString(id));
    }

    /// @notice Initializes the contract.
    ///
    /// @param uriPrefix_ The base URI for builder code metadata.
    function initialize(string calldata uriPrefix_) external reinitializer(0) {
        _uriPrefix = LibString.encodeURIComponent(uriPrefix_);
    }

    /// @notice Registers a builder code.
    ///
    /// @param code The Builder Code to register.
    /// @param registration The registration of the Builder Code.
    function registerBuilderCode(bytes32 code, Registration calldata registration) external {
        require(!_exists(uint256(code)), AlreadyRegistered());
        _validateRegistration(registration);

        registrations[code] = registration;
        _mint({to: msg.sender, id: uint256(code)});

        emit BuilderCodeRegistered({code: code, registration: registration});
    }

    /// @notice Updates a registration.
    ///
    /// @param code The Builder Code to update.
    /// @param registration The registration of the Builder Code.
    function updateRegistration(bytes32 code, Registration calldata registration) external {
        require(msg.sender == _ownerOf(uint256(code)), SenderIsNotOwner());
        _validateRegistration(registration);

        registrations[code] = registration;

        emit BuilderCodeUpdated({code: code, registration: registration});
    }

    /// @notice Uses a builder code.
    ///
    /// @dev This function is expected to be called immediately after the tokens have been sent to this contract.
    ///      Any tokens sent to this contract and not immediately withdrawn by calling `useBuilderCode` are considered
    ///      lost as anyone can call this function and withdraw the tokens.
    ///
    /// @param code The Builder Code to use.
    /// @param token The token to use for the fees.
    /// @param recipient The recipient of the post-fee amount.
    function useBuilderCode(bytes32 code, address token, address recipient) external payable {
        require(_exists(uint256(code)), CodeNotRegistered());

        uint256 balance = token == TokenLib.ETH_ADDRESS ? address(this).balance : ERC20(token).balanceOf(address(this));
        require(balance > 0, BalanceIsZero());

        // Get the registration and compute the fees.
        Registration memory registration = registrations[code];
        uint256 fees = (balance * registration.feePercent) / FEE_PERCENT_DIVISOR;

        // Transfer the fees to the recipient and the remaining balance to the recipient.
        if (token == TokenLib.ETH_ADDRESS) {
            SafeTransferLib.safeTransferETH({to: registration.recipient, amount: fees});
            SafeTransferLib.safeTransferETH({to: recipient, amount: balance - fees});
        } else {
            SafeTransferLib.safeTransfer({token: token, to: registration.recipient, amount: fees});
            SafeTransferLib.safeTransfer({token: token, to: recipient, amount: balance - fees});
        }

        emit BuilderCodeUsed({code: code, token: token, recipient: recipient, amount: balance - fees, fees: fees});
    }

    //////////////////////////////////////////////////////////////
    ///                      Private Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @notice Validates a registration.
    ///
    /// @param registration The registration to validate.
    function _validateRegistration(Registration calldata registration) private pure {
        require(registration.recipient != address(0), RecipientCannotBeZeroAddress());
        require(registration.feePercent > 0 && registration.feePercent <= MAX_FEE_PERCENT, InvalidFeePercent());
    }
}
