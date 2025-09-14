# Solana Bridge Program

A cross-chain bridge program that enables seamless message passing between Solana and Base.

## Program IDs

- **Devnet Bridge**: `HUKbDBb1j5M5UV66eKptMGjgvqesD5LFtfUktiVpEmrt`
- **Devnet Base Relayer**: `2pXcpctLdWasZ7RRjMyiAVCcT9bLuiSn7mrBr3vF7EUk`

## Overview

The Solana Bridge Program facilitates bidirectional communication between Solana and Base. It allows:

- Wrapping Base tokens in their SPL equivalents on Solana
- Transferring tokens between Solana and Base
- Calling programs on Solana from Base
- Sending calls to Base from Solana

## Getting Started

### Install Dependencies

```bash
bun install
```

### Build the program

```bash
cargo-build-sbf
```

### Testing

```bash
cargo test
```

## Usage

Make sure you have a funded solana keypair in `~/.config/solana/id.json`. You can use the `solana-keygen new` command to generate a new keypair. You can use this solana faucet to fund your account on devnet: https://solfaucet.com/.

```bash
# Create wrapped version of a Base token on Solana
bun run tx:wrap-token

# Bridge SOL from Solana to Base
bun run tx:bridge-sol

# Bridge SPL tokens from Solana to Base
bun run tx:bridge-spl

# Bridge back wrapped tokens from Solana to Base
bun run tx:bridge-wrapped-token

# Bridge a call from Solana to Base
bun run tx:bridge-call

# Prove message from Base and relay it to Solana
bun run tx:prove-and-relay-message

# Relay message from Base
bun run tx:relay-message
```
