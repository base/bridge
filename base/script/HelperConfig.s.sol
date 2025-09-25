// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";

import {ERC1967Factory} from "solady/utils/ERC1967Factory.sol";
import {ERC1967FactoryConstants} from "solady/utils/ERC1967FactoryConstants.sol";
import {LibString} from "solady/utils/LibString.sol";

import {Pubkey} from "../src/libraries/SVMLib.sol";
import {MockPartnerValidators} from "../test/mocks/MockPartnerValidators.sol";

contract HelperConfig is Script {
    string environment = vm.envOr("BRIDGE_ENVIRONMENT", string(""));

    struct NetworkConfig {
        address initialOwner;
        Pubkey remoteBridge;
        address erc1967Factory;
        address[] baseValidators;
        uint128 baseSignatureThreshold;
        address[] guardians;
        uint256 partnerValidatorThreshold;
        address partnerValidators;
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
        address bridgeAdmin = 0x20624CA8d0dF80B8bd67C25Bc19A9E10AfB67733;

        address baseLocalSigner = 0x0e9a877906EBc3b7098DA2404412BF0Ed1A5EFb4;
        address baseKeychainSigner = 0x6D0E9C04BD896608b7e10b87FB686E1Feba85510;

        address[] memory guardians = new address[](1);
        address[] memory baseValidators = new address[](2);
        guardians[0] = bridgeAdmin;
        baseValidators[0] = baseLocalSigner;
        baseValidators[1] = baseKeychainSigner;

        return NetworkConfig({
            initialOwner: bridgeAdmin,
            remoteBridge: Pubkey.wrap(0xe4800c8ccac70344ce171377556eade6254744e0dc5ca4c980d596884099e166), // GNyCjXAbkdceLWKBwr9Vd6NLoES6cP4QwCbQ5y5fz46H
            erc1967Factory: ERC1967FactoryConstants.ADDRESS,
            baseValidators: baseValidators,
            baseSignatureThreshold: 2,
            guardians: guardians,
            partnerValidatorThreshold: 3,
            partnerValidators: 0x4EdB7D4944a04B6230a5F496e3a1F6E74DA3C593
        });
    }

    function getBaseSepoliaProdConfig() public pure returns (NetworkConfig memory) {
        address bridgeAdmin = 0x20624CA8d0dF80B8bd67C25Bc19A9E10AfB67733;

        address baseLocalSigner = 0x2880a6DcC8c87dD2874bCBB9ad7E627a407Cf3C2;
        address baseKeychainSigner = 0xc5fe09f194C01e56fB89cC1155daE033D20cDCc7;

        address[] memory guardians = new address[](1);
        address[] memory baseValidators = new address[](2);
        guardians[0] = bridgeAdmin;
        baseValidators[0] = baseLocalSigner;
        baseValidators[1] = baseKeychainSigner;

        return NetworkConfig({
            initialOwner: bridgeAdmin,
            remoteBridge: Pubkey.wrap(0xf45eddaa5a77f376ff73f620f0cd923963dbd6cb456fed23ce12c4bddd18ab05), // HSvNvzehozUpYhRBuCKq3Fq8udpRocTmGMUYXmCSiCCc
            erc1967Factory: ERC1967FactoryConstants.ADDRESS,
            baseValidators: baseValidators,
            baseSignatureThreshold: 2,
            guardians: guardians,
            partnerValidatorThreshold: 0,
            partnerValidators: address(1)
        });
    }

    function getLocalConfig() public returns (NetworkConfig memory) {
        if (_activeNetworkConfig.initialOwner != address(0)) {
            return _activeNetworkConfig;
        }

        ERC1967Factory f = new ERC1967Factory();
        MockPartnerValidators pv = new MockPartnerValidators();

        address[] memory guardians = new address[](1);
        address[] memory baseValidators = new address[](1);
        guardians[0] = makeAddr("guardian");
        baseValidators[0] = vm.addr(1);

        return NetworkConfig({
            initialOwner: makeAddr("initialOwner"),
            remoteBridge: Pubkey.wrap(0xc4c16980efe2a570c1a7599fd2ebb40ca7f85daf897482b9c85d4b8933a61608),
            erc1967Factory: address(f),
            baseValidators: baseValidators,
            baseSignatureThreshold: 1,
            guardians: guardians,
            partnerValidatorThreshold: 0,
            partnerValidators: address(pv)
        });
    }
}
