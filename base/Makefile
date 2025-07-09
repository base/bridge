-include .env

BASE_RPC=https://base-sepolia.cbhq.net
# BASE_RPC=https://mainnet.base.org

# # Devnet Alpha Addresses
# BRIDGE = 0xfcde89DFe9276Ec059d68e43759a226f0961426F

# LOCAL_SOL = 0x4D3210A178De60668986eecfF4eC0B2508eEE1B2
# REMOTE_SOL = 0x069be72ab836d4eacc02525b7350a78a395da2f1253a40ebafd6630000000000

# LOCAL_SPL = 0xBc4027074e544Be820b1a16Bf4F4f7c626D61032
# REMOTE_SPL = 0x6ccf56ff18093bc61462cd67c8aa86216fbad049e41d9bffa0856e5f34af5498
# USER_SPL_ATA = 0xfb914beced28209b37284ca10566a11e4f8296c3314d502898cf76a04a257f24

# LOCAL_ERC20 = 0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9
# REMOTE_ERC20 = 0xf91b492762157f10e66ba3e1254865e8d03497b47ea87a0d31768bde2ce4c7c4
# USER_REMOTE_ERC20_ATA = 0x04268c7125e7ae1323905bac148591895f5ca23e517609b672b6b468c82d21a1

# LOCAL_ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
# REMOTE_ETH = 0xaa769890975f111ac07c870716b82151177b153b8d0c861c72ba89a979a0fc55
# USER_REMOTE_ETH_ATA = 0xe43c7b73480e17628a38b5a51716fcc181396e0f3f943906215f23f32d4b76b6

# SOLANA_SOL_RECEIVER = 0x82c9f09a109bce580bb82c13c310689fd00e2225f8dd22015271620ecc035221
####################################################################################################

# Devnet Prod Addresses
BRIDGE = 0x96BB7fE0B5927CD604B1CfcaD4E16bB82bd1cc11

LOCAL_SOL = 0x4D3210A178De60668986eecfF4eC0B2508eEE1B2
REMOTE_SOL = 0x069be72ab836d4eacc02525b7350a78a395da2f1253a40ebafd6630000000000

LOCAL_SPL = 0xe545c49061424d7F27b642174c95de7c34093b23
REMOTE_SPL = 0xc146c29c76c66edd4414993e6d4dae459fbd892d078b41a6bfde7b44261e0c49
USER_SPL_ATA = 0x586931089de14bbc55cc4ee29c5d4d9be9db9967ab6770c0fda2337c09091749

LOCAL_ERC20 = 0x62C1332822983B8412A6Ffda0fd77cd7d5733Ee9
REMOTE_ERC20 = 0x65f82c36d6f5234552a6178fca402e2ba55d659fb04c6ab1f05f9e182a08b309
USER_REMOTE_ERC20_ATA = 0x659abca3e23fa5a8212846977d3f8d2593b4b0c565afcc38aa89ea6d184cfb06

LOCAL_ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
REMOTE_ETH = 0x643e7e02722311e58bfbd87573bdde4231289334ed5749a2e67ecf9bd8cd3dba
USER_REMOTE_ETH_ATA = 0xf86b5aa217cca19080d4c9fb685bc671bc882e49a1764e0ecfbfaabc360bb661

SOLANA_SOL_RECEIVER = 0x82c9f09a109bce580bb82c13c310689fd00e2225f8dd22015271620ecc035221
# ####################################################################################################

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
	forge script DeployScript --account testnet-admin --rpc-url $(BASE_RPC) --sender $(shell cast wallet address --account testnet-admin) --broadcast -vvvv

.PHONY: create-wrapped-sol
create-wrapped-sol:
	TOKEN_NAME=WrappedSOL TOKEN_SYMBOL=wSOL REMOTE_TOKEN=$(REMOTE_SOL) forge script CreateTokenScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

.PHONY: create-wrapped-spl
create-wrapped-spl:
	TOKEN_NAME=WrappedSPL TOKEN_SYMBOL=wSPL REMOTE_TOKEN=$(REMOTE_SPL) forge script CreateTokenScript --account testnet-admin --rpc-url $(BASE_RPC) --broadcast -vvvv

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
