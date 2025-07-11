export const IDL = {
  "metadata": {
    "name": "bridge",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "bridge_call",
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
          "writable": true,
          "signer": true
        },
        {
          "name": "from",
          "signer": true
        },
        {
          "name": "gas_fee_receiver",
          "writable": true
        },
        {
          "name": "bridge",
          "writable": true
        },
        {
          "name": "outgoing_message",
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program"
        }
      ],
      "args": [
        {
          "name": "gas_limit",
          "type": "u64"
        },
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
      "name": "bridge_sol",
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
          "writable": true,
          "signer": true
        },
        {
          "name": "from",
          "signer": true
        },
        {
          "name": "gas_fee_receiver",
          "writable": true
        },
        {
          "name": "sol_vault",
          "writable": true
        },
        {
          "name": "bridge",
          "writable": true
        },
        {
          "name": "outgoing_message",
          "writable": true,
          "signer": true
        },
        {
          "name": "system_program"
        }
      ],
      "args": [
        {
          "name": "gas_limit",
          "type": "u64"
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
      "name": "bridge_spl",
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
          "writable": true,
          "signer": true
        },
        {
          "name": "from",
          "signer": true
        },
        {
          "name": "gas_fee_receiver",
          "writable": true
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "from_token_account",
          "writable": true
        },
        {
          "name": "token_vault",
          "writable": true
        },
        {
          "name": "bridge",
          "writable": true
        },
        {
          "name": "outgoing_message",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program"
        },
        {
          "name": "system_program"
        }
      ],
      "args": [
        {
          "name": "gas_limit",
          "type": "u64"
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
      "name": "bridge_wrapped_token",
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
          "writable": true,
          "signer": true
        },
        {
          "name": "from",
          "signer": true
        },
        {
          "name": "gas_fee_receiver",
          "writable": true
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "from_token_account",
          "writable": true
        },
        {
          "name": "bridge",
          "writable": true
        },
        {
          "name": "outgoing_message",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program"
        },
        {
          "name": "system_program"
        }
      ],
      "args": [
        {
          "name": "gas_limit",
          "type": "u64"
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
      "name": "initialize",
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
          "writable": true,
          "signer": true
        },
        {
          "name": "bridge",
          "writable": true
        },
        {
          "name": "system_program"
        }
      ],
      "args": []
    },
    {
      "name": "prove_message",
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
          "writable": true,
          "signer": true
        },
        {
          "name": "output_root"
        },
        {
          "name": "message",
          "writable": true
        },
        {
          "name": "system_program"
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
          "writable": true,
          "signer": true
        },
        {
          "name": "root",
          "writable": true
        },
        {
          "name": "bridge",
          "writable": true
        },
        {
          "name": "system_program"
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
          "name": "block_number",
          "type": "u64"
        }
      ]
    },
    {
      "name": "relay_message",
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
          "writable": true,
          "signer": true
        },
        {
          "name": "message",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "wrap_token",
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
          "writable": true,
          "signer": true
        },
        {
          "name": "gas_fee_receiver",
          "writable": true
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "bridge",
          "writable": true
        },
        {
          "name": "outgoing_message",
          "writable": true,
          "signer": true
        },
        {
          "name": "token_program"
        },
        {
          "name": "system_program"
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
        },
        {
          "name": "gas_limit",
          "type": "u64"
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
  "errors": [
    {
      "code": 6000,
      "name": "IncorrectGasFeeReceiver",
      "msg": "Incorrect gas fee receiver"
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
            "name": "eip1559",
            "docs": [
              "EIP-1559 state for dynamic pricing."
            ],
            "type": {
              "defined": {
                "name": "Eip1559"
              }
            }
          }
        ]
      }
    },
    {
      "name": "Call",
      "type": {
        "kind": "struct",
        "fields": [
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
            "name": "data",
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
            "name": "target",
            "docs": [
              "Gas target per window"
            ],
            "type": "u64"
          },
          {
            "name": "denominator",
            "docs": [
              "Adjustment denominator (controls rate of change)"
            ],
            "type": "u64"
          },
          {
            "name": "window_duration_seconds",
            "docs": [
              "Window duration in seconds"
            ],
            "type": "u64"
          },
          {
            "name": "current_base_fee",
            "docs": [
              "Current base fee in gwei"
            ],
            "type": "u64"
          },
          {
            "name": "current_window_gas_used",
            "docs": [
              "Gas used in the current time window"
            ],
            "type": "u64"
          },
          {
            "name": "window_start_time",
            "docs": [
              "Unix timestamp when the current window started"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "IncomingMessage",
      "type": {
        "kind": "struct",
        "fields": [
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
            "name": "executed",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "Message",
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
                  "name": "Transfer"
                }
              }
            ]
          }
        ]
      }
    },
    {
      "name": "OutgoingMessage",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "sender",
            "type": "pubkey"
          },
          {
            "name": "gas_limit",
            "type": "u64"
          },
          {
            "name": "message",
            "type": {
              "defined": {
                "name": "Message"
              }
            }
          }
        ]
      }
    },
    {
      "name": "OutputRoot",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "root",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "PartialTokenMetadata",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
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
            "name": "scaler_exponent",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "Proof",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "proof",
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
            "type": "u64"
          },
          {
            "name": "total_leaf_count",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "Transfer",
      "type": {
        "kind": "struct",
        "fields": [
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
            "name": "local_token",
            "type": "pubkey"
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
      "name": "EIP1559_DEFAULT_ADJUSTMENT_DENOMINATOR",
      "type": "u64",
      "value": "2"
    },
    {
      "name": "EIP1559_DEFAULT_GAS_TARGET_PER_WINDOW",
      "type": "u64",
      "value": "5000000"
    },
    {
      "name": "EIP1559_DEFAULT_WINDOW_DURATION_SECONDS",
      "type": "u64",
      "value": "1"
    },
    {
      "name": "EIP1559_MINIMUM_BASE_FEE",
      "type": "u64",
      "value": "1"
    },
    {
      "name": "GAS_COST_SCALER",
      "type": "u64",
      "value": "1000000"
    },
    {
      "name": "GAS_COST_SCALER_DP",
      "type": "u64",
      "value": "1000000"
    },
    {
      "name": "GAS_FEE_RECEIVER",
      "type": "pubkey",
      "value": "4vTj5kmBrmds3zWogiyUxtZPggcVUmG44EXRy2CxTcEZ"
    },
    {
      "name": "INCOMING_MESSAGE_SEED",
      "type": "bytes",
      "value": "[105, 110, 99, 111, 109, 105, 110, 103, 95, 109, 101, 115, 115, 97, 103, 101]"
    },
    {
      "name": "MAX_GAS_LIMIT_PER_MESSAGE",
      "type": "u64",
      "value": "100000000"
    },
    {
      "name": "MESSAGE_HEADER_SEED",
      "type": "bytes",
      "value": "[109, 101, 115, 115, 97, 103, 101, 95, 104, 101, 97, 100, 101, 114]"
    },
    {
      "name": "NATIVE_SOL_PUBKEY",
      "type": "pubkey",
      "value": "SoL1111111111111111111111111111111111111111"
    },
    {
      "name": "OPERATION_SEED",
      "type": "bytes",
      "value": "[111, 112, 101, 114, 97, 116, 105, 111, 110]"
    },
    {
      "name": "OUTPUT_ROOT_SEED",
      "type": "bytes",
      "value": "[111, 117, 116, 112, 117, 116, 95, 114, 111, 111, 116]"
    },
    {
      "name": "RELAY_MESSAGES_CALL_ABI_ENCODING_OVERHEAD",
      "type": "u64",
      "value": "544"
    },
    {
      "name": "RELAY_MESSAGES_TRANSFER_ABI_ENCODING_OVERHEAD",
      "type": "u64",
      "value": "480"
    },
    {
      "name": "RELAY_MESSAGES_TRANSFER_AND_CALL_ABI_ENCODING_OVERHEAD",
      "type": "u64",
      "value": "704"
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