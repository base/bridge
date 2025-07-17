![Base](logo.png)

# Base Bridge

A bridge between Base and blockchains outside the Ethereum ecosystem. Currently has support for Solana.

> [!NOTE]
>
> For native Ethereum ↔ Base bridging, see [our official docs](https://docs.base.org/base-chain/network-information/bridges-mainnet).

<!-- Badge row 1 - status -->

[![GitHub contributors](https://img.shields.io/github/contributors/base/bridge)](https://github.com/base/bridge/graphs/contributors)
[![GitHub commit activity](https://img.shields.io/github/commit-activity/w/base/bridge)](https://github.com/base/bridge/graphs/contributors)
[![GitHub Stars](https://img.shields.io/github/stars/base/bridge.svg)](https://github.com/base/bridge/stargazers)
![GitHub repo size](https://img.shields.io/github/repo-size/base/bridge)
[![GitHub](https://img.shields.io/github/license/base/bridge?color=blue)](https://github.com/base/bridge/blob/main/LICENSE)

<!-- Badge row 2 - links and profiles -->

[![Website base.org](https://img.shields.io/website-up-down-green-red/https/base.org.svg)](https://base.org)
[![Blog](https://img.shields.io/badge/blog-up-green)](https://base.mirror.xyz/)
[![Docs](https://img.shields.io/badge/docs-up-green)](https://docs.base.org/)
[![Discord](https://img.shields.io/discord/1067165013397213286?label=discord)](https://base.org/discord)
[![Twitter BuildOnBase](https://img.shields.io/twitter/follow/BuildOnBase?style=social)](https://twitter.com/BuildOnBase)

<!-- Badge row 3 - detailed status -->

[![GitHub pull requests by-label](https://img.shields.io/github/issues-pr-raw/base/bridge)](https://github.com/base/bridge/pulls)
[![GitHub Issues](https://img.shields.io/github/issues-raw/base/bridge.svg)](https://github.com/base/bridge/issues)

## How it Works

This bridge allows you to:

- Transfer tokens between Base and Solana
- Send arbitrary cross-chain messages
- Deploy wrapped tokens on either chain

## Usage

### Base → Solana

Send tokens or messages from Base to Solana (multi-step process):

```bash
cd base
# See base/README.md for detailed instructions
```

After initiating on Base, wait ~15 minutes for an updated root to be posted to Solana and complete the transfer with prove + finalize steps:

```bash
cd solana
# See solana/README.md for prove and finalize instructions
```

### Solana → Base

Send tokens or messages from Solana to Base:

```bash
cd solana
# See solana/README.md for detailed instructions
```

## License

MIT License - see [LICENSE](LICENSE) for details.
