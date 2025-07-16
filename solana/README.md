# Solana Bridge Program

A cross-chain bridge program that enables seamless message passing between Solana and Base.

## Program IDs

- **Devnet Alpha**: `4L8cUU2DXTzEaa5C8MWLTyEV8dpmpDbCjg8DNgUuGedc`
- **Devnet Prod**: `AvgDrHpWUeV7fpZYVhDQbWrV2sD7zp9zDB7w97CWknKH`

## Overview

The Solana Bridge Program facilitates bidirectional communication between Solana and Base. It allows:

- Wrapping Base tokens in their SPL equivalents on Solana
- Transferring tokens between Solana and Base
- Calling programs on Solana from Base
- Sending calls to Base from Solana

## Architecture

### Core Components

- **Bridge State**: Central account maintaining bridge configuration, message nonces, and gas pricing
- **Outgoing Message**: Each message sent from Solana to Base is stored in a `OutgoingMessage` account that is eventually closed once the message has been relayed to Base
- **Incoming Message**: Each message sent from Base to Solana is stored in a `IncomingMessage` account.
- **Vaults**: The Solana Bridge program manages different vaults to lock SPL and native SOL when bridging tokens to Base.
- **Wrapped Tokens**: SPL tokens deployed by the Solana Bridge program to represent Base tokens on Solana.

### Message Types

**Outgoing (Solana → Base)**:

- `Call`: Use to perform an arbitrary call on Base
- `Transfer`: Use to transfer tokens to Base and optionally perform an arbitrary call

**Incoming (Base → Solana)**:

- `Call`: Use to perform an arbitrary call on Solana (given the list of instructions)
- `Transfer`: Use to transfer tokens to Solana and optionally perform an arbitrary call

## Instructions

### Initialization

#### `initialize`

Initializes the bridge program state with default configuration.

### Solana → Base Operations

#### `wrap_token`

Creates a wrapped (SPL) version of a Base token on Solana and sends an `OutgoingMessage` to Base to register it.

#### `bridge_call`

Creates an `OutgoingMessage` to execute a Call on Base.

#### `bridge_sol`

Locks SOL in a `SOLVault` account and creates an `OutgoingMessage` to bridge it to Base.

#### `bridge_spl`

Locks SPL tokens in a `TokenVault` account and creates an `OutgoingMessage` to bridge them to Base.

#### `bridge_wrapped_token`

Burns the wrapped (SPL) token on Solana and creates an `OutgoingMessage` to bridge it back to Base.

### Base → Solana Operations

#### `register_output_root`

Registers a Base output root for message verification. Can only be called by a trusted validator.

#### `prove_message`

Proves a message sent from Base using a MMR proof.

#### `relay_message`

Executes a proven message from Base.

## Gas Pricing

The bridge implements EIP-1559-style dynamic gas pricing that adjusts based on network usage:

- Base fee increases when usage exceeds target
- Base fee decreases when usage is below target
- Minimum base fee of 1 gwei

## Prerequisites

### Required Keypairs

The program expects the following keypair files in the `keypairs/` directory:

- `bridge.devnet.alpha.json`
- `bridge.devnet.prod.json`
- `deployer.devnet.alpha.json`
- `deployer.devnet.prod.json`

## Development

### Building

```bash
# Build for specific environment
bun run program:build devnet-alpha
bun run program:build devnet-prod
```

### Deployment

```bash
bun run program:deploy <devnet-alpha|devnet-prod>
```

### Code Generation

#### Generate IDL

```bash
bun run generate:idl <devnet-alpha|devnet-prod>
```

#### Generate Client SDK

```bash
bun run generate:client
```

## Usage

### Initialize Bridge

```bash
bun run tx:initialize <devnet-alpha|devnet-prod>
```

### Bridge Operations

```bash
# Create wrapped version of a Base token on Solana
bun run tx:wrap-token <devnet-alpha|devnet-prod>

# Bridge SOL from Solana to Base
bun run tx:bridge-sol <devnet-alpha|devnet-prod>

# Bridge SPL tokens from Solana to Base
bun run tx:bridge-spl <devnet-alpha|devnet-prod>

# Bridge back wrapped tokens from Solana to Base
bun run tx:bridge-wrapped-token <devnet-alpha|devnet-prod>

# Bridge a call from Solana to Base
bun run tx:bridge-call <devnet-alpha|devnet-prod>

# Prove message from Base
bun run tx:prove-message <devnet-alpha|devnet-prod>

# Relay message from Base
bun run tx:relay-message <devnet-alpha|devnet-prod>
```
