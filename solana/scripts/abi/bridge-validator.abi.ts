export const BRIDGE_VALIDATOR_ABI = [
  {
    type: "constructor",
    inputs: [
      {
        name: "partnerThreshold",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "bridgeAddress",
        type: "address",
        internalType: "address",
      },
      {
        name: "partnerValidators",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "BRIDGE",
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
    name: "MAX_PARTNER_VALIDATOR_THRESHOLD",
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
    name: "PARTNER_VALIDATORS",
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
    name: "addValidator",
    inputs: [
      {
        name: "validator",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "initialize",
    inputs: [
      {
        name: "baseValidators",
        type: "address[]",
        internalType: "address[]",
      },
      {
        name: "baseThreshold",
        type: "uint128",
        internalType: "uint128",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
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
    name: "removeValidator",
    inputs: [
      {
        name: "validator",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setThreshold",
    inputs: [
      {
        name: "newThreshold",
        type: "uint256",
        internalType: "uint256",
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
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ThresholdUpdated",
    inputs: [
      {
        name: "newThreshold",
        type: "uint256",
        indexed: false,
        internalType: "uint256",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ValidatorAdded",
    inputs: [
      {
        name: "validator",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ValidatorRemoved",
    inputs: [
      {
        name: "validator",
        type: "address",
        indexed: false,
        internalType: "address",
      },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "BaseThresholdNotMet",
    inputs: [],
  },
  {
    type: "error",
    name: "CallerNotGuardian",
    inputs: [],
  },
  {
    type: "error",
    name: "DuplicateSigner",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidInitialization",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidSignatureLength",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidThreshold",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidValidatorAddress",
    inputs: [],
  },
  {
    type: "error",
    name: "NotInitializing",
    inputs: [],
  },
  {
    type: "error",
    name: "PartnerThresholdNotMet",
    inputs: [],
  },
  {
    type: "error",
    name: "ThresholdTooHigh",
    inputs: [],
  },
  {
    type: "error",
    name: "UnsortedSigners",
    inputs: [],
  },
  {
    type: "error",
    name: "ValidatorAlreadyAdded",
    inputs: [],
  },
  {
    type: "error",
    name: "ValidatorCountLessThanThreshold",
    inputs: [],
  },
  {
    type: "error",
    name: "ValidatorNotExisted",
    inputs: [],
  },
  {
    type: "error",
    name: "ZeroAddress",
    inputs: [],
  },
] as const;
