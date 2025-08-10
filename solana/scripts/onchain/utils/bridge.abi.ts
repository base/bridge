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
        name: "twinBeacon",
        type: "address",
        internalType: "address",
      },
      {
        name: "crossChainErc20Factory",
        type: "address",
        internalType: "address",
      },
      {
        name: "bridgeValidator",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "BRIDGE_VALIDATOR",
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
    name: "CROSS_CHAIN_ERC20_FACTORY",
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
    name: "GUARDIAN_ROLE",
    inputs: [],
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
        internalType: "struct IncomingMessage",
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
            name: "ty",
            type: "uint8",
            internalType: "enum MessageType",
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
    name: "cancelOwnershipHandover",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "completeOwnershipHandover",
    inputs: [
      {
        name: "pendingOwner",
        type: "address",
        internalType: "address",
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
    name: "getMessageHash",
    inputs: [
      {
        name: "message",
        type: "tuple",
        internalType: "struct IncomingMessage",
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
            name: "ty",
            type: "uint8",
            internalType: "enum MessageType",
          },
          {
            name: "data",
            type: "bytes",
            internalType: "bytes",
          },
        ],
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    stateMutability: "pure",
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
    name: "grantRoles",
    inputs: [
      {
        name: "user",
        type: "address",
        internalType: "address",
      },
      {
        name: "roles",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "hasAllRoles",
    inputs: [
      {
        name: "user",
        type: "address",
        internalType: "address",
      },
      {
        name: "roles",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasAnyRole",
    inputs: [
      {
        name: "user",
        type: "address",
        internalType: "address",
      },
      {
        name: "roles",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "initialize",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address",
      },
      {
        name: "guardians",
        type: "address[]",
        internalType: "address[]",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      {
        name: "result",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "ownershipHandoverExpiresAt",
    inputs: [
      {
        name: "pendingOwner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "result",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "pauseSwitch",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "paused",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool",
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
        internalType: "struct IncomingMessage[]",
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
            name: "ty",
            type: "uint8",
            internalType: "enum MessageType",
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
    name: "renounceOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "renounceRoles",
    inputs: [
      {
        name: "roles",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "requestOwnershipHandover",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "revokeRoles",
    inputs: [
      {
        name: "user",
        type: "address",
        internalType: "address",
      },
      {
        name: "roles",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "rolesOf",
    inputs: [
      {
        name: "user",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "roles",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "view",
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
    name: "transferOwnership",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "payable",
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
    name: "Initialized",
    inputs: [
      {
        name: "version",
        type: "uint64",
        indexed: false,
        internalType: "uint64",
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
    name: "OwnershipHandoverCanceled",
    inputs: [
      {
        name: "pendingOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OwnershipHandoverRequested",
    inputs: [
      {
        name: "pendingOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "oldOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PauseSwitched",
    inputs: [
      {
        name: "paused",
        type: "bool",
        indexed: false,
        internalType: "bool",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RolesUpdated",
    inputs: [
      {
        name: "user",
        type: "address",
        indexed: true,
        internalType: "address",
      },
      {
        name: "roles",
        type: "uint256",
        indexed: true,
        internalType: "uint256",
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
    name: "AlreadyInitialized",
    inputs: [],
  },
  {
    type: "error",
    name: "EmptyMMR",
    inputs: [],
  },
  {
    type: "error",
    name: "IncorrectRemoteToken",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidInitialization",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidMessage",
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
    name: "MessageAlreadySuccessfullyRelayed",
    inputs: [],
  },
  {
    type: "error",
    name: "NewOwnerIsZeroAddress",
    inputs: [],
  },
  {
    type: "error",
    name: "NoHandoverRequest",
    inputs: [],
  },
  {
    type: "error",
    name: "NotInitializing",
    inputs: [],
  },
  {
    type: "error",
    name: "Paused",
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
    name: "Unauthorized",
    inputs: [],
  },
  {
    type: "error",
    name: "WrappedSplRouteNotRegistered",
    inputs: [],
  },
] as const;
