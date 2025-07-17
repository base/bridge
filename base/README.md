# Base Bridge Contracts

A cross-chain bridge implementation that enables seamless message passing and token transfers between Base and Solana.

## Contract Addresses

- **Base Sepolia Bridge**: `0xfcde89DFe9276Ec059d68e43759a226f0961426F`

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

3. Configure environment variables by copying addresses from the Makefile or deployment files

## Development

### Building

```bash
# Compile contracts
forge build
```

### Testing

```bash
# Run tests
forge test

# Run tests with coverage
make coverage
```

## Deployment

### Initial Deployment

Deploy all core contracts:

```bash
make deploy
```

This will deploy:
- Bridge contract
- Twin beacon (for proxy patterns)
- CrossChainERC20Factory
- Save deployment addresses to `deployments/{network}.json`

### Creating Wrapped Tokens

Create wrapped versions of Solana tokens:

```bash
# Create wrapped SOL token
make create-wrapped-sol

# Create wrapped SPL token  
make create-wrapped-spl
```

Custom token creation:
```bash
TOKEN_NAME="MyToken" TOKEN_SYMBOL="MTK" REMOTE_TOKEN=0x1234... forge script CreateTokenScript --account testnet-admin --rpc-url $BASE_RPC --broadcast -vvvv
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
LOCAL_TOKEN=0x123... REMOTE_TOKEN=0x456... TO=0x789... AMOUNT=1000000 forge script BridgeTokensToSolanaScript --account testnet-admin --rpc-url $BASE_RPC --broadcast -vvvv
```

### Testing Utilities

```bash
# Deploy mock ERC20 for testing
make create-mock-token

# Check bridge state
make check-root
```

## Contract Upgrades

The system uses upgradeable beacon proxies. To upgrade contracts:

1. Edit `UpgradeScript.s.sol` and set the appropriate upgrade flags:
```solidity
bool upgradeTwin = true;     // Enable to upgrade Twin implementation
bool upgradeERC20 = true;    // Enable to upgrade CrossChainERC20 implementation  
bool upgradeERC20Factory = true; // Enable to upgrade factory
bool upgradeBridge = true;   // Enable to upgrade Bridge implementation
```

2. Run the upgrade:
```bash
forge script UpgradeScript --account testnet-admin --rpc-url $BASE_RPC --broadcast -vvvv
```

## Scripts Reference

### Main Scripts

- **`Deploy.s.sol`**: Deploys all core bridge contracts and saves addresses
- **`UpgradeScript.s.sol`**: Upgrades existing deployed contracts using beacon proxy pattern

### Action Scripts

- **`CreateToken.s.sol`**: Creates wrapped ERC20 tokens representing Solana tokens
- **`BridgeTokensToSolana.s.sol`**: Initiates token transfers from Base to Solana
- **`DeployERC20.s.sol`**: Deploys mock ERC20 tokens for testing

## Usage Examples

### Complete Development Setup

```bash
# 1. Install dependencies and build
make deps
forge build

# 2. Deploy contracts  
make deploy

# 3. Create wrapped tokens
make create-wrapped-sol
make create-wrapped-spl

# 4. Bridge tokens to Solana
make bridge-sol-to-solana
```

### Custom Operations

```bash
# Deploy a custom wrapped token
TOKEN_NAME="CustomToken" TOKEN_SYMBOL="CTK" REMOTE_TOKEN=0xabc123... \
forge script CreateTokenScript --account testnet-admin --rpc-url $BASE_RPC --broadcast

# Bridge custom amount to specific address
LOCAL_TOKEN=0x123... REMOTE_TOKEN=0x456... TO=0x789... AMOUNT=5000000 \
forge script BridgeTokensToSolanaScript --account testnet-admin --rpc-url $BASE_RPC --broadcast
```
