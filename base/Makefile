-include .env

BASE_RPC=https://base-sepolia.cbhq.net
# BASE_RPC=https://mainnet.base.org

# Devnet Alpha Addresses
# BRIDGE = 0xfcde89DFe9276Ec059d68e43759a226f0961426F

# LOCAL_SOL = 0x314752245b830F3FEF1BE33Eaf16fF510Ba769a4
# REMOTE_SOL = 0x069be72ab836d4eacc02525b7350a78a395da2f1253a40ebafd6630000000000

# LOCAL_SPL = 0x124229C60213709087c408ffe33D2b1142F91125
# REMOTE_SPL = 0xf0f9a72753742be125e994a65ce0b2f9938e653fa5252e3f71277f128d85250d
# USER_SPL_ATA = 0x5743bace9b76bbf1bb9633a6a7f4ee4175d9a0c0745f4a2e9fd319244951d2fd

# LOCAL_ERC20 = 0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9
# REMOTE_ERC20 = 0x8c3446d39ffd65385d0ac81cdb48a47b6a7bb784e2ee8951b303629917a11c2c
# USER_REMOTE_ERC20_ATA = 0x9241988c16b2b21a00f7e8ad06c207f831017d69440c63be243442cdb63496bf

# LOCAL_ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
# REMOTE_ETH = 0xcd7192592d77eee4f337b25393219215aa866d9b8addfc11da5853555ba9cefa
# USER_REMOTE_ETH_ATA = 0xde099694c85728a200685f2911d518ac69ab5619c6a74524f1d16eebc9a03620

# SOLANA_SOL_RECEIVER = 0x82c9f09a109bce580bb82c13c310689fd00e2225f8dd22015271620ecc035221
####################################################################################################

# Devnet Prod Addresses
BRIDGE = 0x96BB7fE0B5927CD604B1CfcaD4E16bB82bd1cc11

LOCAL_SOL = 0x10B1A14E40a951777f4180875B2aBe03Ff5DEbae
REMOTE_SOL = 0x069be72ab836d4eacc02525b7350a78a395da2f1253a40ebafd6630000000000

LOCAL_SPL = 0x26703A110c7F7834B8de61657182bF03b5c5b5a0
REMOTE_SPL = 0xf0f9a72753742be125e994a65ce0b2f9938e653fa5252e3f71277f128d85250d
USER_SPL_ATA = 0x5743bace9b76bbf1bb9633a6a7f4ee4175d9a0c0745f4a2e9fd319244951d2fd

LOCAL_ERC20 = 0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9
REMOTE_ERC20 = 0xd3a7769953f7fb046eb4798298fcc95464633ac2431115abd9466b2e5e595637
USER_REMOTE_ERC20_ATA = 0x9012c89076034a0fa661a446930bbbbea61967cc0aecf53f7ef1f979b6981d22

LOCAL_ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
REMOTE_ETH = 0xfd77b603f3afb749a8f12944db51cdef33ed6c23b5c7b96a6f5b4c0ac5cd37a6
USER_REMOTE_ETH_ATA = 0xbdcf27b8fab01afd8e6eae1784baeaf99cb6f3059b42c33e83ec5409ac5fc307

SOLANA_SOL_RECEIVER = 0x82c9f09a109bce580bb82c13c310689fd00e2225f8dd22015271620ecc035221
####################################################################################################

.PHONY: deps
deps: clean-lib forge-deps

.PHONY: clean-lib
clean-lib:
	rm -rf lib

.PHONY: forge-deps
forge-deps:
	forge install --no-git github.com/foundry-rs/forge-std \
		github.com/Vectorized/solady@92e647bb2b387e952480a5a37800e9b4d54f7a06

.PHONY: coverage
coverage:
	@ forge coverage --no-match-coverage "(script|test)"

.PHONY: dev-deploy
dev-deploy: deploy create-wrapped-sol create-token

.PHONY: deploy
deploy:
	forge script DeployScript --account testnet-admin --rpc-url $(BASE_RPC) --sender $(shell cast wallet address --account testnet-admin) --broadcast -vvvv

.PHONY: create-wrapped-sol
create-wrapped-sol:
	TOKEN_NAME=WrappedSOL TOKEN_SYMBOL=wSOL REMOTE_TOKEN=$(REMOTE_SOL) forge script CreateTokenScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: create-token
create-token:
	TOKEN_NAME=WrappedSPL REMOTE_TOKEN=$(REMOTE_SPL) forge script CreateTokenScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: create-mock-token
create-mock-token:
	ADMIN=0x8C1a617BdB47342F9C17Ac8750E0b070c372C721 forge script DeployERC20 --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-sol-to-solana
bridge-sol-to-solana:
	LOCAL_TOKEN=$(LOCAL_SOL) \
	REMOTE_TOKEN=$(REMOTE_SOL) \
	TO=$(SOLANA_SOL_RECEIVER) \
	AMOUNT=1000000 \
	forge script BridgeTokensToSolanaScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-tokens-to-solana
bridge-tokens-to-solana:
	LOCAL_TOKEN=$(LOCAL_SPL) \
	REMOTE_TOKEN=$(REMOTE_SPL) \
	TO=$(USER_SPL_ATA) \
	AMOUNT=1000000 \
	forge script BridgeTokensToSolanaScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-erc20-to-solana
bridge-erc20-to-solana:
	LOCAL_TOKEN=$(LOCAL_ERC20) \
	REMOTE_TOKEN=$(REMOTE_ERC20) \
	TO=$(USER_REMOTE_ERC20_ATA) \
	AMOUNT=1000000000000 \
	NEEDS_APPROVAL=true \
	forge script BridgeTokensToSolanaScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-eth-to-solana
bridge-eth-to-solana:
	LOCAL_TOKEN=$(LOCAL_ETH) \
	REMOTE_TOKEN=$(REMOTE_ETH) \
	TO=$(USER_REMOTE_ETH_ATA) \
	AMOUNT=1000000000000 \
	forge script BridgeTokensToSolanaScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: check-root
check-root:
	@ cast call $(BRIDGE) "getRoot()" --rpc-url https://base-sepolia-dev.cbhq.net:8545

.PHONY: check-count
check-count:
	@ cast call 0xCdfe10f911eD5039E031D6a7be3a0F97fA061C38 "count()" --rpc-url https://base-sepolia-dev.cbhq.net:8545

.PHONY: log-args
log-args:
	forge script LogArgsScript --rpc-url $(BASE_RPC) --broadcast -vvvv
