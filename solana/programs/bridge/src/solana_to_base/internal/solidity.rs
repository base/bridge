use alloy_sol_types::sol;

sol! {
    type Pubkey is bytes32;

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

    /// @notice Enum representing the type of call.
    enum CallType {
        Call,
        DelegateCall,
        Create,
        Create2
    }

    /// @notice Struct representing a call to execute.
    ///
    /// @custom:field ty The type of call.
    /// @custom:field to The target address to call.
    /// @custom:field value The value to send with the call.
    /// @custom:field data The data to pass to the call.
    struct Call {
        CallType ty;
        address to;
        uint128 value;
        bytes data;
    }

    /// @notice Enum containing operation types.
    enum MessageType {
        Call,
        Transfer,
        TransferAndCall
    }

    /// @notice Message sent from Solana to Base.
    ///
    /// @custom:field nonce Unique nonce for the message.
    /// @custom:field sender The Solana sender's pubkey.
    /// @custom:field ty The message type.
    /// @custom:field operations The operations to be executed.
    struct IncomingMessage {
        uint64 nonce;
        Pubkey sender;
        MessageType ty;
        bytes data;
    }

    contract Bridge {
        function relayMessages(IncomingMessage[] calldata messages, bytes calldata ismData) external;
    }
}
