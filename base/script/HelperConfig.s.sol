// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";

import {ERC1967Factory} from "solady/utils/ERC1967Factory.sol";
import {ERC1967FactoryConstants} from "solady/utils/ERC1967FactoryConstants.sol";
import {LibString} from "solady/utils/LibString.sol";

import {Pubkey} from "../src/libraries/SVMLib.sol";

contract HelperConfig is Script {
    string environment = vm.envOr("BRIDGE_ENVIRONMENT", string(""));

    struct NetworkConfig {
        address initialOwner;
        Pubkey remoteBridge;
        address trustedRelayer;
        address erc1967Factory;
        address[] guardians;
        uint256 partnerValidatorThreshold;
    }

    NetworkConfig private _activeNetworkConfig;

    constructor() {
        if (block.chainid == 84532) {
            if (LibString.eq(environment, "alpha")) {
                _activeNetworkConfig = getBaseSepoliaDevConfig();
            } else if (LibString.eq(environment, "prod")) {
                _activeNetworkConfig = getBaseSepoliaProdConfig();
            } else {
                revert("Unrecognized env name");
            }
        } else {
            _activeNetworkConfig = getLocalConfig();
        }
    }

    function getConfig() public returns (NetworkConfig memory) {
        HelperConfig.NetworkConfig memory cfg = _activeNetworkConfig;

        vm.label(cfg.initialOwner, "INITIAL_OWNER");
        vm.label(cfg.erc1967Factory, "ERC1967_FACTORY");

        return cfg;
    }

    function getBaseSepoliaDevConfig() public pure returns (NetworkConfig memory) {
        address BASE_ORACLE = 0x6D0E9C04BD896608b7e10b87FB686E1Feba85510;
        address BRIDGE_ADMIN = 0x20624CA8d0dF80B8bd67C25Bc19A9E10AfB67733;

        address[] memory guardians = new address[](1);
        guardians[0] = BRIDGE_ADMIN;

        return NetworkConfig({
            initialOwner: BRIDGE_ADMIN,
            remoteBridge: Pubkey.wrap(0x890394bc966bf6a9d808ff4a700236444afbc430bd691db0f8118754ae023b6d), // ADr2FqCx35AFdS2j46gJtkoksxAFPRtjVMPo6u62tVfz
            trustedRelayer: BASE_ORACLE,
            erc1967Factory: ERC1967FactoryConstants.ADDRESS,
            guardians: guardians,
            partnerValidatorThreshold: 0
        });
    }

    function getBaseSepoliaProdConfig() public pure returns (NetworkConfig memory) {
        address BASE_ORACLE = 0x2880a6DcC8c87dD2874bCBB9ad7E627a407Cf3C2;
        address BRIDGE_ADMIN = 0x20624CA8d0dF80B8bd67C25Bc19A9E10AfB67733;

        address[] memory guardians = new address[](1);
        guardians[0] = BRIDGE_ADMIN;

        return NetworkConfig({
            initialOwner: BRIDGE_ADMIN,
            remoteBridge: Pubkey.wrap(0x083abe7dfcdf7b07b857e3b141d49bf0e5a959a0c3ad07445160417b31274a68), // Z8DUqPNTT4tZAX3hNoQjYdNoB7rLxDBDX6CrHG972c7
            trustedRelayer: BASE_ORACLE,
            erc1967Factory: ERC1967FactoryConstants.ADDRESS,
            guardians: guardians,
            partnerValidatorThreshold: 0
        });
    }

    function getLocalConfig() public returns (NetworkConfig memory) {
        if (_activeNetworkConfig.initialOwner != address(0)) {
            return _activeNetworkConfig;
        }

        ERC1967Factory f = new ERC1967Factory();

        address[] memory guardians = new address[](1);
        guardians[0] = makeAddr("guardian");

        return NetworkConfig({
            initialOwner: makeAddr("initialOwner"),
            remoteBridge: Pubkey.wrap(0xc4c16980efe2a570c1a7599fd2ebb40ca7f85daf897482b9c85d4b8933a61608),
            trustedRelayer: vm.addr(1),
            erc1967Factory: address(f),
            guardians: guardians,
            partnerValidatorThreshold: 0
        });
    }
}
