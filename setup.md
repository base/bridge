# Base Bridge Setup Guide

This guide will help you set up the Base Bridge development environment.

## Prerequisites

### Required Tools

1. **Foundry** (for Base contracts)
   - Install: `curl -L https://foundry.paradigm.xyz | bash && foundryup`
   - Verify: `forge --version`

2. **Bun** (for Solana scripts)
   - Install: `curl -bsSf https://bun.sh/install | bash`
   - Verify: `bun --version`

3. **Rust & Cargo** (for Solana programs)
   - Install: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
   - Install Solana CLI: `sh -c "$(curl -sSfL https://release.solana.com/stable/install)"`

4. **Make** (build automation)
   - Windows: Install via chocolatey `choco install make`
   - macOS: `xcode-select --install`
   - Linux: Usually pre-installed

## Setup Steps

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd bridge

# Install Base contract dependencies
cd base
make deps
cd ..

# Install Solana script dependencies
cd scripts
bun install
cd ..
```

### 2. Environment Configuration

```bash
# Copy environment template for Base
cp base/.env.example base/.env

# Edit base/.env with your configuration
# Update recipient addresses and other parameters as needed
```

### 3. Wallet Setup

```bash
# Create testnet admin wallet for Base deployments
cast wallet import testnet-admin --interactive

# Generate Solana keypair (if needed)
solana-keygen new --outfile ~/.config/solana/id.json

# Fund your Solana account on devnet
# Visit: https://solfaucet.com/
```

### 4. Build and Test

```bash
# Build Base contracts
cd base
forge build
forge test

# Build Solana programs
cd ../solana
cargo build-sbf
cargo test
```

### 5. Deploy (Testnet)

```bash
# Deploy Base contracts
cd base
make deploy

# Deploy Solana programs
cd ../scripts
bun cli sol program deploy
```

## Troubleshooting

### Common Issues

1. **Forge not found**: Ensure Foundry is installed and in your PATH
2. **Bun not found**: Restart your terminal after installing Bun
3. **Insufficient funds**: Ensure your wallets have enough testnet tokens
4. **Build failures**: Check that all dependencies are properly installed

### Getting Help

- Check the individual README files in `base/`, `solana/`, and `scripts/` directories
- Review the `CLAUDE.md` file for detailed architecture information
- Open an issue on the repository for specific problems