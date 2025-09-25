# Solana Bridge Program

A cross-chain bridge program that enables seamless message passing between Solana and Base.

## Program IDs

- **Devnet Bridge**: `HSvNvzehozUpYhRBuCKq3Fq8udpRocTmGMUYXmCSiCCc`
- **Devnet Base Relayer**: `ExS1gcALmaA983oiVpvFSVohi1zCtAUTgsLj5xiFPPgL`

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

The `scripts/` directory contains an interactive CLI for interacting with the program. See [scripts/README.md](../scripts/README.md) for detailed usage instructions and available commands.
