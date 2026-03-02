-include .env

# Environment mapping: ENV -> RPC URL, deployment file, BRIDGE_ENVIRONMENT
# Usage: make <target> ENV={testnet-alpha|testnet-prod|mainnet}
VALID_ENVS := testnet-alpha testnet-prod mainnet

ifeq ($(ENV),testnet-alpha)
  BASE_RPC := https://base-sepolia.cbhq.net
  DEPLOYMENT_FILE := deployments/base_sepolia_alpha.json
  BRIDGE_ENV := alpha
else ifeq ($(ENV),testnet-prod)
  BASE_RPC := https://base-sepolia.cbhq.net
  DEPLOYMENT_FILE := deployments/base_sepolia_prod.json
  BRIDGE_ENV := prod
else ifeq ($(ENV),mainnet)
  BASE_RPC := https://mainnet.base.org
  DEPLOYMENT_FILE := deployments/base_mainnet.json
  BRIDGE_ENV := mainnet
endif

ifndef LEDGER_ACCOUNT
override LEDGER_ACCOUNT = 0
endif

# Recipient addresses and amount (override via make args or env vars)
SOLANA_SOL_RECEIVER ?= 0x6e0019e37547b086395a9a6834f731bab5b631004ac22a6c9102047301e40c77
USER_SPL_ATA ?= 0xfc6697ab185712eed628c12e499a3f4c2d4f73ced9dcc6eab8658bea86adb0e7
USER_REMOTE_ERC20_ATA ?= 0x7227267f49cac157705e1a5f7ac9f9933c902ae5368cbcc2a12e06d0566f826c
USER_REMOTE_ETH_ATA ?= 0x3e506b04e88dab39a3687fc5eb822c18f8301fc09cfe945c3394fc6baf9aef25

AMOUNT ?= 1000000000

# Contract addresses (read from deployment file)
BRIDGE = $(shell jq -r '.Bridge' $(DEPLOYMENT_FILE))
LOCAL_SOL = $(shell jq -r '.WrappedSOL' $(DEPLOYMENT_FILE))
REMOTE_SOL = $(shell jq -r '.RemoteSOL' $(DEPLOYMENT_FILE))
LOCAL_SPL = $(shell jq -r '.WrappedSPL' $(DEPLOYMENT_FILE))
REMOTE_SPL = $(shell jq -r '.RemoteSPL' $(DEPLOYMENT_FILE))
REMOTE_ERC20 = $(shell jq -r '.RemoteERC20' $(DEPLOYMENT_FILE))
REMOTE_ETH = $(shell jq -r '.RemoteETH' $(DEPLOYMENT_FILE))

LOCAL_ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
LOCAL_ERC20 = 0x4870D23984Dd663005EB8E2b616e4Ef62630183c

# Environment validation
.PHONY: validate-env
validate-env:
ifndef ENV
	$(error ENV is required. Usage: make <target> ENV={testnet-alpha|testnet-prod|mainnet})
endif
ifeq ($(filter $(ENV),$(VALID_ENVS)),)
	$(error Invalid ENV='$(ENV)'. Must be one of: $(VALID_ENVS))
endif

.PHONY: help
help:
	@echo "Usage: make <target> ENV={testnet-alpha|testnet-prod|mainnet}"
	@echo ""
	@echo "Environments:"
	@echo "  testnet-alpha  Base Sepolia (alpha deployment)"
	@echo "  testnet-prod   Base Sepolia (prod deployment)"
	@echo "  mainnet        Base Mainnet"
	@echo ""
	@echo "Bridge targets (require ENV):"
	@echo "  bridge-sol-to-solana    Bridge wrapped SOL to Solana"
	@echo "  bridge-spl-to-solana    Bridge wrapped SPL to Solana"
	@echo "  bridge-erc20-to-solana  Bridge ERC20 to Solana"
	@echo "  bridge-eth-to-solana    Bridge ETH to Solana"
	@echo ""
	@echo "Deployment targets (require ENV):"
	@echo "  deploy                  Deploy bridge contracts"
	@echo "  upgrade                 Upgrade bridge contracts"
	@echo "  dev-deploy              Deploy + create wrapped tokens"
	@echo "  create-wrapped-spl      Create wrapped SPL token"
	@echo "  create-mock-token       Deploy a mock ERC20"
	@echo ""
	@echo "Query targets (require ENV):"
	@echo "  check-root              Check the bridge root"
	@echo "  check-count             Check the bridge message count"
	@echo ""
	@echo "Other targets:"
	@echo "  deps                    Install forge dependencies"
	@echo "  bindings                Generate Go bindings"
	@echo "  coverage                Run test coverage"
	@echo ""
	@echo "Overridable variables:"
	@echo "  AMOUNT                  Token amount (default: 1000000000)"
	@echo "  SOLANA_SOL_RECEIVER     SOL recipient address"
	@echo "  LEDGER_ACCOUNT          Ledger HD account index (default: 0)"

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
deploy: validate-env
	BRIDGE_ENVIRONMENT=$(BRIDGE_ENV) forge script DeployScript --account testnet-admin --rpc-url $(BASE_RPC) --sender $(shell cast wallet address --account testnet-admin) --broadcast -vvvv

.PHONY: upgrade
upgrade: validate-env
	BRIDGE_ENVIRONMENT=$(BRIDGE_ENV) forge script UpgradeScript --account testnet-upgrade --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: create-wrapped-spl
create-wrapped-spl: validate-env
	BRIDGE_ENVIRONMENT=$(BRIDGE_ENV) TOKEN_NAME=WrappedSPL TOKEN_SYMBOL=wSPL REMOTE_TOKEN=$(REMOTE_SPL) TOKEN_DECIMALS=9 forge script CreateTokenScript --ledger --hd-paths "m/44'/60'/$(LEDGER_ACCOUNT)'/0/0" --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: create-mock-token
create-mock-token: validate-env
	ADMIN=0x644e3DedB0e4F83Bfcf8F9992964d240224B74dc forge script DeployERC20 --ledger --hd-paths "m/44'/60'/$(LEDGER_ACCOUNT)'/0/0" --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-sol-to-solana
bridge-sol-to-solana: validate-env
	BRIDGE_ENVIRONMENT=$(BRIDGE_ENV) \
	LOCAL_TOKEN=$(LOCAL_SOL) \
	REMOTE_TOKEN=$(REMOTE_SOL) \
	TO=$(SOLANA_SOL_RECEIVER) \
	AMOUNT=$(AMOUNT) \
	forge script BridgeTokensToSolanaScript --ledger --hd-paths "m/44'/60'/$(LEDGER_ACCOUNT)'/0/0" --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-spl-to-solana
bridge-spl-to-solana: validate-env
	BRIDGE_ENVIRONMENT=$(BRIDGE_ENV) \
	LOCAL_TOKEN=$(LOCAL_SPL) \
	REMOTE_TOKEN=$(REMOTE_SPL) \
	TO=$(USER_SPL_ATA) \
	AMOUNT=$(AMOUNT) \
	forge script BridgeTokensToSolanaScript --ledger --hd-paths "m/44'/60'/$(LEDGER_ACCOUNT)'/0/0" --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-erc20-to-solana
bridge-erc20-to-solana: validate-env
	BRIDGE_ENVIRONMENT=$(BRIDGE_ENV) \
	LOCAL_TOKEN=$(LOCAL_ERC20) \
	REMOTE_TOKEN=$(REMOTE_ERC20) \
	TO=$(USER_REMOTE_ERC20_ATA) \
	AMOUNT=$(AMOUNT) \
	NEEDS_APPROVAL=true \
	forge script BridgeTokensToSolanaScript --ledger --hd-paths "m/44'/60'/$(LEDGER_ACCOUNT)'/0/0" --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: bridge-eth-to-solana
bridge-eth-to-solana: validate-env
	BRIDGE_ENVIRONMENT=$(BRIDGE_ENV) \
	LOCAL_TOKEN=$(LOCAL_ETH) \
	REMOTE_TOKEN=$(REMOTE_ETH) \
	TO=$(USER_REMOTE_ETH_ATA) \
	AMOUNT=$(AMOUNT) \
	forge script BridgeTokensToSolanaScript --ledger --hd-paths "m/44'/60'/$(LEDGER_ACCOUNT)'/0/0" --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: check-root
check-root: validate-env
	@ cast call $(BRIDGE) "getRoot()" --rpc-url $(BASE_RPC)

.PHONY: check-count
check-count: validate-env
	@ cast call $(BRIDGE) "count()" --rpc-url $(BASE_RPC)
