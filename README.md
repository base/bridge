# Base Bridge

A bridge between Base and blockchains outside the Ethereum ecosystem. Currently has support for Solana.

For the native Ethereum <> Base bridge, please see [our docs](https://docs.base.org/base-chain/network-information/bridges-mainnet).

## Test the bridge

1. Ensure you have followed the `Setup` instructions for both the [oracle](oracle/README.md) and [scripts](scripts/README.md) directories.

2. In your terminal, start the oracle

```bash
cd oracle && make run-dev
```

3. In a separate terminal, invoke the bridge script

```bash
cd scripts && make bridge-sol-to-base
```

## Useful Procedures

### Base Contracts Deployment

1. Enter base directory

```bash
cd base
```

2. Install dependencies

```bash
make deps
```

3. Deploy contracts and new wrapped tokens

```bash
make dev-deploy
```

4. Check the deployed addresses file in `base/deployments` for the new addresses

5. Copy the messenger and bridge addresses into [`solana/programs/bridge/src/constants.rs`](solana/programs/bridge/src/constants.rs) for `OTHER_MESSENGER` and `OTHER_BRIDGE`

6. Copy the messenger and bridge addresses into [`solana/tests/ixs/messenger.ts`](solana/tests/utils/constants.ts) for `otherMessengerAddress` and `otherBridgeAddress`.

7. Enter solana directory

```bash
cd ../solana
```

8. Re-build the program

```bash
anchor build
```

9. Run tests to ensure they all still pass

```bash
anchor test
```

10. Uncomment the `TRUSTED_ORACLE` constant for Devnet deployments in [`constants.rs`](solana/programs/bridge/src/constants.rs).

11. Build the program

```bash
anchor build
```

12. Set target cluster in [`Anchor.toml`](solana/Anchor.toml) to `Devnet`

```toml
[provider]
cluster = "Devnet"
```

13. Re-deploy program

```bash
anchor deploy
```

14. Reset the `TRUSTED_ORACLE` constant in [`constants.rs`](solana/programs/bridge/src/constants.rs).

15. Reset target cluster in [`Anchor.toml`](solana/Anchor.toml) back to `Localnet`.

```toml
[provider]
cluster = "Localnet"
```

16. Ensure scripts directory has latest build / deployment artifacts

```bash
cd ../scripts && make build
```

17. Ensure addresses in oracle and base Makefiles are updated accordingly

### Solana Program Deployment

If deploying a fresh version of the Solana program, follow these steps:

1. Clean the solana directory: `anchor clean`

2. Build the solana project: `make build-devnet`

3. Deploy the program: `anchor deploy`

4. Initialize the program: `anchor run initialize`

5. Deploy wrappedETH and wrappedERC20 SPL tokens on Solana

6. Convert the new program's program ID to bytes32 format by pasting in [`solana/scripts/utils/pubkey-to-bytes32.ts`](solana/scripts/utils/pubkey-to-bytes32.ts) and running `anchor run pubkey-to-bytes32`

7. Set the bridge bytes32 program ID in [`base/script/HelperConfig.s.sol`](base/script/HelperConfig.s.sol) under the appropriate network

8. Make sure the oracle has the updated bridge program ID

9. For the new wETH and wERC20 tokens on Solana, convert both pubkeys to bytes32 format like above, and add to [`base/Makefile`](base/Makefile) as `REMOTE_ERC20` and `REMOTE_ETH`.

10. For testing with the new wETH and wERC20 tokens, create an ATA account for both with the `anchor run create-user-ata` command (you will need to adjust the mint public key in [`solana/scripts/spl/create-user-ata.ts](solana/scripts/spl/create-user-ata.ts) depending on which wrapped token you are using).
