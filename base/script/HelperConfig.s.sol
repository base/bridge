// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";

import {ERC1967Factory} from "solady/utils/ERC1967Factory.sol";
import {ERC1967FactoryConstants} from "solady/utils/ERC1967FactoryConstants.sol";

import {Pubkey} from "../src/libraries/SVMLib.sol";

contract HelperConfig is Script {
    struct NetworkConfig {
        address initialOwner;
        Pubkey remoteBridge;
        address trustedRelayer;
        address erc1967Factory;
        address[] initialValidators;
        uint128 initialThreshold;
        address[] guardians;
    }

    NetworkConfig private _activeNetworkConfig;

    constructor() {
        if (block.chainid == 84532) {
            _activeNetworkConfig = getBaseSepoliaConfig();
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

    function getBaseSepoliaConfig() public pure returns (NetworkConfig memory) {
        // Internal testing version
        // return NetworkConfig({
        //     initialOwner: 0x0fe884546476dDd290eC46318785046ef68a0BA9, // Base Sepolia Proxy Admin
        //     remoteBridge: Pubkey.wrap(0x3179b3df897c6f5fc5391806c1e7e38284ecbaa7cc7c7f56df7c299e800f1437), //
        // 4L8cUU2DXTzEaa5C8MWLTyEV8dpmpDbCjg8DNgUuGedc
        //     trustedRelayer: 0x0e9a877906EBc3b7098DA2404412BF0Ed1A5EFb4,
        //     erc1967Factory: ERC1967FactoryConstants.ADDRESS
        // });
        address BASE_ORACLE = 0x2880a6DcC8c87dD2874bCBB9ad7E627a407Cf3C2;
        address BRIDGE_ADMIN = 0x20624CA8d0dF80B8bd67C25Bc19A9E10AfB67733;

        // Public version
        address[] memory validators = new address[](1);
        validators[0] = BASE_ORACLE;

        address[] memory guardians = new address[](1);
        guardians[0] = BRIDGE_ADMIN; // Same as initial owner

        return NetworkConfig({
            initialOwner: BRIDGE_ADMIN,
            remoteBridge: Pubkey.wrap(0x9379502b8fd1d9f6feee747094a08cd0f9b79fbbc7e51a36e2da237ee1506460), // AvgDrHpWUeV7fpZYVhDQbWrV2sD7zp9zDB7w97CWknKH
            trustedRelayer: BASE_ORACLE,
            erc1967Factory: ERC1967FactoryConstants.ADDRESS,
            initialValidators: validators,
            initialThreshold: 1,
            guardians: guardians
        });
    }

    function getLocalConfig() public returns (NetworkConfig memory) {
        if (_activeNetworkConfig.initialOwner != address(0)) {
            return _activeNetworkConfig;
        }

        ERC1967Factory f = new ERC1967Factory();

        // Use deterministic private keys for validators so tests can sign ISM data
        address[] memory validators = new address[](3);
        validators[0] = vm.addr(0x1); // VALIDATOR1_KEY
        validators[1] = vm.addr(0x2); // VALIDATOR2_KEY
        validators[2] = vm.addr(0x3); // VALIDATOR3_KEY

        address[] memory guardians = new address[](1);
        guardians[0] = makeAddr("guardian"); // Single guardian for local testing

        return NetworkConfig({
            initialOwner: makeAddr("initialOwner"),
            remoteBridge: Pubkey.wrap(0xc4c16980efe2a570c1a7599fd2ebb40ca7f85daf897482b9c85d4b8933a61608),
            trustedRelayer: makeAddr("trustedRelayer"),
            erc1967Factory: address(f),
            initialValidators: validators,
            initialThreshold: 2,
            guardians: guardians
        });
    }
}
