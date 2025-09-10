# Bridge CLI Scripts

Interactive command-line interface for managing the Base-Solana bridge operations.

## Setup

```bash
bun install
```

## Available Commands

### Bridge Operations

- `bun cli sol onchain bridge wrap-token` - Create wrapped version of Base token on Solana
- `bun cli sol onchain bridge bridge-sol` - Bridge SOL from Solana to Base
- `bun cli sol onchain bridge bridge-spl` - Bridge SPL tokens from Solana to Base
- `bun cli sol onchain bridge bridge-wrapped-token` - Bridge wrapped tokens back to Base
- `bun cli sol onchain bridge bridge-call` - Bridge a call from Solana to Base
- `bun cli sol onchain bridge prove-message` - Prove message from Base and relay to Solana
- `bun cli sol onchain bridge relay-message` - Relay message from Base

### Program Management

- `bun cli sol program build` - Build Solana program
- `bun cli sol program deploy` - Deploy Solana program
- `bun cli sol program generate-idl` - Generate program IDL
- `bun cli sol program generate-client` - Generate TypeScript client

### SPL Token Operations

- `bun cli sol onchain spl create-mint` - Create new SPL token mint
- `bun cli sol onchain spl create-ata` - Create Associated Token Account
- `bun cli sol onchain spl mint` - Mint SPL tokens

### Utilities

- `bun cli sol generate-keypair` - Generate new Solana keypair
- `bun cli utils pubkey-to-bytes32` - Convert Solana pubkey to bytes32

## Non-Interactive Mode

All commands support non-interactive execution by providing required arguments:

```bash
bun cli sol onchain bridge bridge-sol --cluster devnet --release prod --to 0x1234567890123456789012345678901234567890 --amount 10 --payer-kp config
```
