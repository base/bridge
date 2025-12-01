-include .env

# BASE_RPC=https://base-sepolia.cbhq.net
BASE_RPC=https://mainnet.base.org

ifndef LEDGER_ACCOUNT
override LEDGER_ACCOUNT = 0
endif

# Update values in this section to specify token recipients / token amount
####################################################################################################
# mainnet, sepolia_alpha or sepolia_prod
ENV_NAME=mainnet

SOLANA_SOL_RECEIVER = 0x6e0019e37547b086395a9a6834f731bab5b631004ac22a6c9102047301e40c77
USER_SPL_ATA = 0xfc6697ab185712eed628c12e499a3f4c2d4f73ced9dcc6eab8658bea86adb0e7
USER_REMOTE_ERC20_ATA = 0x7227267f49cac157705e1a5f7ac9f9933c902ae5368cbcc2a12e06d0566f826c
USER_REMOTE_ETH_ATA = 0x3e506b04e88dab39a3687fc5eb822c18f8301fc09cfe945c3394fc6baf9aef25

AMOUNT = 1000000000
####################################################################################################

BRIDGE = $(shell jq -r '.Bridge' deployments/base_$(ENV_NAME).json)
LOCAL_SOL = $(shell jq -r '.WrappedSOL' deployments/base_$(ENV_NAME).json)
REMOTE_SOL = $(shell jq -r '.RemoteSOL' deployments/base_$(ENV_NAME).json)
LOCAL_SPL = $(shell jq -r '.WrappedSPL' deployments/base_$(ENV_NAME).json)
REMOTE_SPL = $(shell jq -r '.RemoteSPL' deployments/base_$(ENV_NAME).json)
REMOTE_ERC20 = $(shell jq -r '.RemoteERC20' deployments/base_$(ENV_NAME).json)
REMOTE_ETH = $(shell jq -r '.RemoteETH' deployments/base_$(ENV_NAME).json)

LOCAL_ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
LOCAL_ERC20 = 0x4870D23984Dd663005EB8E2b616e4Ef62630183c
# LOCAL_ERC20 = 0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9

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

.PHONY: bindings
bindings:
	go install github.com/ethereum/go-ethereum/cmd/abigen@v1.14.11
	forge build
	abigen --abi ./out/BridgeValidator.sol/BridgeValidator.abi.json --pkg bindings --type BridgeValidator --out bindings/bridge_validator.go
	abigen --abi ./out/Bridge.sol/Bridge.abi.json --pkg bindings --type Bridge --out bindings/bridge.go
	abigen --abi ./out/MessageLib.sol/MessageLib.abi.json --pkg bindings --type MessageLib --out bindings/message_lib.go
	abigen --abi ./out/RelayerOrchestrator.sol/RelayerOrchestrator.abi.json --pkg bindings --type RelayerOrchestrator --out bindings/relayer_orchestrator.go

.PHONY: coverage
coverage:
	@ forge coverage --no-match-coverage "(script|test)"

.PHONY: dev-deploy
dev-deploy: deploy create-wrapped-sol create-wrapped-spl

.PHONY: deploy
deploy:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) forge script DeployScript --account testnet-admin --rpc-url $(BASE_RPC) --sender $(shell cast wallet address --account testnet-admin) --broadcast -vvvv

.PHONY: upgrade
upgrade:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) forge script UpgradeScript --account testnet-upgrade --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: create-wrapped-sol
create-wrapped-sol:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) TOKEN_NAME=WrappedSOL TOKEN_SYMBOL=wSOL REMOTE_TOKEN=$(REMOTE_SOL) forge script CreateTokenScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: create-wrapped-spl
create-wrapped-spl:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) TOKEN_NAME=WrappedSPL TOKEN_SYMBOL=wSPL REMOTE_TOKEN=$(REMOTE_SPL) forge script CreateTokenScript --ledger --hd-paths "m/44'/60'/$(LEDGER_ACCOUNT)'/0/0" --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: create-mock-token
create-mock-token:
	ADMIN=0x644e3DedB0e4F83Bfcf8F9992964d240224B74dc forge script DeployERC20 --ledger --hd-paths "m/44'/60'/$(LEDGER_ACCOUNT)'/0/0" --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-sol-to-solana
bridge-sol-to-solana:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) \
	LOCAL_TOKEN=$(LOCAL_SOL) \
	REMOTE_TOKEN=$(REMOTE_SOL) \
	TO=$(SOLANA_SOL_RECEIVER) \
	AMOUNT=$(AMOUNT) \
	forge script BridgeTokensToSolanaScript --ledger --hd-paths "m/44'/60'/$(LEDGER_ACCOUNT)'/0/0" --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-spl-to-solana
bridge-spl-to-solana:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) \
	LOCAL_TOKEN=$(LOCAL_SPL) \
	REMOTE_TOKEN=$(REMOTE_SPL) \
	TO=$(USER_SPL_ATA) \
	AMOUNT=$(AMOUNT) \
	forge script BridgeTokensToSolanaScript --ledger --hd-paths "m/44'/60'/$(LEDGER_ACCOUNT)'/0/0" --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-erc20-to-solana
bridge-erc20-to-solana:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) \
	LOCAL_TOKEN=$(LOCAL_ERC20) \
	REMOTE_TOKEN=$(REMOTE_ERC20) \
	TO=$(USER_REMOTE_ERC20_ATA) \
	AMOUNT=$(AMOUNT) \
	NEEDS_APPROVAL=true \
	forge script BridgeTokensToSolanaScript --ledger --hd-paths "m/44'/60'/$(LEDGER_ACCOUNT)'/0/0" --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-eth-to-solana
bridge-eth-to-solana:
	BRIDGE_ENVIRONMENT=$(ENV_NAME) \
	LOCAL_TOKEN=$(LOCAL_ETH) \
	REMOTE_TOKEN=$(REMOTE_ETH) \
	TO=$(USER_REMOTE_ETH_ATA) \
	AMOUNT=$(AMOUNT) \
	forge script BridgeTokensToSolanaScript --ledger --hd-paths "m/44'/60'/$(LEDGER_ACCOUNT)'/0/0" --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: check-root
check-root:
	@ cast call $(BRIDGE) "getRoot()" --rpc-url https://base-sepolia-dev.cbhq.net:8545

.PHONY: check-count
check-count:
	@ cast call 0xCdfe10f911eD5039E031D6a7be3a0F97fA061C38 "count()" --rpc-url https://base-sepolia-dev.cbhq.net:8545
