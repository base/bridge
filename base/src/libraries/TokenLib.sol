// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafeCastLib} from "solady/utils/SafeCastLib.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";

import {CrossChainERC20} from "../CrossChainERC20.sol";
import {CrossChainERC20Factory} from "../CrossChainERC20Factory.sol";

import {Pubkey} from "./SVMLib.sol";

/// @notice Struct representing a token transfer.
///
/// @custom:field localToken Address of the ERC20 token on this chain.
/// @custom:field remoteToken Pubkey of the remote token on Solana.
/// @custom:field to Address of the recipient on the target chain. EVM address on Base, Solana pubkey on Solana.
/// @custom:field remoteAmount Amount of tokens being bridged (expressed in Solana units).
struct Transfer {
    address localToken;
    Pubkey remoteToken;
    bytes32 to;
    uint64 remoteAmount;
}

/// @notice Enum representing the Solana token type.
enum SolanaTokenType {
    Sol,
    Spl,
    WrappedToken
}

/// @notice Storage layout used by this library.
///
/// @custom:storage-location erc7201:coinbase.storage.TokenLib
///
/// @custom:field deposits Mapping that stores deposit balances for token pairs between Base and Solana.
/// @custom:field scalars Mapping that stores the scalars to use to scale Solana amounts to Base amounts.
///                               Only used when bridging native ETH or ERC20 tokens to (or back from) Solana.
struct TokenLibStorage {
    mapping(address localToken => mapping(Pubkey remoteToken => uint256 amount)) deposits;
    mapping(address localToken => mapping(Pubkey remoteToken => uint256 scalar)) scalars;
}

library TokenLib {
    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when the ETH value sent with a transaction doesn't match the expected amount.
    error InvalidMsgValue();

    /// @notice Thrown when the remote token is not the expected token.
    error IncorrectRemoteToken();

    /// @notice Thrown when the token pair is not registered.
    error WrappedSplRouteNotRegistered();

    /// @notice Thrown when the transfer amount is zero.
    error ZeroAmount();

    //////////////////////////////////////////////////////////////
    ///                       Events                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Emitted when a token transfer is initialized.
    ///
    /// @param localToken Address of the local token on Base.
    /// @param remoteToken Pubkey of the remote token on Solana.
    /// @param to Pubkey of the recipient on Solana.
    /// @param amount Amount of tokens bridged to the recipient (expressed in local units).
    event TransferInitialized(address localToken, Pubkey remoteToken, Pubkey to, uint256 amount);

    /// @notice Emitted when a token transfer is finalized.
    ///
    /// @param localToken Address of the local token on Base.
    /// @param remoteToken Pubkey of the remote token on Solana.
    /// @param to Address of the recipient on Base.
    /// @param amount Amount of tokens bridged to the recipient (expressed in local units).
    event TransferFinalized(address localToken, Pubkey remoteToken, address to, uint256 amount);

    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice The ERC-7528 pseudo-address representing native ETH in token operations.
    address public constant ETH_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice Sentinel pubkey used to denote native SOL within bridging logic.
    /// ("SoL1111111111111111111111111111111111111111")
    Pubkey public constant NATIVE_SOL_PUBKEY =
        Pubkey.wrap(0x069be72ab836d4eacc02525b7350a78a395da2f1253a40ebafd6630000000000);

    /// @dev Slot for the `TokenLibStorage` struct in storage.
    ///      Computed from:
    ///         keccak256(abi.encode(uint256(keccak256("coinbase.storage.TokenLib")) - 1)) & ~bytes32(uint256(0xff))
    ///
    ///      Follows ERC-7201 (see https://eips.ethereum.org/EIPS/eip-7201).
    bytes32 private constant _TOKEN_LIB_STORAGE_LOCATION =
        0x86fd1c0757ed9526a07041356cbdd3c36e2a83be313529de06f943db14148300;

    //////////////////////////////////////////////////////////////
    ///                       Internal Functions               ///
    //////////////////////////////////////////////////////////////

    /// @notice Helper function to get a storage reference to the `TokenLibStorage` struct.
    ///
    /// @return $ A storage reference to the `TokenLibStorage` struct.
    function getTokenLibStorage() internal pure returns (TokenLibStorage storage $) {
        assembly ("memory-safe") {
            $.slot := _TOKEN_LIB_STORAGE_LOCATION
        }
    }

    /// @notice Initializes a token transfer.
    ///
    /// @dev IMPORTANT: For native ERC20 tokens with transfer fees, the `transfer.remoteAmount` field might be modified
    ///                 directly IN MEMORY.
    ///
    /// @param transfer The token transfer to initialize.
    /// @param crossChainErc20Factory The address of the CrossChainERC20Factory.
    ///
    /// @return tokenType The Solana token type.
    function initializeTransfer(Transfer memory transfer, address crossChainErc20Factory)
        internal
        returns (SolanaTokenType tokenType)
    {
        require(transfer.remoteAmount > 0, ZeroAmount());

        TokenLibStorage storage $ = getTokenLibStorage();
        uint256 localAmount;

        if (transfer.localToken == ETH_ADDRESS) {
            // Case: Bridging native ETH to Solana
            uint256 scalar = $.scalars[transfer.localToken][transfer.remoteToken];
            require(scalar != 0, WrappedSplRouteNotRegistered());

            localAmount = transfer.remoteAmount * scalar;
            require(msg.value == localAmount, InvalidMsgValue());

            tokenType = SolanaTokenType.WrappedToken;
            $.deposits[transfer.localToken][transfer.remoteToken] += localAmount;
        } else {
            // Prevent sending ETH when bridging ERC20 tokens
            require(msg.value == 0, InvalidMsgValue());

            if (CrossChainERC20Factory(crossChainErc20Factory).isCrossChainErc20(transfer.localToken)) {
                // Case: Bridging back native SOL or SPL token to Solana
                Pubkey expectedRemoteToken = Pubkey.wrap(CrossChainERC20(transfer.localToken).remoteToken());
                require(
                    Pubkey.unwrap(transfer.remoteToken) == bytes32(0) || transfer.remoteToken == expectedRemoteToken,
                    IncorrectRemoteToken()
                );

                // IMPORTANT: Update the transfer struct IN MEMORY to reflect the remote token to use for bridging.
                transfer.remoteToken = expectedRemoteToken;

                localAmount = transfer.remoteAmount;
                CrossChainERC20(transfer.localToken).burn({from: msg.sender, amount: localAmount});

                tokenType = transfer.remoteToken == NATIVE_SOL_PUBKEY ? SolanaTokenType.Sol : SolanaTokenType.Spl;
            } else {
                // Case: Bridging native ERC20 to Solana
                uint256 scalar = $.scalars[transfer.localToken][transfer.remoteToken];
                require(scalar != 0, WrappedSplRouteNotRegistered());

                uint256 transferLocalAmount = transfer.remoteAmount * scalar;

                // Compute the precise amount of tokens that have been received.
                // NOTE: This is needed to support tokens with transfer fees.
                uint256 balanceBefore = SafeTransferLib.balanceOf({token: transfer.localToken, account: address(this)});
                SafeTransferLib.safeTransferFrom({
                    token: transfer.localToken, from: msg.sender, to: address(this), amount: transferLocalAmount
                });
                uint256 balanceAfter = SafeTransferLib.balanceOf({token: transfer.localToken, account: address(this)});
                uint256 receivedLocalAmount = balanceAfter - balanceBefore;

                // Convert back to remote amount and transfer the dust back to the sender.
                uint256 receivedRemoteAmount = receivedLocalAmount / scalar;
                require(receivedRemoteAmount > 0, ZeroAmount());

                localAmount = receivedRemoteAmount * scalar;
                uint256 dust = receivedLocalAmount - localAmount;
                if (dust > 0) {
                    SafeTransferLib.safeTransfer({token: transfer.localToken, to: msg.sender, amount: dust});
                }

                // IMPORTANT: Update the transfer struct IN MEMORY to reflect the remote amount to use for bridging.
                transfer.remoteAmount = SafeCastLib.toUint64(receivedRemoteAmount);

                $.deposits[transfer.localToken][transfer.remoteToken] += localAmount;

                tokenType = SolanaTokenType.WrappedToken;
            }
        }

        emit TransferInitialized({
            localToken: transfer.localToken,
            remoteToken: transfer.remoteToken,
            to: Pubkey.wrap(transfer.to),
            amount: localAmount
        });
    }

    /// @notice Finalizes a token transfer.
    ///
    /// @param transfer The token transfer to finalize.
    /// @param crossChainErc20Factory The address of the CrossChainERC20Factory.
    function finalizeTransfer(Transfer memory transfer, address crossChainErc20Factory) internal {
        TokenLibStorage storage $ = getTokenLibStorage();

        address to = address(bytes20(transfer.to));
        uint256 localAmount;

        if (transfer.localToken == ETH_ADDRESS) {
            // Case: Bridging back native ETH to EVM
            uint256 scalar = $.scalars[transfer.localToken][transfer.remoteToken];
            require(scalar != 0, WrappedSplRouteNotRegistered());
            localAmount = transfer.remoteAmount * scalar;
            $.deposits[transfer.localToken][transfer.remoteToken] -= localAmount;

            SafeTransferLib.safeTransferETH({to: to, amount: localAmount});
        } else {
            if (CrossChainERC20Factory(crossChainErc20Factory).isCrossChainErc20(transfer.localToken)) {
                // Case: Bridging native SOL or SPL token to EVM
                bytes32 remoteToken = CrossChainERC20(transfer.localToken).remoteToken();
                require(Pubkey.wrap(remoteToken) == transfer.remoteToken, IncorrectRemoteToken());

                localAmount = transfer.remoteAmount;
                CrossChainERC20(transfer.localToken).mint({to: to, amount: localAmount});
            } else {
                // Case: Bridging back native ERC20 to EVM
                uint256 scalar = $.scalars[transfer.localToken][transfer.remoteToken];
                require(scalar != 0, WrappedSplRouteNotRegistered());

                localAmount = transfer.remoteAmount * scalar;
                $.deposits[transfer.localToken][transfer.remoteToken] -= localAmount;

                SafeTransferLib.safeTransfer({token: transfer.localToken, to: to, amount: localAmount});
            }
        }

        emit TransferFinalized({
            localToken: transfer.localToken, remoteToken: transfer.remoteToken, to: to, amount: localAmount
        });
    }

    /// @notice Registers a remote token and its conversion scalar.
    ///
    /// @param localToken Address of the ERC20 token on this chain.
    /// @param remoteToken Pubkey of the remote token on Solana.
    /// @param scalarExponent Exponent used to compute the remote->local conversion scalar
    ///        (localAmount = remoteAmount * 10^scalarExponent).
    function registerRemoteToken(address localToken, Pubkey remoteToken, uint8 scalarExponent) internal {
        TokenLibStorage storage $ = getTokenLibStorage();
        $.scalars[localToken][remoteToken] = 10 ** scalarExponent;
    }
}
