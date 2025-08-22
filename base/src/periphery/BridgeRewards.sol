// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "solady/tokens/ERC20.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

import {IBuilderCodes} from "../interfaces/IBuilderCodes.sol";

import {TokenLib} from "../libraries/TokenLib.sol";

/// @title Bridge Rewards
///
/// @notice This contract is used to configure bridge rewards for Base builder codes. It is expected to be used in
///         conjunction with the BuilderCodes contract that manages codes registration. Once registered, this contract
///         allows the builder to start receiving rewards for each usage of the code during a bridge operation that
///         involves a transfer of tokens.
contract BridgeRewards {
    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice Maximum fee percentage (2.00%).
    uint256 public constant MAX_FEE_PERCENT = 2_00;

    /// @notice Divisor for the fee percentage.
    uint256 public constant FEE_PERCENT_DIVISOR = 1e4;

    /// @notice Address of the BuilderCodes contract.
    address public immutable BUILDER_CODES;

    //////////////////////////////////////////////////////////////
    ///                       Storage                          ///
    //////////////////////////////////////////////////////////////

    /// @notice Mapping of builder codes to fee percents.
    mapping(bytes32 code => uint256 feePercent) public feePercents;

    //////////////////////////////////////////////////////////////
    ///                       Events                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Emitted when the fee percent is set.
    ///
    /// @param code The builder code configured.
    /// @param feePercent The fee percent for the builder code.
    event FeePercentSet(bytes32 indexed code, uint256 feePercent);

    /// @notice Emitted when a builder code is used.
    ///
    /// @param code The builder code used.
    /// @param token The token transferred.
    /// @param recipient The recipient of the post-fee balance.
    /// @param balance The balance of the token transferred.
    /// @param fees The fees paid.
    event BuilderCodeUsed(bytes32 indexed code, address token, address recipient, uint256 balance, uint256 fees);

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Error thrown when the sender is not the owner of the builder code.
    error SenderIsNotBuilderCodeOwner();

    /// @notice Error thrown when the fee percentage is too high.
    error FeePercentTooHigh();

    /// @notice Error thrown when the balance is zero.
    error BalanceIsZero();

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                ///
    //////////////////////////////////////////////////////////////

    constructor(address builderCodes) {
        BUILDER_CODES = builderCodes;
    }

    /// @notice Receives ETH.
    receive() external payable {}

    /// @notice Sets the fee percent for a builder code.
    ///
    /// @param code The builder code to configure.
    /// @param feePercent The fee percent for the builder code.
    function setFeePercent(bytes32 code, uint256 feePercent) external {
        address owner = IBuilderCodes(BUILDER_CODES).ownerOf(uint256(code));
        require(msg.sender == owner, SenderIsNotBuilderCodeOwner());
        require(feePercent <= MAX_FEE_PERCENT, FeePercentTooHigh());

        feePercents[code] = feePercent;

        emit FeePercentSet({code: code, feePercent: feePercent});
    }

    /// @notice Uses a builder code.
    ///
    /// @dev This function is expected to be called immediately after the tokens have been sent to this contract.
    ///      Any tokens sent to this contract and not immediately withdrawn by calling `useBuilderCode` are considered
    ///      lost as anyone can call this function and withdraw the tokens.
    ///
    /// @param code The builder code to use.
    /// @param token The token being transferred.
    /// @param recipient The recipient of the post-fee balance.
    function useBuilderCode(bytes32 code, address token, address recipient) external payable {
        uint256 balance = token == TokenLib.ETH_ADDRESS ? address(this).balance : ERC20(token).balanceOf(address(this));
        require(balance > 0, BalanceIsZero());

        // Get the payout address for the builder code.
        // NOTE: This will revert if the code is not registered.
        address payoutAddress = IBuilderCodes(BUILDER_CODES).payoutAddress(uint256(code));

        // Compute the fees.
        uint256 feePercent = feePercents[code];
        uint256 fees = (balance * feePercent) / FEE_PERCENT_DIVISOR;

        // Transfer the fees to the payout address and the remaining balance to the recipient.
        if (token == TokenLib.ETH_ADDRESS) {
            if (fees != 0) {
                SafeTransferLib.safeTransferETH({to: payoutAddress, amount: fees});
            }

            SafeTransferLib.safeTransferETH({to: recipient, amount: balance - fees});
        } else {
            if (fees != 0) {
                SafeTransferLib.safeTransfer({token: token, to: payoutAddress, amount: fees});
            }

            SafeTransferLib.safeTransfer({token: token, to: recipient, amount: balance - fees});
        }

        emit BuilderCodeUsed({code: code, token: token, recipient: recipient, balance: balance, fees: fees});
    }
}
