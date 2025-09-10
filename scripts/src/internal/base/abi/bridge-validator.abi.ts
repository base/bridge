export const BRIDGE_VALIDATOR_ABI = [
  {
    type: "constructor",
    inputs: [
      {
        name: "trustedRelayer",
        type: "address",
        internalType: "address",
      },
      {
        name: "partnerValidatorThreshold",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "BASE_ORACLE",
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
    name: "PARTNER_VALIDATOR_THRESHOLD",
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
    name: "SIGNATURE_LENGTH_THRESHOLD",
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
    name: "nextNonce",
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
    name: "registerMessages",
    inputs: [
      {
        name: "innerMessageHashes",
        type: "bytes32[]",
        internalType: "bytes32[]",
      },
      {
        name: "validatorSigs",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "validMessages",
    inputs: [
      {
        name: "messageHash",
        type: "bytes32",
        internalType: "bytes32",
      },
    ],
    outputs: [
      {
        name: "isValid",
        type: "bool",
        internalType: "bool",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "ExecutingMessage",
    inputs: [
      {
        name: "msgHash",
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
        name: "messageHashes",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "InvalidSignatureLength",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidSigner",
    inputs: [],
  },
  {
    type: "error",
    name: "ThresholdNotMet",
    inputs: [],
  },
  {
    type: "error",
    name: "Unauthenticated",
    inputs: [],
  },
] as const;
