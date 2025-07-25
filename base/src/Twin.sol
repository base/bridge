// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Call, CallLib} from "./libraries/CallLib.sol";

/// @title Twin
///
/// @notice Execution proxy contract that represents Solana users on Base, enabling cross-chain interactions.
///
/// @dev Each Solana user gets their own deterministic Twin contract deployed when they first interact with Base.
///
///      **Key Characteristics:**
///      - Deployed deterministically using the user's Solana pubkey as salt via ERC-1967 beacon proxy pattern
///      - Acts as the user's "representative" or "twin" on Base for receiving tokens and executing transactions
///      - Can execute arbitrary calls on behalf of the Solana user (regular calls, delegate calls, contract creation)
///      - Can receive ETH directly via the receive() function
///      - Secured by authorization - only the Bridge contract or the Twin itself can execute calls
///
///      **Deployment Process:**
///      1. When a Solana user sends a message to Base for the first time, the Bridge contract checks if a Twin exists
///      2. If no Twin exists, it deploys one deterministically using LibClone.deployDeterministicERC1967BeaconProxy
///      3. The salt is derived from the user's Solana pubkey, ensuring the same address every time
///      4. All future interactions for that user will use the same Twin contract
contract Twin {
    //////////////////////////////////////////////////////////////
    ///                       Constants                        ///
    //////////////////////////////////////////////////////////////

    /// @notice The address of the Bridge contract that has execution privileges.
    ///
    /// @dev This is the only external address authorized to call execute(). The Bridge contract
    ///      calls this when relaying messages from Solana that require execution on Base.
    address public immutable BRIDGE;

    //////////////////////////////////////////////////////////////
    ///                       Errors                           ///
    //////////////////////////////////////////////////////////////

    /// @notice Thrown when the caller is neither the portal nor the twin itself.
    error Unauthorized();

    //////////////////////////////////////////////////////////////
    ///                       Public Functions                 ///
    //////////////////////////////////////////////////////////////

    /// @notice Constructs a new Twin contract.
    ///
    /// @dev This constructor is called when deploying the implementation contract for the beacon proxy pattern.
    ///      Individual Twin instances are deployed as beacon proxies, not by calling this constructor directly.
    ///
    /// @param bridge The address of the Bridge contract that will have execution privileges.
    constructor(address bridge) {
        BRIDGE = bridge;
    }

    /// @notice Receives ETH sent directly to this contract.
    ///
    /// @dev Allows the Twin to receive ETH from token bridge operations, contract interactions,
    ///      or any other source. This is essential for the Twin to act as a full execution context
    ///      that can hold and manage ETH on behalf of the Solana user.
    receive() external payable {}

    /// @notice Executes an arbitrary call on behalf of the Solana user.
    ///
    /// @dev This is the core function that enables Solana users to interact with Base contracts.
    ///      The call can be a regular call, delegate call, or contract creation (CREATE/CREATE2).
    ///
    ///      **Authorization:**
    ///      - Only the Bridge contract can call this when relaying messages from Solana
    ///      - The Twin itself can call this for complex multi-step operations
    ///
    ///      **Call Types Supported:**
    ///      - `CallType.Call`: Regular external call to another contract
    ///      - `CallType.DelegateCall`: Delegate call (executes in Twin's context)
    ///      - `CallType.Create`: Deploy new contract using CREATE opcode
    ///      - `CallType.Create2`: Deploy new contract using CREATE2 opcode with salt
    ///
    /// @param call The encoded call to execute, containing the call type, target, value, and data.
    function execute(Call calldata call) external payable {
        if (msg.sender != BRIDGE && msg.sender != address(this)) revert Unauthorized();
        CallLib.execute(call);
    }
}
