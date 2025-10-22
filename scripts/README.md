# Bridge CLI Scripts

Interactive command-line interface for managing the Base-Solana bridge operations.

## Setup

```bash
bun install
```

## Available Commands

### Bridge Operations

- `bun cli sol bridge wrap-token` - Create wrapped version of Base token on Solana
- `bun cli sol bridge bridge-sol` - Bridge SOL from Solana to Base
- `bun cli sol bridge bridge-spl` - Bridge SPL tokens from Solana to Base
- `bun cli sol bridge bridge-wrapped-token` - Bridge wrapped tokens back to Base
- `bun cli sol bridge bridge-call` - Bridge a call from Solana to Base
- `bun cli sol bridge prove-message` - Prove message from Base and relay to Solana
- `bun cli sol bridge relay-message` - Relay message from Base

### Program Management

- `bun cli sol build` - Build Solana program
- `bun cli sol deploy` - Deploy Solana program
- `bun cli sol generate-idl` - Generate programIDL
- `bun cli sol generate-client` - Generate TypeScript client

### SPL Token Operations

- `bun cli sol spl create-mint` - Create new SPL token mint
- `bun cli sol spl create-ata` - Create Associated Token Account
- `bun cli sol spl mint` - Mint SPL tokens

### Utilities

- `bun cli sol generate-keypair` - Generate new Solana keypair
- `bun cli sol pubkey-to-bytes32` - Convert Solana pubkey to bytes32

## Non-Interactive Mode

All commands support non-interactive execution by providing required arguments:

```bash
bun cli sol bridge bridge-sol --deploy-env testnet-prod --to 0x1234567890123456789012345678901234567890 --amount 10 --payer-kp config --pay-for-relay
```
