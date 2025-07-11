export const BRIDGE_ABI = [
  {
    type: "constructor",
    inputs: [
      {
        name: "remoteBridge",
        type: "bytes32",
        internalType: "Pubkey",
      },
      {
        name: "trustedRelayer",
        type: "address",
        internalType: "address",
      },
      {
        name: "twinBeacon",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "ESTIMATION_ADDRESS",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "REMOTE_BRIDGE",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "Pubkey",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "TRUSTED_RELAYER",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "TWIN_BEACON",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "__relayMessage",
    inputs: [
      {
        name: "message",
        type: "tuple",
        internalType: "struct Bridge.IncomingMessage",
        components: [
          {
            name: "nonce",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "sender",
            type: "bytes32",
            internalType: "Pubkey",
          },
          {
            name: "gasLimit",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "ty",
            type: "uint8",
            internalType: "enum Bridge.MessageType",
          },
          {
            name: "data",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "__validateAndRelay",
    inputs: [
      {
        name: "message",
        type: "tuple",
        internalType: "struct Bridge.IncomingMessage",
        components: [
          {
            name: "nonce",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "sender",
            type: "bytes32",
            internalType: "Pubkey",
          },
          {
            name: "gasLimit",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "ty",
            type: "uint8",
            internalType: "enum Bridge.MessageType",
          },
          {
            name: "data",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
      {
        name: "isTrustedRelayer",
        type: "bool",
        internalType: "bool",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "bridgeCall",
    inputs: [
      {
        name: "ixs",
        type: "tuple[]",
        internalType: "struct Ix[]",
        components: [
          {
            name: "programId",
            type: "bytes32",
            internalType: "Pubkey",
          },
          {
            name: "serializedAccounts",
            type: "bytes[]",
            internalType: "bytes[]",
          },
          {
            name: "data",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "bridgeToken",
    inputs: [
      {
        name: "transfer",
        type: "tuple",
        internalType: "struct Transfer",
        components: [
          {
            name: "localToken",
            type: "address",
            internalType: "address",
          },
          {
            name: "remoteToken",
            type: "bytes32",
            internalType: "Pubkey",
          },
          {
            name: "to",
            type: "bytes32",
            internalType: "bytes32",
          },
          {
            name: "remoteAmount",
            type: "uint64",
            internalType: "uint64",
          },
        ],
      },
      {
        name: "ixs",
        type: "tuple[]",
        internalType: "struct Ix[]",
        components: [
          {
            name: "programId",
            type: "bytes32",
            internalType: "Pubkey",
          },
          {
            name: "serializedAccounts",
            type: "bytes[]",
            internalType: "bytes[]",
          },
          {
            name: "data",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "deposits",
    inputs: [
      {
        name: "localToken",
        type: "address",
        internalType: "address",
      },
      {
        name: "remoteToken",
        type: "bytes32",
        internalType: "Pubkey",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "failures",
    inputs: [
      {
        name: "messageHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "failure",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "generateProof",
    inputs: [
      {
        name: "leafIndex",
        type: "uint64",
        internalType: "uint64",
      },
    ],
    outputs: [
      {
        name: "proof",
        type: "bytes32[]",
        internalType: "bytes32[]",
      },
      {
        name: "totalLeafCount",
        type: "uint64",
        internalType: "uint64",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLastOutgoingNonce",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint64",
        internalType: "uint64",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getPredictedTwinAddress",
    inputs: [
      {
        name: "sender",
        type: "bytes32",
        internalType: "Pubkey",
      },
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRoot",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextIncomingNonce",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint64",
        internalType: "uint64",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "relayMessages",
    inputs: [
      {
        name: "messages",
        type: "tuple[]",
        internalType: "struct Bridge.IncomingMessage[]",
        components: [
          {
            name: "nonce",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "sender",
            type: "bytes32",
            internalType: "Pubkey",
          },
          {
            name: "gasLimit",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "ty",
            type: "uint8",
            internalType: "enum Bridge.MessageType",
          },
          {
            name: "data",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
      {
        name: "ismData",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "scalars",
    inputs: [
      {
        name: "localToken",
        type: "address",
        internalType: "address",
      },
      {
        name: "remoteToken",
        type: "bytes32",
        internalType: "Pubkey",
      },
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "successes",
    inputs: [
      {
        name: "messageHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "success",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "twins",
    inputs: [
      {
        name: "owner",
        type: "bytes32",
        internalType: "Pubkey",
      },
    ],
    outputs: [
      {
        name: "twinAddress",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "FailedToRelayMessage",
    inputs: [
      {
        name: "messageHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "MessageRegistered",
    inputs: [
      {
        name: "messageHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "mmrRoot",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
      {
        name: "message",
        type: "tuple",
        indexed: false,
        internalType: "struct Message",
        components: [
          {
            name: "nonce",
            type: "uint64",
            internalType: "uint64",
          },
          {
            name: "sender",
            type: "address",
            internalType: "address",
          },
          {
            name: "data",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "MessageSuccessfullyRelayed",
    inputs: [
      {
        name: "messageHash",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TransferFinalized",
    inputs: [
      {
        name: "localToken",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "remoteToken",
        type: "bytes32",
        indexed: false,
        internalType: "Pubkey",
      },
      {
        name: "to",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "TransferInitialized",
    inputs: [
      {
        name: "localToken",
        type: "address",
        indexed: false,
        internalType: "address",
      },
      {
        name: "remoteToken",
        type: "bytes32",
        indexed: false,
        internalType: "Pubkey",
      },
      {
        name: "to",
        type: "bytes32",
        indexed: false,
        internalType: "Pubkey",
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "EmptyMMR",
    inputs: [],
  },
  {
    type: "error",
    name: "EstimationInsufficientGas",
    inputs: [],
  },
  {
    type: "error",
    name: "ExecutionFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "ISMVerificationFailed",
    inputs: [],
  },
  {
    type: "error",
    name: "IncorrectRemoteToken",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidMsgValue",
    inputs: [],
  },
  {
    type: "error",
    name: "LeafIndexOutOfBounds",
    inputs: [],
  },
  {
    type: "error",
    name: "LeafNotFound",
    inputs: [],
  },
  {
    type: "error",
    name: "MessageAlreadyFailedToRelay",
    inputs: [],
  },
  {
    type: "error",
    name: "MessageAlreadySuccessfullyRelayed",
    inputs: [],
  },
  {
    type: "error",
    name: "MessageNotAlreadyFailedToRelay",
    inputs: [],
  },
  {
    type: "error",
    name: "NonceNotIncremental",
    inputs: [],
  },
  {
    type: "error",
    name: "Reentrancy",
    inputs: [],
  },
  {
    type: "error",
    name: "SenderIsNotEntrypoint",
    inputs: [],
  },
  {
    type: "error",
    name: "SiblingNodeOutOfBounds",
    inputs: [],
  },
  {
    type: "error",
    name: "UnsafeIxTarget",
    inputs: [],
  },
  {
    type: "error",
    name: "WrappedSplRouteNotRegistered",
    inputs: [],
  },
] as const;
