export const IDL = {
  "metadata": {
    "name": "bridge",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "append_to_call_buffer",
      "docs": [
        "Appends data to an existing call buffer account.",
        "Only the owner of the call buffer can append data to it.",
        "",
        "# Arguments",
        "* `ctx`  - The context containing the call buffer account",
        "* `data` - Additional data to append to the buffer"
      ],
      "discriminator": [
        113,
        115,
        232,
        194,
        248,
        32,
        39,
        21
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "The account paying for the transaction fees.",
            "It must be the owner of the call buffer account."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "call_buffer",
          "docs": [
            "The call buffer account to append data to"
          ],
          "writable": true
        }
      ],
      "args": [
        {
          "name": "data",
          "type": "bytes"
        }
      ]
    },
    {
      "name": "bridge_call",
      "docs": [
        "Initiates a cross-chain function call from Solana to Base.",
        "This function allows executing arbitrary contract calls on Base using",
        "the bridge's cross-chain messaging system.",
        "",
        "# Arguments",
        "* `ctx`  - The context containing accounts for the bridge operation",
        "* `call` - The contract call details including target address and calldata"
      ],
      "discriminator": [
        90,
        23,
        83,
        238,
        200,
        18,
        111,
        95
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "The account that pays for the transaction fees and outgoing message account creation.",
            "Must be mutable to deduct lamports for account rent and gas fees."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "from",
          "docs": [
            "The account initiating the bridge call on Solana.",
            "This account's public key will be used as the sender in the cross-chain message."
          ],
          "signer": true
        },
        {
          "name": "gas_fee_receiver",
          "docs": [
            "The account that receives payment for the gas costs of bridging the call to Base."
          ],
          "writable": true
        },
        {
          "name": "bridge",
          "docs": [
            "The main bridge state account containing global bridge configuration.",
            "- Uses PDA with BRIDGE_SEED for deterministic address",
            "- Mutable to increment the nonce and update EIP-1559 gas pricing",
            "- Provides the current nonce for message ordering"
          ],
          "writable": true
        },
        {
          "name": "outgoing_message",
          "docs": [
            "The outgoing message account that stores the cross-chain call data.",
            "- Created fresh for each bridge call with unique address",
            "- Payer funds the account creation",
            "- Space calculated dynamically based on call data length (8-byte discriminator + message data)",
            "- Contains all information needed for execution on Base"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program",
          "docs": [
            "System program required for creating the outgoing message account.",
            "Used internally by Anchor for account initialization."
          ]
        }
      ],
      "args": [
        {
          "name": "call",
          "type": {
            "defined": {
              "name": "Call"
            }
          }
        }
      ]
    },
    {
      "name": "bridge_call_buffered",
      "docs": [
        "Bridges a call using data from a call buffer account.",
        "This instruction consumes the call buffer and creates an outgoing message",
        "for execution on Base.",
        "",
        "# Arguments",
        "* `ctx` - The context containing accounts for the bridge operation"
      ],
      "discriminator": [
        138,
        112,
        52,
        204,
        33,
        68,
        62,
        85
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "The account that pays for the transaction fees and outgoing message account creation.",
            "Must be mutable to deduct lamports for account rent and gas fees."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "from",
          "docs": [
            "The account initiating the bridge call on Solana.",
            "This account's public key will be used as the sender in the cross-chain message."
          ],
          "signer": true
        },
        {
          "name": "gas_fee_receiver",
          "docs": [
            "The account that receives payment for the gas costs of bridging the call to Base."
          ],
          "writable": true
        },
        {
          "name": "bridge",
          "docs": [
            "The main bridge state account containing global bridge configuration.",
            "- Uses PDA with BRIDGE_SEED for deterministic address",
            "- Mutable to increment the nonce and update EIP-1559 gas pricing",
            "- Provides the current nonce for message ordering"
          ],
          "writable": true
        },
        {
          "name": "owner",
          "docs": [
            "The owner of the call buffer who will receive the rent refund."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "call_buffer",
          "docs": [
            "The call buffer account that stores the call data.",
            "This account will be closed and rent returned to the owner."
          ],
          "writable": true
        },
        {
          "name": "outgoing_message",
          "docs": [
            "The outgoing message account that stores the cross-chain call data.",
            "- Created fresh for each bridge call with unique address",
            "- Payer funds the account creation",
            "- Space calculated dynamically based on call data length (8-byte discriminator + message data)",
            "- Contains all information needed for execution on Base"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program",
          "docs": [
            "System program required for creating the outgoing message account.",
            "Used internally by Anchor for account initialization."
          ]
        }
      ],
      "args": []
    },
    {
      "name": "bridge_sol",
      "docs": [
        "Bridges native SOL tokens from Solana to Base.",
        "This function locks SOL on Solana and initiates a message to mint equivalent",
        "tokens on Base for the specified recipient.",
        "",
        "# Arguments",
        "* `ctx`          - The context containing accounts for the SOL bridge operation",
        "* `to`           - The 20-byte Ethereum address that will receive tokens on Base",
        "* `remote_token` - The 20-byte address of the token contract on Base",
        "* `amount`       - Amount of SOL to bridge (in lamports)",
        "* `call`         - Optional additional contract call to execute with the token transfer"
      ],
      "discriminator": [
        190,
        190,
        32,
        158,
        75,
        153,
        32,
        86
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "The account that pays for transaction fees and account creation.",
            "Must be mutable to deduct lamports for account rent and gas fees."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "from",
          "docs": [
            "The account that owns the SOL tokens being bridged.",
            "Must sign the transaction to authorize the transfer of their SOL."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "gas_fee_receiver",
          "docs": [
            "The account that receives payment for the gas costs of bridging SOL to Base."
          ],
          "writable": true
        },
        {
          "name": "sol_vault",
          "docs": [
            "The SOL vault account that holds locked tokens for the specific remote token.",
            "- Uses PDA with SOL_VAULT_SEED and remote_token for deterministic address",
            "- Mutable to receive the locked SOL tokens",
            "- Each remote token has its own dedicated vault",
            ""
          ],
          "writable": true
        },
        {
          "name": "bridge",
          "docs": [
            "The main bridge state account that tracks nonces and fee parameters.",
            "- Uses PDA with BRIDGE_SEED for deterministic address",
            "- Mutable to increment nonce and update EIP1559 fee data"
          ],
          "writable": true
        },
        {
          "name": "outgoing_message",
          "docs": [
            "The outgoing message account that stores cross-chain transfer details.",
            "- Created fresh for each bridge operation",
            "- Payer funds the account creation",
            "- Space allocated dynamically based on optional call data size"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program",
          "docs": [
            "System program required for SOL transfers and account creation.",
            "Used for transferring SOL from user to vault and creating outgoing message account."
          ]
        }
      ],
      "args": [
        {
          "name": "to",
          "type": {
            "array": [
              "u8",
              20
            ]
          }
        },
        {
          "name": "remote_token",
          "type": {
            "array": [
              "u8",
              20
            ]
          }
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "call",
          "type": {
            "option": {
              "defined": {
                "name": "Call"
              }
            }
          }
        }
      ]
    },
    {
      "name": "bridge_sol_with_buffered_call",
      "docs": [
        "Bridges native SOL tokens from Solana to Base with a call using buffered data.",
        "This function locks SOL on Solana and initiates a message to mint equivalent",
        "tokens on Base, then executes a call using data from a call buffer.",
        "",
        "# Arguments",
        "* `ctx`          - The context containing accounts for the SOL bridge operation",
        "* `to`           - The 20-byte Ethereum address that will receive tokens on Base",
        "* `remote_token` - The 20-byte address of the token contract on Base",
        "* `amount`       - Amount of SOL to bridge (in lamports)"
      ],
      "discriminator": [
        52,
        106,
        74,
        190,
        246,
        31,
        157,
        12
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "The account that pays for transaction fees and account creation.",
            "Must be mutable to deduct lamports for account rent and gas fees."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "from",
          "docs": [
            "The account that owns the SOL tokens being bridged.",
            "Must sign the transaction to authorize the transfer of their SOL."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "gas_fee_receiver",
          "docs": [
            "The account that receives payment for the gas costs of bridging the SOL to Base."
          ],
          "writable": true
        },
        {
          "name": "sol_vault",
          "docs": [
            "The SOL vault account that holds locked tokens for the specific remote token.",
            "- Uses PDA with SOL_VAULT_SEED and remote_token for deterministic address",
            "- Mutable to receive the locked SOL tokens",
            "- Each remote token has its own dedicated vault",
            ""
          ],
          "writable": true
        },
        {
          "name": "bridge",
          "docs": [
            "The main bridge state account that tracks nonces and fee parameters.",
            "- Uses PDA with BRIDGE_SEED for deterministic address",
            "- Mutable to increment nonce and update EIP1559 fee data"
          ],
          "writable": true
        },
        {
          "name": "owner",
          "docs": [
            "The owner of the call buffer who will receive the rent refund."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "call_buffer",
          "docs": [
            "The call buffer account that stores the call data.",
            "This account will be closed and rent returned to the owner."
          ],
          "writable": true
        },
        {
          "name": "outgoing_message",
          "docs": [
            "The outgoing message account that stores the cross-chain transfer details."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program",
          "docs": [
            "System program required for SOL transfers and account creation."
          ]
        }
      ],
      "args": [
        {
          "name": "to",
          "type": {
            "array": [
              "u8",
              20
            ]
          }
        },
        {
          "name": "remote_token",
          "type": {
            "array": [
              "u8",
              20
            ]
          }
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "bridge_spl",
      "docs": [
        "Bridges SPL tokens from Solana to Base.",
        "This function burns or locks SPL tokens on Solana and initiates a message to mint",
        "equivalent ERC20 tokens on Base for the specified recipient.",
        "",
        "# Arguments",
        "* `ctx`          - The context containing accounts for the SPL token bridge operation",
        "* `to`           - The 20-byte Ethereum address that will receive tokens on Base",
        "* `remote_token` - The 20-byte address of the ERC20 token contract on Base",
        "* `amount`       - Amount of SPL tokens to bridge (in lamports)",
        "* `call`         - Optional additional contract call to execute with the token transfer"
      ],
      "discriminator": [
        87,
        109,
        172,
        103,
        8,
        187,
        223,
        126
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "The account that pays for transaction fees and account creation.",
            "Must be mutable to deduct lamports for gas fees and new account rent."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "from",
          "docs": [
            "The token owner authorizing the transfer of SPL tokens.",
            "This account must sign the transaction and own the tokens being bridged."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "gas_fee_receiver",
          "docs": [
            "The account that receives payment for the gas costs of bridging the SPL token to Base."
          ],
          "writable": true
        },
        {
          "name": "mint",
          "docs": [
            "The SPL token mint account for the token being bridged.",
            "- Must not be a wrapped token (wrapped tokens use bridge_wrapped_token)",
            "- Used to validate transfer amounts and get token metadata"
          ],
          "writable": true
        },
        {
          "name": "from_token_account",
          "docs": [
            "The user's token account containing the SPL tokens to be bridged.",
            "- Must be owned by the 'from' signer",
            "- Tokens will be transferred from this account to the token vault"
          ],
          "writable": true
        },
        {
          "name": "bridge",
          "docs": [
            "The main bridge state account containing global bridge configuration.",
            "- PDA with BRIDGE_SEED for deterministic address",
            "- Tracks nonce for message ordering and EIP-1559 gas pricing",
            "- Nonce is incremented after successful bridge operations"
          ],
          "writable": true
        },
        {
          "name": "token_vault",
          "docs": [
            "The token vault account that holds locked SPL tokens during the bridge process.",
            "- PDA derived from TOKEN_VAULT_SEED, mint pubkey, and remote_token address",
            "- Created if it doesn't exist for this mint/remote_token pair",
            "- Acts as the custody account for tokens being bridged to Base"
          ],
          "writable": true
        },
        {
          "name": "outgoing_message",
          "docs": [
            "The outgoing message account that represents this bridge operation.",
            "- Contains transfer details and optional call data for the destination chain",
            "- Space is calculated based on the size of optional call data",
            "- Used by relayers to execute the bridge operation on Base"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program",
          "docs": [
            "The SPL Token program interface for executing token transfers.",
            "Used for the transfer_checked operation to move tokens to the vault."
          ]
        },
        {
          "name": "system_program",
          "docs": [
            "System program required for creating the outgoing message account."
          ]
        }
      ],
      "args": [
        {
          "name": "to",
          "type": {
            "array": [
              "u8",
              20
            ]
          }
        },
        {
          "name": "remote_token",
          "type": {
            "array": [
              "u8",
              20
            ]
          }
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "call",
          "type": {
            "option": {
              "defined": {
                "name": "Call"
              }
            }
          }
        }
      ]
    },
    {
      "name": "bridge_spl_with_buffered_call",
      "docs": [
        "Bridges SPL tokens from Solana to Base with a call using buffered data.",
        "This function locks SPL tokens on Solana and initiates a message to mint equivalent",
        "tokens on Base, then executes a call using data from a call buffer.",
        "",
        "# Arguments",
        "* `ctx`          - The context containing accounts for the SPL token bridge operation",
        "* `to`           - The 20-byte Ethereum address that will receive tokens on Base",
        "* `remote_token` - The 20-byte address of the ERC20 token contract on Base",
        "* `amount`       - Amount of SPL tokens to bridge (in lamports)"
      ],
      "discriminator": [
        86,
        187,
        229,
        4,
        110,
        8,
        116,
        153
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "The account that pays for transaction fees and account creation.",
            "Must be mutable to deduct lamports for gas fees and new account rent."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "from",
          "docs": [
            "The token owner authorizing the transfer of SPL tokens.",
            "This account must sign the transaction and own the tokens being bridged."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "gas_fee_receiver",
          "docs": [
            "The account that receives payment for the gas costs of bridging the SPL token to Base."
          ],
          "writable": true
        },
        {
          "name": "mint",
          "docs": [
            "The SPL token mint account for the token being bridged.",
            "- Must not be a wrapped token (wrapped tokens use bridge_wrapped_token)",
            "- Used to validate transfer amounts and get token metadata"
          ],
          "writable": true
        },
        {
          "name": "from_token_account",
          "docs": [
            "The user's token account containing the SPL tokens to be bridged.",
            "- Must be owned by the 'from' signer",
            "- Tokens will be transferred from this account to the token vault"
          ],
          "writable": true
        },
        {
          "name": "bridge",
          "docs": [
            "The main bridge state account containing global bridge configuration.",
            "- PDA with BRIDGE_SEED for deterministic address",
            "- Tracks nonce for message ordering and EIP-1559 gas pricing",
            "- Nonce is incremented after successful bridge operations"
          ],
          "writable": true
        },
        {
          "name": "token_vault",
          "docs": [
            "The token vault account that holds locked SPL tokens during the bridge process.",
            "- PDA derived from TOKEN_VAULT_SEED, mint pubkey, and remote_token address",
            "- Created if it doesn't exist for this mint/remote_token pair",
            "- Acts as the custody account for tokens being bridged to Base"
          ],
          "writable": true
        },
        {
          "name": "owner",
          "docs": [
            "The owner of the call buffer who will receive the rent refund."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "call_buffer",
          "docs": [
            "The call buffer account that stores the call data.",
            "This account will be closed and rent returned to the owner."
          ],
          "writable": true
        },
        {
          "name": "outgoing_message",
          "docs": [
            "The outgoing message account that stores the cross-chain transfer details."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program",
          "docs": [
            "The SPL Token program interface for executing token transfers.",
            "Used for the transfer_checked operation to move tokens to the vault."
          ]
        },
        {
          "name": "system_program",
          "docs": [
            "System program required for creating the outgoing message account."
          ]
        }
      ],
      "args": [
        {
          "name": "to",
          "type": {
            "array": [
              "u8",
              20
            ]
          }
        },
        {
          "name": "remote_token",
          "type": {
            "array": [
              "u8",
              20
            ]
          }
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "bridge_wrapped_token",
      "docs": [
        "Bridges wrapped tokens from Solana back to their native form on Base.",
        "This function burns wrapped tokens on Solana and initiates a message to release",
        "or mint the original tokens on Base for the specified recipient.",
        "",
        "# Arguments",
        "* `ctx`    - The context containing accounts for the wrapped token bridge operation",
        "* `to`     - The 20-byte Ethereum address that will receive the original tokens on Base",
        "* `amount` - Amount of wrapped tokens to bridge back (in lamports)",
        "* `call`   - Optional additional contract call to execute with the token transfer"
      ],
      "discriminator": [
        55,
        201,
        139,
        188,
        226,
        16,
        136,
        143
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "The account that pays for transaction fees and outgoing message account creation.",
            "Must be mutable to deduct lamports for account rent and gas fees."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "from",
          "docs": [
            "The token owner who is bridging their wrapped tokens back to Base.",
            "Must sign the transaction to authorize burning their tokens."
          ],
          "signer": true
        },
        {
          "name": "gas_fee_receiver",
          "docs": [
            "The account that receives payment for the gas costs of bridging the token on Base."
          ],
          "writable": true
        },
        {
          "name": "mint",
          "docs": [
            "The wrapped token mint account representing the original Base token.",
            "- Contains metadata linking to the original token on Base",
            "- Tokens will be burned from this mint"
          ],
          "writable": true
        },
        {
          "name": "from_token_account",
          "docs": [
            "The user's token account holding the wrapped tokens to be bridged.",
            "- Must contain sufficient token balance for the bridge amount",
            "- Tokens will be burned from this account"
          ],
          "writable": true
        },
        {
          "name": "bridge",
          "docs": [
            "The main bridge state account storing global bridge configuration.",
            "- Uses PDA with BRIDGE_SEED for deterministic address",
            "- Tracks nonce for message ordering and EIP-1559 gas pricing"
          ],
          "writable": true
        },
        {
          "name": "outgoing_message",
          "docs": [
            "The outgoing message account being created to store bridge transfer data.",
            "- Contains transfer details and optional call data for Base execution",
            "- Space allocated based on call data size",
            "- Will be read by Base relayers to complete the bridge operation"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program",
          "docs": [
            "Token2022 program used for burning the wrapped tokens.",
            "Required for all token operations including burn_checked."
          ]
        },
        {
          "name": "system_program",
          "docs": [
            "System program required for creating the outgoing message account."
          ]
        }
      ],
      "args": [
        {
          "name": "to",
          "type": {
            "array": [
              "u8",
              20
            ]
          }
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "call",
          "type": {
            "option": {
              "defined": {
                "name": "Call"
              }
            }
          }
        }
      ]
    },
    {
      "name": "bridge_wrapped_token_with_buffered_call",
      "docs": [
        "Bridges wrapped tokens from Solana back to Base with a call using buffered data.",
        "This function burns wrapped tokens on Solana and initiates a message to release",
        "the original tokens on Base, then executes a call using data from a call buffer.",
        "",
        "# Arguments",
        "* `ctx`    - The context containing accounts for the wrapped token bridge operation",
        "* `to`     - The 20-byte Ethereum address that will receive tokens on Base",
        "* `amount` - Amount of wrapped tokens to bridge back (in lamports)"
      ],
      "discriminator": [
        117,
        175,
        150,
        237,
        216,
        76,
        56,
        5
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "The account that pays for transaction fees and outgoing message account creation.",
            "Must be mutable to deduct lamports for account rent and gas fees."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "from",
          "docs": [
            "The token owner who is bridging their wrapped tokens back to Base.",
            "Must sign the transaction to authorize burning their tokens."
          ],
          "signer": true
        },
        {
          "name": "gas_fee_receiver",
          "docs": [
            "The account that receives payment for the gas costs of bridging the wrapped token to Base."
          ],
          "writable": true
        },
        {
          "name": "mint",
          "docs": [
            "The wrapped token mint account representing the original Base token.",
            "- Contains metadata linking to the original token on Base",
            "- Tokens will be burned from this mint"
          ],
          "writable": true
        },
        {
          "name": "from_token_account",
          "docs": [
            "The user's token account holding the wrapped tokens to be bridged.",
            "- Must contain sufficient token balance for the bridge amount",
            "- Tokens will be burned from this account"
          ],
          "writable": true
        },
        {
          "name": "bridge",
          "docs": [
            "The main bridge state account storing global bridge configuration.",
            "- Uses PDA with BRIDGE_SEED for deterministic address",
            "- Tracks nonce for message ordering and EIP-1559 gas pricing"
          ],
          "writable": true
        },
        {
          "name": "owner",
          "docs": [
            "The owner of the call buffer who will receive the rent refund."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "call_buffer",
          "docs": [
            "The call buffer account that stores the call data.",
            "This account will be closed and rent returned to the owner."
          ],
          "writable": true
        },
        {
          "name": "outgoing_message",
          "docs": [
            "The outgoing message account that stores the cross-chain transfer details."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program",
          "docs": [
            "Token2022 program used for burning the wrapped tokens.",
            "Required for all token operations including burn_checked."
          ]
        },
        {
          "name": "system_program",
          "docs": [
            "System program required for creating the outgoing message account."
          ]
        }
      ],
      "args": [
        {
          "name": "to",
          "type": {
            "array": [
              "u8",
              20
            ]
          }
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "close_call_buffer",
      "docs": [
        "Closes a call buffer account and returns the rent to the specified receiver.",
        "Only the owner of the call buffer can close it. This is useful if the user",
        "changed their mind or made a mistake and wants to recover the rent.",
        "",
        "# Arguments",
        "* `ctx` - The context containing the call buffer to close and rent receiver"
      ],
      "discriminator": [
        132,
        188,
        7,
        198,
        64,
        178,
        62,
        29
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "The account paying for the transaction fees and receiving the rent back.",
            "It must be the owner of the call buffer account."
          ],
          "signer": true
        },
        {
          "name": "call_buffer",
          "docs": [
            "The call buffer account to close"
          ],
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "docs": [
        "Initializes the bridge program with required state accounts.",
        "This function sets up the initial bridge configuration and must be called once during deployment.",
        "",
        "# Arguments",
        "* `ctx` - The context containing all accounts needed for initialization, including the guardian signer",
        "* `eip1559_config` - The EIP-1559 configuration, contains the gas target, adjustment denominator, window duration, and minimum base fee",
        "* `gas_cost_config` - The gas cost configuration, contains the gas cost scaler, gas cost scaler decimal precision, and gas fee receiver",
        "* `gas_config` - The gas configuration, contains the extra relay buffer, execution prologue buffer, execution buffer, execution epilogue buffer, base transaction cost, and max gas limit per message",
        "* `protocol_config` - The protocol configuration, contains the block interval requirement for output root registration",
        "* `buffer_config` - The buffer configuration, contains the maximum call buffer size"
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "The account that pays for the transaction and bridge account creation.",
            "Must be mutable to deduct lamports for account rent."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "bridge",
          "docs": [
            "The bridge state account being initialized.",
            "- Uses PDA with BRIDGE_SEED for deterministic address",
            "- Payer funds the account creation",
            "- Space allocated for bridge state (8-byte discriminator + Bridge::INIT_SPACE)"
          ],
          "writable": true
        },
        {
          "name": "guardian",
          "docs": [
            "The guardian account that will have administrative authority over the bridge.",
            "Must be a signer to ensure the initializer controls this account."
          ],
          "signer": true
        },
        {
          "name": "system_program",
          "docs": [
            "System program required for creating new accounts.",
            "Used internally by Anchor for account initialization."
          ]
        }
      ],
      "args": [
        {
          "name": "eip1559_config",
          "type": {
            "defined": {
              "name": "Eip1559Config"
            }
          }
        },
        {
          "name": "gas_cost_config",
          "type": {
            "defined": {
              "name": "GasCostConfig"
            }
          }
        },
        {
          "name": "gas_config",
          "type": {
            "defined": {
              "name": "GasConfig"
            }
          }
        },
        {
          "name": "protocol_config",
          "type": {
            "defined": {
              "name": "ProtocolConfig"
            }
          }
        },
        {
          "name": "buffer_config",
          "type": {
            "defined": {
              "name": "BufferConfig"
            }
          }
        }
      ]
    },
    {
      "name": "initialize_call_buffer",
      "docs": [
        "Initializes a call buffer account that can store large call data.",
        "This account can be used to build up call data over multiple transactions",
        "before using it in a bridge operation.",
        "",
        "# Arguments",
        "* `ctx`          - The context containing accounts for initialization (including bridge config)",
        "* `ty`           - The type of call (Call, DelegateCall, Create, Create2)",
        "* `to`           - The target contract address on Base",
        "* `value`        - The amount of ETH to send with the call (in wei)",
        "* `initial_data` - Initial call data to store",
        "* `max_data_len` - Maximum total length of data that will be stored"
      ],
      "discriminator": [
        85,
        68,
        100,
        234,
        255,
        226,
        95,
        72
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "The account that pays for the transaction and call buffer account creation"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "bridge",
          "docs": [
            "The bridge account containing configuration including max buffer size"
          ]
        },
        {
          "name": "call_buffer",
          "docs": [
            "The call buffer account being initialized"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program",
          "docs": [
            "System program required for creating new accounts"
          ]
        }
      ],
      "args": [
        {
          "name": "ty",
          "type": {
            "defined": {
              "name": "CallType"
            }
          }
        },
        {
          "name": "to",
          "type": {
            "array": [
              "u8",
              20
            ]
          }
        },
        {
          "name": "value",
          "type": "u128"
        },
        {
          "name": "initial_data",
          "type": "bytes"
        },
        {
          "name": "max_data_len",
          "type": "u64"
        }
      ]
    },
    {
      "name": "prove_message",
      "docs": [
        "Proves that a cross-chain message exists in the Base Bridge contract using an MMR proof.",
        "This function verifies the message was included in a previously registered output root",
        "and stores the proven message state for later relay execution.",
        "",
        "# Arguments",
        "* `ctx`          - The transaction context",
        "* `nonce`        - Unique identifier for the cross-chain message",
        "* `sender`       - The 20-byte Ethereum address that sent the message on Base",
        "* `data`         - The message payload/calldata to be executed on Solana",
        "* `proof`        - MMR proof demonstrating message inclusion in the output root",
        "* `message_hash` - The 32-byte hash of the message for verification"
      ],
      "discriminator": [
        172,
        66,
        78,
        136,
        158,
        187,
        47,
        115
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "The account that pays for the transaction and incoming message account creation.",
            "Must be mutable to deduct lamports for account rent."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "output_root",
          "docs": [
            "The output root account containing the merkle root from Base.",
            "Used to verify that the message proof is valid against the committed state.",
            "This root must have been previously registered via register_output_root instruction."
          ]
        },
        {
          "name": "message",
          "docs": [
            "The incoming message account being created to store the proven message.",
            "- Uses PDA with INCOMING_MESSAGE_SEED and message hash for deterministic address",
            "- Payer funds the account creation",
            "- Space dynamically allocated based on message data length",
            "- Once created, this account can be used by relay instructions to execute the message"
          ],
          "writable": true
        },
        {
          "name": "bridge",
          "docs": [
            "The main bridge state account used to check pause status",
            "- Uses PDA with BRIDGE_SEED for deterministic address"
          ]
        },
        {
          "name": "system_program",
          "docs": [
            "System program required for creating new accounts.",
            "Used internally by Anchor for account initialization."
          ]
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "sender",
          "type": {
            "array": [
              "u8",
              20
            ]
          }
        },
        {
          "name": "data",
          "type": "bytes"
        },
        {
          "name": "proof",
          "type": {
            "defined": {
              "name": "Proof"
            }
          }
        },
        {
          "name": "message_hash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "register_output_root",
      "docs": [
        "Registers an output root from Base to enable message verification.",
        "This function stores the MMR root of Base message state at a specific block number,",
        "which is required before any messages from that block can be proven and relayed.",
        "",
        "# Arguments",
        "* `ctx`               - The context containing accounts for storing the output root",
        "* `output_root`       - The 32-byte MMR root of Base messages for the given block",
        "* `base_block_number` - The Base block number this output root corresponds to",
        "* `total_leaf_count`  - The total amount of leaves in the MMR with this root"
      ],
      "discriminator": [
        215,
        66,
        12,
        154,
        4,
        123,
        196,
        66
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "The trusted oracle account that submits MMR roots from Base."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "root",
          "docs": [
            "The output root account being created to store the Base MMR root.",
            "- Uses PDA with OUTPUT_ROOT_SEED and base_block_number for deterministic address",
            "- Payer (trusted oracle) funds the account creation",
            "- Space allocated for output root state (8-byte discriminator + OutputRoot::INIT_SPACE)",
            "- Each output root corresponds to a specific Base block number"
          ],
          "writable": true
        },
        {
          "name": "bridge",
          "docs": [
            "The main bridge state account that tracks the latest registered Base block number.",
            "- Uses PDA with BRIDGE_SEED for deterministic address",
            "- Must be mutable to update the base_block_number field",
            "- Ensures output roots are registered in sequential order"
          ],
          "writable": true
        },
        {
          "name": "system_program",
          "docs": [
            "System program required for creating new accounts.",
            "Used internally by Anchor for output root account initialization."
          ]
        }
      ],
      "args": [
        {
          "name": "output_root",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "base_block_number",
          "type": "u64"
        },
        {
          "name": "total_leaf_count",
          "type": "u64"
        }
      ]
    },
    {
      "name": "relay_message",
      "docs": [
        "Executes a previously proven cross-chain message on Solana.",
        "This function takes a message that has been proven via `prove_message` and executes",
        "its payload, completing the cross-chain message transfer from Base to Solana.",
        "",
        "# Arguments",
        "* `ctx` - The transaction context"
      ],
      "discriminator": [
        187,
        90,
        182,
        138,
        51,
        248,
        175,
        98
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "The account that pays for the transaction execution fees.",
            "Must be mutable to deduct lamports for transaction costs."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "message",
          "docs": [
            "The incoming message account containing the cross-chain message to be executed.",
            "- Contains either a pure call message or a transfer message with additional instructions",
            "- Must be mutable to mark the message as executed after processing",
            "- Prevents replay attacks by tracking execution status"
          ],
          "writable": true
        },
        {
          "name": "bridge",
          "docs": [
            "The main bridge state account used to check pause status",
            "- Uses PDA with BRIDGE_SEED for deterministic address"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "set_adjustment_denominator",
      "docs": [
        "Set the adjustment denominator for EIP-1559 pricing",
        "Only the guardian can call this function",
        "",
        "# Arguments",
        "* `ctx` - The context containing the bridge account and guardian",
        "* `new_denominator` - The new adjustment denominator (must be >= 1 and <= 100)"
      ],
      "discriminator": [
        31,
        91,
        190,
        63,
        164,
        7,
        31,
        150
      ],
      "accounts": [
        {
          "name": "bridge",
          "docs": [
            "The bridge account containing configuration"
          ],
          "writable": true
        },
        {
          "name": "guardian",
          "docs": [
            "The guardian account authorized to update configuration"
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "new_denominator",
          "type": "u64"
        }
      ]
    },
    {
      "name": "set_block_interval_requirement",
      "docs": [
        "Set the block interval requirement for Protocol Config",
        "Only the guardian can call this function",
        "",
        "# Arguments",
        "* `ctx` - The context containing the bridge account and guardian",
        "* `new_interval` - The new block interval requirement value"
      ],
      "discriminator": [
        76,
        70,
        237,
        100,
        33,
        108,
        19,
        42
      ],
      "accounts": [
        {
          "name": "bridge",
          "docs": [
            "The bridge account containing configuration"
          ],
          "writable": true
        },
        {
          "name": "guardian",
          "docs": [
            "The guardian account authorized to update configuration"
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "new_interval",
          "type": "u64"
        }
      ]
    },
    {
      "name": "set_gas_cost_scaler",
      "docs": [
        "Set the gas cost scaler for Gas Cost Config",
        "Only the guardian can call this function",
        "",
        "# Arguments",
        "* `ctx` - The context containing the bridge account and guardian",
        "* `new_scaler` - The new gas cost scaler value (must be > 0 and <= 1,000,000,000)"
      ],
      "discriminator": [
        148,
        146,
        101,
        170,
        5,
        6,
        222,
        119
      ],
      "accounts": [
        {
          "name": "bridge",
          "docs": [
            "The bridge account containing configuration"
          ],
          "writable": true
        },
        {
          "name": "guardian",
          "docs": [
            "The guardian account authorized to update configuration"
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "new_scaler",
          "type": "u64"
        }
      ]
    },
    {
      "name": "set_gas_cost_scaler_dp",
      "docs": [
        "Set the gas cost scaler DP for Gas Cost Config",
        "Only the guardian can call this function",
        "",
        "# Arguments",
        "* `ctx` - The context containing the bridge account and guardian",
        "* `new_dp` - The new gas cost scaler DP value (must be > 0 and <= 1,000,000,000)"
      ],
      "discriminator": [
        198,
        111,
        160,
        55,
        172,
        138,
        99,
        164
      ],
      "accounts": [
        {
          "name": "bridge",
          "docs": [
            "The bridge account containing configuration"
          ],
          "writable": true
        },
        {
          "name": "guardian",
          "docs": [
            "The guardian account authorized to update configuration"
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "new_dp",
          "type": "u64"
        }
      ]
    },
    {
      "name": "set_gas_fee_receiver",
      "docs": [
        "Set the gas fee receiver for Gas Cost Config",
        "Only the guardian can call this function",
        "",
        "# Arguments",
        "* `ctx` - The context containing the bridge account and guardian",
        "* `new_receiver` - The new gas fee receiver"
      ],
      "discriminator": [
        58,
        188,
        230,
        188,
        47,
        188,
        79,
        154
      ],
      "accounts": [
        {
          "name": "bridge",
          "docs": [
            "The bridge account containing configuration"
          ],
          "writable": true
        },
        {
          "name": "guardian",
          "docs": [
            "The guardian account authorized to update configuration"
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "new_receiver",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "set_gas_per_call",
      "docs": [
        "Set the gas amount per call for Gas Config",
        "Only the guardian can call this function",
        "",
        "# Arguments",
        "* `ctx` - The context containing the bridge account and guardian",
        "* `new_val` - The new gas amount per call value"
      ],
      "discriminator": [
        164,
        95,
        213,
        130,
        26,
        69,
        82,
        127
      ],
      "accounts": [
        {
          "name": "bridge",
          "docs": [
            "The bridge account containing configuration"
          ],
          "writable": true
        },
        {
          "name": "guardian",
          "docs": [
            "The guardian account authorized to update configuration"
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "new_val",
          "type": "u64"
        }
      ]
    },
    {
      "name": "set_gas_target",
      "docs": [
        "Set the gas target for EIP-1559 pricing",
        "Only the guardian can call this function",
        "",
        "# Arguments",
        "* `ctx` - The context containing the bridge account and guardian",
        "* `new_target` - The new gas target value (must be > 0 and <= 1,000,000,000)"
      ],
      "discriminator": [
        132,
        25,
        19,
        13,
        118,
        63,
        167,
        102
      ],
      "accounts": [
        {
          "name": "bridge",
          "docs": [
            "The bridge account containing configuration"
          ],
          "writable": true
        },
        {
          "name": "guardian",
          "docs": [
            "The guardian account authorized to update configuration"
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "new_target",
          "type": "u64"
        }
      ]
    },
    {
      "name": "set_max_call_buffer_size",
      "docs": [
        "Set the max call buffer size for Buffer Config",
        "Only the guardian can call this function",
        "",
        "# Arguments",
        "* `ctx` - The context containing the bridge account and guardian",
        "* `new_size` - The new max call buffer size value"
      ],
      "discriminator": [
        140,
        178,
        4,
        238,
        245,
        66,
        117,
        189
      ],
      "accounts": [
        {
          "name": "bridge",
          "docs": [
            "The bridge account containing configuration"
          ],
          "writable": true
        },
        {
          "name": "guardian",
          "docs": [
            "The guardian account authorized to update configuration"
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "new_size",
          "type": "u64"
        }
      ]
    },
    {
      "name": "set_minimum_base_fee",
      "docs": [
        "Set the minimum base fee for EIP-1559 pricing",
        "Only the guardian can call this function",
        "",
        "# Arguments",
        "* `ctx` - The context containing the bridge account and guardian",
        "* `new_fee` - The new minimum base fee value (must be > 0 and <= 1,000,000,000)"
      ],
      "discriminator": [
        56,
        95,
        58,
        94,
        221,
        136,
        138,
        156
      ],
      "accounts": [
        {
          "name": "bridge",
          "docs": [
            "The bridge account containing configuration"
          ],
          "writable": true
        },
        {
          "name": "guardian",
          "docs": [
            "The guardian account authorized to update configuration"
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "new_fee",
          "type": "u64"
        }
      ]
    },
    {
      "name": "set_pause_status",
      "docs": [
        "Set the pause status for the bridge",
        "Only the guardian can call this function",
        "",
        "# Arguments",
        "* `ctx` - The context containing the bridge account and guardian",
        "* `new_paused` - The new pause status (true for paused, false for unpaused)"
      ],
      "discriminator": [
        118,
        25,
        145,
        217,
        114,
        209,
        236,
        145
      ],
      "accounts": [
        {
          "name": "bridge",
          "docs": [
            "The bridge account containing configuration"
          ],
          "writable": true
        },
        {
          "name": "guardian",
          "docs": [
            "The guardian account authorized to update configuration"
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "new_paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "set_window_duration",
      "docs": [
        "Set the window duration for EIP-1559 pricing",
        "Only the guardian can call this function",
        "",
        "# Arguments",
        "* `ctx` - The context containing the bridge account and guardian",
        "* `new_duration` - The new window duration in seconds (must be > 0 and <= 3600)"
      ],
      "discriminator": [
        229,
        2,
        41,
        119,
        55,
        255,
        252,
        205
      ],
      "accounts": [
        {
          "name": "bridge",
          "docs": [
            "The bridge account containing configuration"
          ],
          "writable": true
        },
        {
          "name": "guardian",
          "docs": [
            "The guardian account authorized to update configuration"
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "new_duration",
          "type": "u64"
        }
      ]
    },
    {
      "name": "transfer_guardian",
      "docs": [
        "Transfer guardian authority to a new pubkey",
        "Only the current guardian can call this function",
        "",
        "# Arguments",
        "* `ctx` - The context containing the bridge account and current guardian",
        "* `new_guardian` - The pubkey of the new guardian"
      ],
      "discriminator": [
        118,
        250,
        162,
        85,
        197,
        130,
        116,
        123
      ],
      "accounts": [
        {
          "name": "bridge",
          "writable": true
        },
        {
          "name": "guardian",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "new_guardian",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "wrap_token",
      "docs": [
        "Creates a wrapped version of a Base token.",
        "This function creates a new SPL mint account on Solana that represents the Base token,",
        "enabling users to bridge the token between the two chains. It will also trigger a message",
        "to Base to register the wrapped token in the Base Bridge contract.",
        "",
        "# Arguments",
        "* `ctx`                    - The transaction context",
        "* `decimals`               - Number of decimal places for the token",
        "* `partial_token_metadata` - Token name, symbol, and other metadata for the ERC20 contract"
      ],
      "discriminator": [
        203,
        83,
        204,
        83,
        225,
        109,
        44,
        6
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "The account that pays for the transaction and all account creation costs.",
            "Must be mutable to deduct lamports for mint creation, metadata storage, and gas fees."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "gas_fee_receiver",
          "docs": [
            "The account that receives payment for the gas costs of registering the token on Base."
          ],
          "writable": true
        },
        {
          "name": "mint",
          "docs": [
            "The new SPL Token-2022 mint being created for the wrapped token.",
            "- Uses PDA with token metadata hash and decimals for deterministic address",
            "- Mint authority set to itself (mint account) for controlled minting",
            "- Includes metadata pointer extension to store token information onchain"
          ],
          "writable": true
        },
        {
          "name": "bridge",
          "docs": [
            "The main bridge state account that tracks cross-chain operations.",
            "Used to increment the nonce counter and manage EIP-1559 gas pricing.",
            "Must be mutable to update the nonce after creating the outgoing message."
          ],
          "writable": true
        },
        {
          "name": "outgoing_message",
          "docs": [
            "The outgoing message account that stores the cross-chain call to register",
            "the wrapped token on the Base blockchain. Contains the encoded function call",
            "with token address, local mint address, and scaling parameters."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program",
          "docs": [
            "SPL Token-2022 program for creating the mint with metadata extensions.",
            "Required for initializing tokens with advanced features like metadata pointer."
          ]
        },
        {
          "name": "system_program",
          "docs": [
            "System program required for creating new accounts and transferring lamports.",
            "Used internally by Anchor for account initialization and rent payments."
          ]
        }
      ],
      "args": [
        {
          "name": "decimals",
          "type": "u8"
        },
        {
          "name": "partial_token_metadata",
          "type": {
            "defined": {
              "name": "PartialTokenMetadata"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "Bridge",
      "discriminator": [
        231,
        232,
        31,
        98,
        110,
        3,
        23,
        59
      ]
    },
    {
      "name": "CallBuffer",
      "discriminator": [
        134,
        143,
        168,
        251,
        163,
        216,
        180,
        113
      ]
    },
    {
      "name": "IncomingMessage",
      "discriminator": [
        30,
        144,
        125,
        111,
        211,
        223,
        91,
        170
      ]
    },
    {
      "name": "OutgoingMessage",
      "discriminator": [
        150,
        255,
        197,
        226,
        200,
        215,
        31,
        29
      ]
    },
    {
      "name": "OutputRoot",
      "discriminator": [
        11,
        31,
        168,
        201,
        229,
        8,
        180,
        198
      ]
    }
  ],
  "events": [
    {
      "name": "GuardianTransferred",
      "discriminator": [
        196,
        51,
        251,
        192,
        12,
        108,
        41,
        137
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "IncorrectGasFeeReceiver",
      "msg": "Incorrect gas fee receiver"
    },
    {
      "code": 6001,
      "name": "BridgePaused",
      "msg": "Bridge is paused"
    }
  ],
  "types": [
    {
      "name": "Bridge",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "base_block_number",
            "docs": [
              "The Base block number associated with the latest registered output root."
            ],
            "type": "u64"
          },
          {
            "name": "nonce",
            "docs": [
              "Incremental nonce assigned to each message."
            ],
            "type": "u64"
          },
          {
            "name": "guardian",
            "docs": [
              "Guardian pubkey authorized to update configuration"
            ],
            "type": "pubkey"
          },
          {
            "name": "paused",
            "docs": [
              "Whether the bridge is paused (emergency stop mechanism)"
            ],
            "type": "bool"
          },
          {
            "name": "eip1559",
            "docs": [
              "EIP-1559 state and configuration for dynamic pricing."
            ],
            "type": {
              "defined": {
                "name": "Eip1559"
              }
            }
          },
          {
            "name": "gas_cost_config",
            "docs": [
              "Gas cost configuration"
            ],
            "type": {
              "defined": {
                "name": "GasCostConfig"
              }
            }
          },
          {
            "name": "gas_config",
            "docs": [
              "Gas configuration"
            ],
            "type": {
              "defined": {
                "name": "GasConfig"
              }
            }
          },
          {
            "name": "protocol_config",
            "docs": [
              "Protocol configuration"
            ],
            "type": {
              "defined": {
                "name": "ProtocolConfig"
              }
            }
          },
          {
            "name": "buffer_config",
            "docs": [
              "Buffer configuration"
            ],
            "type": {
              "defined": {
                "name": "BufferConfig"
              }
            }
          }
        ]
      }
    },
    {
      "name": "BufferConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "max_call_buffer_size",
            "docs": [
              "Maximum call buffer size"
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Call",
      "docs": [
        "Represents a contract call to be executed on Base.",
        "Contains all the necessary information to perform various types of contract interactions,",
        "including regular calls, delegate calls, and contract creation operations."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ty",
            "docs": [
              "The type of call operation to perform (Call, DelegateCall, Create, or Create2).",
              "Determines how the call will be executed on the Base side."
            ],
            "type": {
              "defined": {
                "name": "CallType"
              }
            }
          },
          {
            "name": "to",
            "docs": [
              "The target address on Base (20 bytes for Ethereum-compatible address).",
              "Must be set to zero for Create and Create2 operations."
            ],
            "type": {
              "array": [
                "u8",
                20
              ]
            }
          },
          {
            "name": "value",
            "docs": [
              "The amount of native currency (ETH) to send with this call, in wei."
            ],
            "type": "u128"
          },
          {
            "name": "data",
            "docs": [
              "The encoded function call data or contract bytecode.",
              "For regular calls: ABI-encoded function signature and parameters.",
              "For contract creation: the contract's initialization bytecode."
            ],
            "type": "bytes"
          }
        ]
      }
    },
    {
      "name": "CallBuffer",
      "docs": [
        "A buffer account that stores call parameters which can be built up over multiple transactions",
        "to bypass Solana's transaction size limits. The data field can be appended to incrementally",
        "and the account is consumed when the call is bridged to Base."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "docs": [
              "The owner who can modify this call buffer"
            ],
            "type": "pubkey"
          },
          {
            "name": "ty",
            "docs": [
              "The type of call operation to perform (Call, DelegateCall, Create, or Create2).",
              "Determines how the call will be executed on the Base side."
            ],
            "type": {
              "defined": {
                "name": "CallType"
              }
            }
          },
          {
            "name": "to",
            "docs": [
              "The target address on Base (20 bytes for Ethereum-compatible address).",
              "Must be set to zero for Create and Create2 operations."
            ],
            "type": {
              "array": [
                "u8",
                20
              ]
            }
          },
          {
            "name": "value",
            "docs": [
              "The amount of native currency (ETH) to send with this call, in wei."
            ],
            "type": "u128"
          },
          {
            "name": "data",
            "docs": [
              "The encoded function call data or contract bytecode.",
              "For regular calls: ABI-encoded function signature and parameters.",
              "For contract creation: the contract's initialization bytecode."
            ],
            "type": "bytes"
          }
        ]
      }
    },
    {
      "name": "CallType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Call"
          },
          {
            "name": "DelegateCall"
          },
          {
            "name": "Create"
          },
          {
            "name": "Create2"
          }
        ]
      }
    },
    {
      "name": "Eip1559",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "config",
            "type": {
              "defined": {
                "name": "Eip1559Config"
              }
            }
          },
          {
            "name": "current_base_fee",
            "docs": [
              "Current base fee in gwei (runtime state)"
            ],
            "type": "u64"
          },
          {
            "name": "current_window_gas_used",
            "docs": [
              "Gas used in the current time window (runtime state)"
            ],
            "type": "u64"
          },
          {
            "name": "window_start_time",
            "docs": [
              "Unix timestamp when the current window started (runtime state)"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "Eip1559Config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "target",
            "docs": [
              "Gas target per window (configurable)"
            ],
            "type": "u64"
          },
          {
            "name": "denominator",
            "docs": [
              "Adjustment denominator (controls rate of change) (configurable)"
            ],
            "type": "u64"
          },
          {
            "name": "window_duration_seconds",
            "docs": [
              "Window duration in seconds (configurable)"
            ],
            "type": "u64"
          },
          {
            "name": "minimum_base_fee",
            "docs": [
              "Minimum base fee floor (configurable)"
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "FinalizeBridgeSol",
      "docs": [
        "Parameters for finalizing a SOL transfer from Base to Solana.",
        "",
        "This struct contains all the necessary information to complete a cross-chain",
        "SOL transfer that was initiated on Base. The SOL is held in",
        "a program-derived account (vault) until the transfer is finalized on Solana."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "remote_token",
            "docs": [
              "The 20-byte address of the token contract on Base.",
              "This is used as a seed to derive the SOL vault PDA that holds the escrowed SOL.",
              "Even though this is a SOL transfer, we need the remote token identifier",
              "to locate the correct vault."
            ],
            "type": {
              "array": [
                "u8",
                20
              ]
            }
          },
          {
            "name": "to",
            "docs": [
              "The Solana public key of the recipient who will receive the SOL.",
              "This must match the intended recipient specified in the original bridge message."
            ],
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "The amount of SOL to transfer, denominated in lamports (1 SOL = 1,000,000,000 lamports).",
              "This amount will be transferred from the SOL vault to the recipient."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "FinalizeBridgeSpl",
      "docs": [
        "Data structure for finalizing SPL token transfers from Base to Solana.",
        "",
        "This struct contains all the necessary information to complete a cross-chain",
        "SPL token transfer that was initiated on Base and is being finalized on Solana.",
        "It handles the release of tokens from a program-controlled vault to the",
        "designated recipient on Solana."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "remote_token",
            "docs": [
              "The token contract address on Base.",
              "This is a 20-byte address representing the ERC-20 token",
              "contract on Base that was originally bridged. Used to derive the",
              "token vault PDA and ensure proper token mapping between chains."
            ],
            "type": {
              "array": [
                "u8",
                20
              ]
            }
          },
          {
            "name": "local_token",
            "docs": [
              "The SPL token mint public key on Solana.",
              "This represents the corresponding SPL token on Solana that mirrors",
              "the remote token."
            ],
            "type": "pubkey"
          },
          {
            "name": "to",
            "docs": [
              "The recipient's token account public key on Solana.",
              "This is the SPL token account that will receive the bridged tokens.",
              "Must be an associated token account or valid token account owned",
              "by the intended recipient and matching the local_token mint."
            ],
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "The amount of tokens to transfer in the token's base units.",
              "This amount respects the token's decimal precision as defined by",
              "the mint. The transfer will be validated using transfer_checked",
              "to ensure decimal accuracy."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "FinalizeBridgeWrappedToken",
      "docs": [
        "Instruction data for finalizing a wrapped token transfer from Base to Solana.",
        "",
        "This struct represents the final step in a cross-chain bridge operation where tokens",
        "that were originally on Base are being bridged to Solana as wrapped tokens. The",
        "finalization process mints the appropriate amount of wrapped tokens to the recipient's",
        "token account on Solana.",
        "",
        "The wrapped token mint is derived deterministically from the original token's metadata",
        "and decimals, ensuring consistency across bridge operations."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "local_token",
            "docs": [
              "The mint address of the wrapped token on Solana.",
              "This is a PDA that represents the Solana version",
              "of a token that originally exists on Base. The mint address is derived",
              "deterministically from the original token's metadata and decimals."
            ],
            "type": "pubkey"
          },
          {
            "name": "to",
            "docs": [
              "The destination token account that will receive the wrapped tokens.",
              "This must be a valid token account that is associated with the wrapped",
              "token mint and owned by the intended recipient of the bridged tokens."
            ],
            "type": "pubkey"
          },
          {
            "name": "amount",
            "docs": [
              "The amount of wrapped tokens to mint to the recipient.",
              "The amount is specified in the token's smallest unit."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "GasConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gas_per_call",
            "docs": [
              "Amount of gas per cross-chain message"
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "GasCostConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "gas_cost_scaler",
            "docs": [
              "Scaling factor for gas cost calculations"
            ],
            "type": "u64"
          },
          {
            "name": "gas_cost_scaler_dp",
            "docs": [
              "Decimal precision for gas cost calculations"
            ],
            "type": "u64"
          },
          {
            "name": "gas_fee_receiver",
            "docs": [
              "Account that receives gas fees"
            ],
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "GuardianTransferred",
      "docs": [
        "Event for monitoring guardian transfers"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "old_guardian",
            "type": "pubkey"
          },
          {
            "name": "new_guardian",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "IncomingMessage",
      "docs": [
        "Represents a cross-chain message sent from Base to Solana",
        "that is waiting to be processed or has already been executed.",
        "",
        "This struct stores the essential information needed to validate and execute",
        "bridge operations from Base to Solana, including both simple calls and token transfers."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "sender",
            "docs": [
              "The 20-byte Ethereum address of the sender on Base who initiated this bridge operation.",
              "This is used for verification and access control during message execution."
            ],
            "type": {
              "array": [
                "u8",
                20
              ]
            }
          },
          {
            "name": "message",
            "docs": [
              "The actual message payload containing either instruction calls or token transfer data.",
              "This enum determines what type of operation will be executed on Solana."
            ],
            "type": {
              "defined": {
                "name": "bridge::base_to_solana::state::incoming_message::Message"
              }
            }
          },
          {
            "name": "executed",
            "docs": [
              "Flag indicating whether this message has been successfully executed on Solana.",
              "Once set to true, the message cannot be executed again, preventing replay attacks."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "Ix",
      "docs": [
        "Instruction to be executed by the wallet.",
        "Functionally equivalent to a Solana Instruction."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "program_id",
            "docs": [
              "Program that will process this instruction."
            ],
            "type": "pubkey"
          },
          {
            "name": "accounts",
            "docs": [
              "Accounts required for this instruction."
            ],
            "type": {
              "vec": {
                "defined": {
                  "name": "IxAccount"
                }
              }
            }
          },
          {
            "name": "data",
            "docs": [
              "Instruction data."
            ],
            "type": "bytes"
          }
        ]
      }
    },
    {
      "name": "IxAccount",
      "docs": [
        "Account used in an instruction.",
        "Identical to Solana's AccountMeta but implements AnchorSerialize and AnchorDeserialize."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pubkey_or_pda",
            "docs": [
              "Public key of the account."
            ],
            "type": {
              "defined": {
                "name": "PubkeyOrPda"
              }
            }
          },
          {
            "name": "is_writable",
            "docs": [
              "Whether the account is writable."
            ],
            "type": "bool"
          },
          {
            "name": "is_signer",
            "docs": [
              "Whether the account is a signer."
            ],
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "OutgoingMessage",
      "docs": [
        "Represents a message being sent from Solana to Base through the bridge.",
        "This struct contains all the necessary information to execute a cross-chain operation",
        "on the Base side, including the message content and execution parameters."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nonce",
            "docs": [
              "Sequential number for this message to ensure ordering and prevent replay attacks.",
              "Starts at 1 and is incremented for each new message."
            ],
            "type": "u64"
          },
          {
            "name": "sender",
            "docs": [
              "The Solana public key of the account that initiated this cross-chain message.",
              "This is used for authentication and to identify the message originator on Base."
            ],
            "type": "pubkey"
          },
          {
            "name": "message",
            "docs": [
              "The actual message payload that will be executed on Base.",
              "Can be either a direct contract call or a token transfer (with optional call)."
            ],
            "type": {
              "defined": {
                "name": "bridge::solana_to_base::state::outgoing_message::Message"
              }
            }
          }
        ]
      }
    },
    {
      "name": "OutputRoot",
      "docs": [
        "Represents a cryptographic commitment to the state of the Base L2 chain at a specific block.",
        "",
        "OutputRoots are submitted by proposers and serve as checkpoints that allow messages",
        "and state from Base to be proven and relayed to Solana. Each OutputRoot contains",
        "an MMR root that commits to the state of all messages on Base at",
        "a particular block height.",
        "",
        "This struct is used in the Base → Solana message passing flow, where:",
        "1. Proposers submit OutputRoots for Base blocks",
        "2. Users can prove their messages were included in Base using these roots",
        "3. Messages are then relayed and executed on Solana"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "root",
            "docs": [
              "The 32-byte MMR root that commits to the complete state of the Bridge contract on Base",
              "at a specific block height."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "total_leaf_count",
            "docs": [
              "The total number of leaves that were present in the MMR when this root",
              "was generated. This is crucial for determining the MMR structure and",
              "mountain configuration at the time of proof validation."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "PartialTokenMetadata",
      "docs": [
        "Represents token metadata for tokens that are bridged between Base and Solana.",
        "",
        "This struct contains metadata needed to represent a token that exists on both",
        "chains, including information about its remote counterpart and any scaling factors needed",
        "to handle differences between the chains (such as decimal precision).",
        "",
        "The metadata is stored in the Solana Token-2022 program's additional metadata field and",
        "can be used to reconstruct the relationship between tokens on both sides of the bridge."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "docs": [
              "The human-readable name of the token (e.g., \"Wrapped Bitcoin\")"
            ],
            "type": "string"
          },
          {
            "name": "symbol",
            "docs": [
              "The symbol/ticker of the token (e.g., \"WBTC\")"
            ],
            "type": "string"
          },
          {
            "name": "remote_token",
            "docs": [
              "The 20-byte address of the corresponding token contract on Base.",
              "This allows the bridge to identify which Base token this Solana token represents."
            ],
            "type": {
              "array": [
                "u8",
                20
              ]
            }
          },
          {
            "name": "scaler_exponent",
            "docs": [
              "The scaling exponent used to convert between token amounts on different chains.",
              "This handles cases where tokens have different decimal precision on Base vs Solana.",
              "For example, if Base token has 18 decimals and Solana token has 9 decimals,",
              "this would be used to scale amounts appropriately during bridging operations."
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "Proof",
      "docs": [
        "Represents a Merkle Mountain Range (MMR) proof that can be used to verify",
        "the inclusion of a specific leaf in the MMR.",
        "",
        "An MMR proof contains all the necessary information to reconstruct the MMR root",
        "from a given leaf, proving that the leaf was included in the MMR at the time",
        "the proof was generated."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proof",
            "docs": [
              "The proof elements consisting of:",
              "1. Sibling hashes along the path from the leaf to its mountain's peak",
              "2. The hashes of all other mountain peaks (in left-to-right order)",
              "",
              "These elements are used to reconstruct the MMR root and verify leaf inclusion."
            ],
            "type": {
              "vec": {
                "array": [
                  "u8",
                  32
                ]
              }
            }
          },
          {
            "name": "leaf_index",
            "docs": [
              "The 0-indexed position of the leaf being proven within the MMR.",
              "This index determines which mountain the leaf belongs to and its position",
              "within that mountain."
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "ProtocolConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "block_interval_requirement",
            "docs": [
              "Block interval requirement for output root registration"
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "PubkeyOrPda",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Pubkey",
            "fields": [
              "pubkey"
            ]
          },
          {
            "name": "PDA",
            "fields": [
              {
                "name": "seeds",
                "type": {
                  "vec": "bytes"
                }
              },
              {
                "name": "program_id",
                "type": "pubkey"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "bridge::base_to_solana::state::incoming_message::Message",
      "docs": [
        "Defines the type of cross-chain operation being performed from Base to Solana.",
        "",
        "This enum encapsulates the two main categories of bridge operations:",
        "general instruction calls and token transfers with optional additional instructions."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Call",
            "fields": [
              {
                "vec": {
                  "defined": {
                    "name": "Ix"
                  }
                }
              }
            ]
          },
          {
            "name": "Transfer",
            "fields": [
              {
                "name": "transfer",
                "docs": [
                  "The specific type of token transfer (SOL, SPL token, or wrapped token)"
                ],
                "type": {
                  "defined": {
                    "name": "bridge::base_to_solana::state::incoming_message::Transfer"
                  }
                }
              },
              {
                "name": "ixs",
                "docs": [
                  "Additional Solana instructions to execute after the transfer is finalized"
                ],
                "type": {
                  "vec": {
                    "defined": {
                      "name": "Ix"
                    }
                  }
                }
              }
            ]
          }
        ]
      }
    },
    {
      "name": "bridge::base_to_solana::state::incoming_message::Transfer",
      "docs": [
        "Specifies the type of token being transferred from Base to Solana and contains",
        "the necessary data to finalize the transfer on the Solana side.",
        "",
        "Each variant corresponds to a different token type that can be bridged,",
        "with variant-specific data needed to complete the transfer operation."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Sol",
            "fields": [
              {
                "defined": {
                  "name": "FinalizeBridgeSol"
                }
              }
            ]
          },
          {
            "name": "Spl",
            "fields": [
              {
                "defined": {
                  "name": "FinalizeBridgeSpl"
                }
              }
            ]
          },
          {
            "name": "WrappedToken",
            "fields": [
              {
                "defined": {
                  "name": "FinalizeBridgeWrappedToken"
                }
              }
            ]
          }
        ]
      }
    },
    {
      "name": "bridge::solana_to_base::state::outgoing_message::Message",
      "docs": [
        "Represents the type of cross-chain operation to be executed on Base.",
        "This enum encapsulates the two main types of operations supported by the bridge:",
        "direct contract calls and token transfers with optional contract calls."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Call",
            "fields": [
              {
                "defined": {
                  "name": "Call"
                }
              }
            ]
          },
          {
            "name": "Transfer",
            "fields": [
              {
                "defined": {
                  "name": "bridge::solana_to_base::state::outgoing_message::Transfer"
                }
              }
            ]
          }
        ]
      }
    },
    {
      "name": "bridge::solana_to_base::state::outgoing_message::Transfer",
      "docs": [
        "Represents a token transfer from Solana to Base with optional contract execution.",
        "This struct contains all the information needed to bridge tokens between chains",
        "and optionally execute additional logic on the destination chain after the transfer."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "to",
            "docs": [
              "The recipient address on Base that will receive the bridged tokens."
            ],
            "type": {
              "array": [
                "u8",
                20
              ]
            }
          },
          {
            "name": "local_token",
            "docs": [
              "The token mint address on Solana that is being bridged.",
              "This identifies which token on Solana is being transferred cross-chain."
            ],
            "type": "pubkey"
          },
          {
            "name": "remote_token",
            "docs": [
              "The corresponding token contract address on Base.",
              "This is the token that will be minted or unlocked on the Base side."
            ],
            "type": {
              "array": [
                "u8",
                20
              ]
            }
          },
          {
            "name": "amount",
            "docs": [
              "The amount of tokens to transfer, in the token's smallest unit.",
              "This amount will be burned/locked on Solana and minted/unlocked on Base."
            ],
            "type": "u64"
          },
          {
            "name": "call",
            "docs": [
              "Optional contract call to execute on Base after the token transfer completes.",
              "Allows for complex cross-chain operations that combine token transfers with logic execution."
            ],
            "type": {
              "option": {
                "defined": {
                  "name": "Call"
                }
              }
            }
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "BRIDGE_CPI_AUTHORITY_SEED",
      "type": "bytes",
      "value": "[98, 114, 105, 100, 103, 101, 95, 99, 112, 105, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]"
    },
    {
      "name": "BRIDGE_SEED",
      "type": "bytes",
      "value": "[98, 114, 105, 100, 103, 101]"
    },
    {
      "name": "INCOMING_MESSAGE_SEED",
      "type": "bytes",
      "value": "[105, 110, 99, 111, 109, 105, 110, 103, 95, 109, 101, 115, 115, 97, 103, 101]"
    },
    {
      "name": "NATIVE_SOL_PUBKEY",
      "type": "pubkey",
      "value": "SoL1111111111111111111111111111111111111111"
    },
    {
      "name": "OUTPUT_ROOT_SEED",
      "type": "bytes",
      "value": "[111, 117, 116, 112, 117, 116, 95, 114, 111, 111, 116]"
    },
    {
      "name": "REMOTE_TOKEN_METADATA_KEY",
      "type": "string",
      "value": "\"remote_token\""
    },
    {
      "name": "SCALER_EXPONENT_METADATA_KEY",
      "type": "string",
      "value": "\"scaler_exponent\""
    },
    {
      "name": "SOL_VAULT_SEED",
      "type": "bytes",
      "value": "[115, 111, 108, 95, 118, 97, 117, 108, 116]"
    },
    {
      "name": "TOKEN_VAULT_SEED",
      "type": "bytes",
      "value": "[116, 111, 107, 101, 110, 95, 118, 97, 117, 108, 116]"
    },
    {
      "name": "TRUSTED_ORACLE",
      "type": "pubkey",
      "value": "4vTj5kmBrmds3zWogiyUxtZPggcVUmG44EXRy2CxTcEZ"
    },
    {
      "name": "WRAPPED_TOKEN_SEED",
      "type": "bytes",
      "value": "[119, 114, 97, 112, 112, 101, 100, 95, 116, 111, 107, 101, 110]"
    }
  ]
} as const;