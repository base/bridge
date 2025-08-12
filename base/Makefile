-include .env

BASE_RPC=https://base-sepolia.cbhq.net
# BASE_RPC=https://mainnet.base.org

# Update values in this section to specify token recipients / token amount
####################################################################################################
# alpha or prod
ENV_NAME=prod

SOLANA_SOL_RECEIVER = 0x9827993b7b317eb6c74279d49074a13b33a3495a30637c86a7513922014ba424
USER_SPL_ATA = 0x6621d2d930ef7ada6260d3e0a5679a8fe81fde41262314f2efbf9c4c828550b1
USER_REMOTE_ERC20_ATA = 0xf52833892e663d67ef0095eca25e647233cab79c6fabd610b560e89872e91668
USER_REMOTE_ETH_ATA = 0x70264a8ac50aac155b781333caab29de44d1df3891a36782eac30852766006c3

AMOUNT = 1000000000
####################################################################################################

BRIDGE = $(shell jq -r '.Bridge' deployments/base_sepolia_$(ENV_NAME).json)
LOCAL_SOL = $(shell jq -r '.WrappedSOL' deployments/base_sepolia_$(ENV_NAME).json)
REMOTE_SOL = $(shell jq -r '.RemoteSOL' deployments/base_sepolia_$(ENV_NAME).json)
LOCAL_SPL = $(shell jq -r '.WrappedSPL' deployments/base_sepolia_$(ENV_NAME).json)
REMOTE_SPL = $(shell jq -r '.RemoteSPL' deployments/base_sepolia_$(ENV_NAME).json)
REMOTE_ERC20 = $(shell jq -r '.RemoteERC20' deployments/base_sepolia_$(ENV_NAME).json)
REMOTE_ETH = $(shell jq -r '.RemoteETH' deployments/base_sepolia_$(ENV_NAME).json)

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
	BRIDGE_ENVIRONMENT=$(ENV_NAME) forge script DeployScript --account testnet-admin --rpc-url $(BASE_RPC) --sender $(shell cast wallet address --account testnet-admin) --broadcast -vvvv

.PHONY: create-wrapped-sol
create-wrapped-sol:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) TOKEN_NAME=WrappedSOL TOKEN_SYMBOL=wSOL REMOTE_TOKEN=$(REMOTE_SOL) forge script CreateTokenScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: create-wrapped-spl
create-wrapped-spl:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) TOKEN_NAME=WrappedSPL TOKEN_SYMBOL=wSPL REMOTE_TOKEN=$(REMOTE_SPL) forge script CreateTokenScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: create-mock-token
create-mock-token:
	ADMIN=$(shell cast wallet address --account testnet-admin) forge script DeployERC20 --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-sol-to-solana
bridge-sol-to-solana:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) \
	LOCAL_TOKEN=$(LOCAL_SOL) \
	REMOTE_TOKEN=$(REMOTE_SOL) \
	TO=$(SOLANA_SOL_RECEIVER) \
	AMOUNT=$(AMOUNT) \
	forge script BridgeTokensToSolanaScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-spl-to-solana
bridge-spl-to-solana:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) \
	LOCAL_TOKEN=$(LOCAL_SPL) \
	REMOTE_TOKEN=$(REMOTE_SPL) \
	TO=$(USER_SPL_ATA) \
	AMOUNT=$(AMOUNT) \
	forge script BridgeTokensToSolanaScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-erc20-to-solana
bridge-erc20-to-solana:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) \
	LOCAL_TOKEN=$(LOCAL_ERC20) \
	REMOTE_TOKEN=$(REMOTE_ERC20) \
	TO=$(USER_REMOTE_ERC20_ATA) \
	AMOUNT=$(AMOUNT) \
	NEEDS_APPROVAL=true \
	forge script BridgeTokensToSolanaScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-eth-to-solana
bridge-eth-to-solana:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) \
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
