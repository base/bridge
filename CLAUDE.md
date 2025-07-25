# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a bidirectional bridge between Base and Solana that enables:
- Cross-chain token transfers (SOL, SPL tokens, ERC20s, ETH)
- Arbitrary cross-chain message passing
- Wrapped token deployment on both chains

The bridge consists of two main components:
1. **Base contracts** (Solidity/Foundry) - handles Base-side operations
2. **Solana program** (Rust/Anchor) - handles Solana-side operations

## Development Commands

### Base Contracts (Foundry)
```bash
cd base

# Build contracts
forge build

# Run tests
forge test

# Test coverage
make coverage

# Install dependencies
make deps

# Deploy to testnet
make deploy

# Create wrapped tokens
make create-wrapped-sol
make create-wrapped-spl
```

### Solana Program
```bash
cd solana

# Install dependencies
bun install

# Build program for specific environment
bun run program:build devnet-alpha
bun run program:build devnet-prod

# Deploy program
bun run program:deploy devnet-alpha

# Generate IDL and client
bun run generate:idl devnet-alpha
bun run generate:client

# Initialize bridge
bun run tx:initialize devnet-alpha

# Bridge operations
bun run tx:bridge-sol devnet-alpha
bun run tx:bridge-spl devnet-alpha
bun run tx:wrap-token devnet-alpha
```

## Architecture

### Base Side
- **Bridge.sol**: Main contract receiving calls from Solana and managing message execution
- **Twin.sol**: Execution contract for each Solana sender pubkey  
- **CrossChainERC20.sol**: Mintable/burnable ERC20 for cross-chain transfers
- **CrossChainERC20Factory.sol**: Factory for deploying wrapped tokens

### Solana Side
- **Bridge State**: Central account with configuration and message nonces
- **OutgoingMessage**: Messages sent from Solana to Base
- **IncomingMessage**: Messages sent from Base to Solana
- **Vaults**: Lock SPL tokens and native SOL during bridging

### Bridge Flow
1. **Base → Solana**: Initiate on Base, wait ~15 minutes for root posting, then prove + finalize on Solana
2. **Solana → Base**: Direct execution after message creation

## Environment Setup

### Base Contracts
- Uses Foundry with forge
- Requires `testnet-admin` wallet account for deployments
- Environment variables in `base/Makefile` for contract addresses

### Solana Program  
- Uses Anchor framework with Rust
- Requires keypair files in `keypairs/` directory
- Two environments: devnet-alpha and devnet-prod

## Testing Strategy

- **Base**: Use `forge test` for Solidity unit tests
- **Solana**: Rust unit tests within the program
- Integration testing via transaction scripts in `solana/scripts/`

## Key Files to Understand

- `base/src/Bridge.sol` - Core Base bridge logic
- `solana/programs/bridge/src/lib.rs` - Solana program entry point  
- `base/script/Deploy.s.sol` - Base deployment script
- `solana/scripts/onchain/` - Solana transaction examples