# Base Bridge Contracts

A cross-chain bridge implementation that enables seamless message passing and token transfers between Base and Solana.

## Contract Addresses

- **Base Sepolia Bridge**: `0x0Bec82590219F7cD5AE97d118760Ceb1E0BEC849`

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
