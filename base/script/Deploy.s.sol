// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {console} from "forge-std/console.sol";

import {ERC1967Factory} from "solady/utils/ERC1967Factory.sol";
import {UpgradeableBeacon} from "solady/utils/UpgradeableBeacon.sol";

import {Bridge} from "../src/Bridge.sol";
import {BridgeValidator} from "../src/BridgeValidator.sol";
import {CrossChainERC20} from "../src/CrossChainERC20.sol";
import {CrossChainERC20Factory} from "../src/CrossChainERC20Factory.sol";
import {Twin} from "../src/Twin.sol";
import {DevOps} from "./DevOps.s.sol";
import {HelperConfig} from "./HelperConfig.s.sol";

contract DeployScript is DevOps {
    function run() public returns (Twin, BridgeValidator, Bridge, CrossChainERC20Factory, HelperConfig) {
        HelperConfig helperConfig = new HelperConfig();
        HelperConfig.NetworkConfig memory cfg = helperConfig.getConfig();

        address precomputedBridgeAddress =
            ERC1967Factory(cfg.erc1967Factory).predictDeterministicAddress({salt: _salt("bridge15")});

        vm.startBroadcast(msg.sender);
        address twinBeacon = _deployTwinBeacon({cfg: cfg, precomputedBridgeAddress: precomputedBridgeAddress});
        address factory = _deployFactory({cfg: cfg, precomputedBridgeAddress: precomputedBridgeAddress});
        address bridgeValidator = _deployBridgeValidator({cfg: cfg});
        address bridge = _deployBridge({
            cfg: cfg,
            twinBeacon: twinBeacon,
            crossChainErc20Factory: factory,
            bridgeValidator: bridgeValidator
        });
        vm.stopBroadcast();

        require(address(bridge) == precomputedBridgeAddress, "Bridge address mismatch");

        console.log("Deployed TwinBeacon at: %s", twinBeacon);
        console.log("Deployed Bridge at: %s", bridge);
        console.log("Deployed CrossChainERC20Factory at: %s", factory);

        _serializeAddress({key: "Bridge", value: bridge});
        _serializeAddress({key: "CrossChainERC20Factory", value: factory});
        _serializeAddress({key: "Twin", value: twinBeacon});
        _writeJsonFile();

        return (
            Twin(payable(twinBeacon)),
            BridgeValidator(bridgeValidator),
            Bridge(bridge),
            CrossChainERC20Factory(factory),
            helperConfig
        );
    }

    function _deployTwinBeacon(HelperConfig.NetworkConfig memory cfg, address precomputedBridgeAddress)
        private
        returns (address)
    {
        address twinImpl = address(new Twin(precomputedBridgeAddress));
        return address(new UpgradeableBeacon({initialOwner: cfg.initialOwner, initialImplementation: twinImpl}));
    }

    function _deployFactory(HelperConfig.NetworkConfig memory cfg, address precomputedBridgeAddress)
        private
        returns (address)
    {
        address erc20Impl = address(new CrossChainERC20(precomputedBridgeAddress));
        address erc20Beacon =
            address(new UpgradeableBeacon({initialOwner: cfg.initialOwner, initialImplementation: erc20Impl}));

        address xChainERC20FactoryImpl = address(new CrossChainERC20Factory(erc20Beacon));
        return
            ERC1967Factory(cfg.erc1967Factory).deploy({implementation: xChainERC20FactoryImpl, admin: cfg.initialOwner});
    }

    function _deployBridgeValidator(HelperConfig.NetworkConfig memory cfg) private returns (address) {
        address bridgeValidatorImpl = address(
            new BridgeValidator({
                trustedRelayer: cfg.trustedRelayer,
                partnerValidatorThreshold: cfg.partnerValidatorThreshold
            })
        );
        return ERC1967Factory(cfg.erc1967Factory).deploy({implementation: bridgeValidatorImpl, admin: cfg.initialOwner});
    }

    function _deployBridge(
        HelperConfig.NetworkConfig memory cfg,
        address twinBeacon,
        address crossChainErc20Factory,
        address bridgeValidator
    ) private returns (address) {
        Bridge bridgeImpl = new Bridge({
            remoteBridge: cfg.remoteBridge,
            twinBeacon: twinBeacon,
            crossChainErc20Factory: crossChainErc20Factory,
            bridgeValidator: bridgeValidator
        });

        return ERC1967Factory(cfg.erc1967Factory).deployDeterministicAndCall({
            implementation: address(bridgeImpl),
            admin: cfg.initialOwner,
            salt: _salt("bridge15"),
            data: abi.encodeCall(Bridge.initialize, (cfg.initialOwner, cfg.guardians))
        });
    }

    function _salt(bytes12 salt) private view returns (bytes32) {
        // Concat the msg.sender and the salt
        bytes memory packed = abi.encodePacked(msg.sender, salt);
        return bytes32(packed);
    }
}
