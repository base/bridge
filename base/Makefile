-include .env

BASE_RPC=https://base-sepolia.cbhq.net
# BASE_RPC=https://mainnet.base.org

# Update values in this section to specify token recipients / token amount
####################################################################################################
# alpha or prod
ENV_NAME=alpha

SOLANA_SOL_RECEIVER = 0x82c9f09a109bce580bb82c13c310689fd00e2225f8dd22015271620ecc035221
USER_SPL_ATA = 0x586931089de14bbc55cc4ee29c5d4d9be9db9967ab6770c0fda2337c09091749
USER_REMOTE_ERC20_ATA = 0x659abca3e23fa5a8212846977d3f8d2593b4b0c565afcc38aa89ea6d184cfb06
USER_REMOTE_ETH_ATA = 0xf86b5aa217cca19080d4c9fb685bc671bc882e49a1764e0ecfbfaabc360bb661

AMOUNT = 1000000
####################################################################################################

BRIDGE = $(shell jq -r '.Bridge' deployments/base_sepolia_$(ENV_NAME).json)
LOCAL_SOL = $(shell jq -r '.WrappedSOL' deployments/base_sepolia_$(ENV_NAME).json)
REMOTE_SOL = $(shell jq -r '.RemoteSOL' deployments/base_sepolia_$(ENV_NAME).json)
LOCAL_SPL = $(shell jq -r '.WrappedSPL' deployments/base_sepolia_$(ENV_NAME).json)
REMOTE_SPL = $(shell jq -r '.RemoteSPL' deployments/base_sepolia_$(ENV_NAME).json)
REMOTE_ERC20 = $(shell jq -r '.RemoteERC20' deployments/base_sepolia_$(ENV_NAME).json)

LOCAL_ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
LOCAL_ERC20 = 0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9

check:
	@echo $(REMOTE_ERC20)

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
dev-deploy: deploy create-wrapped-sol create-wrapped-spl

.PHONY: deploy
deploy:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) forge script DeployScript --account testnet-admin --rpc-url $(BASE_RPC) --sender $(shell cast wallet address --account testnet-admin) -vvvv

.PHONY: create-wrapped-sol
create-wrapped-sol:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) TOKEN_NAME=WrappedSOL TOKEN_SYMBOL=wSOL REMOTE_TOKEN=$(REMOTE_SOL) forge script CreateTokenScript --account testnet-admin --rpc-url $(BASE_RPC) -vvvv

.PHONY: create-wrapped-spl
create-wrapped-spl:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) TOKEN_NAME=WrappedSPL TOKEN_SYMBOL=wSPL REMOTE_TOKEN=$(REMOTE_SPL) forge script CreateTokenScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: create-mock-token
create-mock-token:
	ADMIN=$(shell cast wallet address --account testnet-admin) forge script DeployERC20 --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-sol-to-solana
bridge-sol-to-solana:
	LOCAL_TOKEN=$(LOCAL_SOL) \
	REMOTE_TOKEN=$(REMOTE_SOL) \
	TO=$(SOLANA_SOL_RECEIVER) \
	AMOUNT=$(AMOUNT) \
	forge script BridgeTokensToSolanaScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-tokens-to-solana
bridge-tokens-to-solana:
	LOCAL_TOKEN=$(LOCAL_SPL) \
	REMOTE_TOKEN=$(REMOTE_SPL) \
	TO=$(USER_SPL_ATA) \
	AMOUNT=$(AMOUNT) \
	forge script BridgeTokensToSolanaScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-erc20-to-solana
bridge-erc20-to-solana:
	LOCAL_TOKEN=$(LOCAL_ERC20) \
	REMOTE_TOKEN=$(REMOTE_ERC20) \
	TO=$(USER_REMOTE_ERC20_ATA) \
	AMOUNT=$(AMOUNT) \
	NEEDS_APPROVAL=true \
	forge script BridgeTokensToSolanaScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-eth-to-solana
bridge-eth-to-solana:
	LOCAL_TOKEN=$(LOCAL_ETH) \
	REMOTE_TOKEN=$(REMOTE_ETH) \
	TO=$(USER_REMOTE_ETH_ATA) \
	AMOUNT=$(AMOUNT) \
	forge script BridgeTokensToSolanaScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: check-root
check-root:
	@ cast call $(BRIDGE) "getRoot()" --rpc-url https://base-sepolia-dev.cbhq.net:8545

.PHONY: check-count
check-count:
	@ cast call 0xCdfe10f911eD5039E031D6a7be3a0F97fA061C38 "count()" --rpc-url https://base-sepolia-dev.cbhq.net:8545
