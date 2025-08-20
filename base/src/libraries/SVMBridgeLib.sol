// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ix, Pubkey, SVMLib} from "./SVMLib.sol";
import {SolanaTokenType, Transfer} from "./TokenLib.sol";

library SVMBridgeLib {
    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice The TokenProgram ID on Solana (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA).
    Pubkey private constant _TOKEN_PROGRAM_ID =
        Pubkey.wrap(0x06ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9);

    /// @notice The TokenProgram 2022 ID on Solana (TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb).
    Pubkey private constant _TOKEN_PROGRAM_2022_ID =
        Pubkey.wrap(0x06ddf6e1ee758fde18425dbce46ccddab61afc4d83b90d27febdf928d8a18bfc);

    /// @notice The SystemProgram ID on Solana.
    Pubkey private constant _SYSTEM_PROGRAM_ID =
        Pubkey.wrap(0x0000000000000000000000000000000000000000000000000000000000000000);

    //////////////////////////////////////////////////////////////
    ///                     Internal Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @notice Serializes a Message::Call variant to Borsh-compatible bytes.
    ///
    /// @param ixs The Solana instructions.
    ///
    /// @return Serialized Message::Call bytes ready for Solana deserialization
    function serializeCall(Ix[] memory ixs) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(0), SVMLib.serializeIxs(ixs));
    }

    /// @notice Serializes a Message::Transfer variant to Borsh-compatible bytes.
    ///
    /// @param transfer The token transfer to serialize.
    /// @param tokenType The Solana token type.
    /// @param ixs The optional Solana instructions.
    ///
    /// @return Serialized Message::Transfer bytes ready for Solana deserialization
    function serializeTransfer(Transfer memory transfer, SolanaTokenType tokenType, Ix[] memory ixs)
        internal
        pure
        returns (bytes memory)
    {
        // Variant discriminator for Transfer (1)
        bytes memory result = abi.encodePacked(uint8(1));

        if (tokenType == SolanaTokenType.Sol) {
            result = abi.encodePacked(
                result,
                uint8(0), // Sol
                transfer.localToken, // remote_token
                transfer.to, // to
                SVMLib.toU64LittleEndian(transfer.remoteAmount) // amount
            );
        } else if (tokenType == SolanaTokenType.Spl) {
            result = abi.encodePacked(
                result,
                uint8(1), // Spl
                transfer.localToken, // remote_token
                transfer.remoteToken, // local_token
                transfer.to, // to
                SVMLib.toU64LittleEndian(transfer.remoteAmount) // amount
            );
        } else if (tokenType == SolanaTokenType.WrappedToken) {
            result = abi.encodePacked(
                result,
                uint8(2), // WrappedToken
                transfer.remoteToken, // local_token
                transfer.to, // to
                SVMLib.toU64LittleEndian(transfer.remoteAmount) // amount
            );
        }

        // Serialize the instructions array
        result = abi.encodePacked(result, SVMLib.serializeIxs(ixs));

        return result;
    }
}
