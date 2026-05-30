# Base Bridge Contracts

A cross-chain bridge implementation that enables seamless message passing and token transfers between Base and Solana.

## Contract Addresses

- **Base Mainnet Bridge**: `0x3eff766C76a1be2Ce1aCF2B69c78bCae257D5188`
- **Base Sepolia Bridge**: `0x01824a90d32A69022DdAEcC6C5C14Ed08dB4EB9B`

## Overview

The Base Bridge contracts facilitate bidirectional communication between Base and Solana. The system allows:

- Receiving and executing calls sent from Solana
- Transferring tokens between Base and Solana
- Creating wrapped versions of Solana tokens on Base

## Architecture

### Core Contracts

- **Bridge**: Main contract that receives calls from Solana and manages message execution via Twin contracts. Bridge is also the entrypoint for sending messages to Solana
- **Twin**: Execution contract specific to each Solana sender pubkey that processes calls from the bridge
- **CrossChainERC20**: ERC20 token implementation that can be minted/burned by the bridge for cross-chain transfers
- **CrossChainERC20Factory**: Factory contract for deploying wrapped tokens representing Solana tokens on Base

## Prerequisites

### Required Tools

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Make

### Environment Setup

1. Install dependencies:

```bash
make deps
```

2. Set up wallet account:

```bash
# Create or import account for testnet deployments
cast wallet import testnet-admin --interactive
```

3. Ensure this account has enough ETH to pay for gas.

## Development

### Building

```bash
forge build
```

### Testing

```bash
forge test
make coverage
```

### Creating Wrapped Tokens

Create wrapped versions of Solana tokens:

```bash
# Create wrapped SPL token (requires setting environment variables first)
# Set REMOTE_SPL as bytes32 representation of SPL mint pubkey on Solana
# Set TOKEN_NAME and TOKEN_SYMBOL for the wrapped token
make create-wrapped-spl
```

Custom token creation:

```bash
BRIDGE_ENVIRONMENT=alpha TOKEN_NAME="MyToken" TOKEN_SYMBOL="MTK" REMOTE_TOKEN=0x1234... forge script CreateTokenScript --account testnet-admin --rpc-url $BASE_RPC --broadcast -vvvv
```

## Operations

### Bridging Tokens to Solana

Bridge various token types from Base to Solana:

```bash
# Bridge SOL (native) to Solana
make bridge-sol-to-solana

# Bridge SPL tokens to Solana
make bridge-tokens-to-solana

# Bridge ERC20 tokens to Solana
make bridge-erc20-to-solana

# Bridge ETH to Solana
make bridge-eth-to-solana
```

Custom bridging:

```bash
BRIDGE_ENVIRONMENT=alpha LOCAL_TOKEN=0x123... REMOTE_TOKEN=0x456... TO=0x789... AMOUNT=1000000 forge script BridgeTokensToSolanaScript --account testnet-admin --rpc-url $BASE_RPC --broadcast -vvvv
```

- `LOCAL_TOKEN`: address of ERC20 token on Base
- `REMOTE_TOKEN`: bytes32 representation of SPL mint pubkey on Solana (`0x069be72ab836d4eacc02525b7350a78a395da2f1253a40ebafd6630000000000` for native SOL)
- `TO`: bytes32 representation of Solana pubkey receiver (this is your Solana wallet address if bridging SOL and it should be your associated token account if bridging into an SPL token)
- `AMOUNT`: The amount of Base tokens to bridge in wei

## Important: Recipient Address Encoding

When bridging from Solana to Base, the recipient EVM address is extracted from `transfer.to` using:

```solidity
address to = address(bytes20(transfer.to));
```

This takes the **first 20 bytes** (left-aligned) of the `bytes32` value. This means:

### Correct Encoding (Left-aligned)

```solidity
// ✅ Correct: left-aligned bytes20 inside bytes32
bytes32 recipient = bytes32(bytes20(0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18));
// Result: 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18000000000000000000000000
```

### Incorrect Encoding (Right-aligned)

```solidity
// ❌ Wrong: right-aligned encoding will decode the wrong address
bytes32 recipient = bytes32(uint256(uint160(0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18)));
// Result: 0x000000000000000000000000742d35Cc6634C0532925a3b844Bc9e7595f2bD18
// This will decode as 0x000000000000000000000000742d35Cc6634 - WRONG!
```

### Quick Reference

| Direction | Recipient Format |
|-----------|-----------------|
| Base → Solana | `bytes32` of Solana pubkey (32 bytes) |
| Solana → Base (ETH/ERC20) | `bytes32(bytes20(evmAddress))` — left-aligned |
| Solana → Base (SPL) | Associated token account pubkey as `bytes32` |

### JavaScript/TypeScript Helper

```typescript
import { pad } from 'viem';

// Convert EVM address to bytes32 for Solana → Base transfers
function addressToBytes32(address: `0x${string}`): `0x${string}` {
  return pad(address, { size: 32, dir: 'left' });
}
```
