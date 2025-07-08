// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {UpgradeableBeacon} from "solady/utils/UpgradeableBeacon.sol";

import {ERC1967Factory} from "solady/utils/ERC1967Factory.sol";

import {Bridge} from "../src/Bridge.sol";

import {CrossChainERC20} from "../src/CrossChainERC20.sol";
import {CrossChainERC20Factory} from "../src/CrossChainERC20Factory.sol";
import {ISMVerification} from "../src/ISMVerification.sol";
import {Twin} from "../src/Twin.sol";
import {HelperConfig} from "./HelperConfig.s.sol";

contract DeployScript is Script {
    function run() public returns (Twin, Bridge, ISMVerification, CrossChainERC20Factory, HelperConfig) {
        HelperConfig helperConfig = new HelperConfig();
        HelperConfig.NetworkConfig memory cfg = helperConfig.getConfig();

        Chain memory chain = getChain(block.chainid);
        console.log("Deploying on chain: %s", chain.name);

        address precomputedBridgeAddress =
            ERC1967Factory(cfg.erc1967Factory).predictDeterministicAddress({salt: _salt("bridge15")});

        vm.startBroadcast(msg.sender);
        address twinBeacon = _deployTwinBeacon({cfg: cfg, precomputedBridgeAddress: precomputedBridgeAddress});
        address ismVerification = _deployISMVerification({cfg: cfg});
        address factory = _deployFactory({cfg: cfg, precomputedBridgeAddress: precomputedBridgeAddress});
        address bridge = _deployBridge({
            cfg: cfg,
            twinBeacon: twinBeacon,
            ismVerification: ismVerification,
            crossChainErc20Factory: factory
        });
        vm.stopBroadcast();

        require(address(bridge) == precomputedBridgeAddress, "Bridge address mismatch");

        console.log("Deployed TwinBeacon at: %s", twinBeacon);
        console.log("Deployed ISMVerification at: %s", ismVerification);
        console.log("Deployed Bridge at: %s", bridge);
        console.log("Deployed CrossChainERC20Factory at: %s", factory);

        string memory obj = "root";
        string memory json = vm.serializeAddress({objectKey: obj, valueKey: "Bridge", value: bridge});
        json = vm.serializeAddress({objectKey: obj, valueKey: "CrossChainERC20Factory", value: factory});
        json = vm.serializeAddress({objectKey: obj, valueKey: "Twin", value: twinBeacon});
        json = vm.serializeAddress({objectKey: obj, valueKey: "ISMVerification", value: ismVerification});
        vm.writeJson(json, string.concat("deployments/", chain.chainAlias, ".json"));

        return (
            Twin(payable(twinBeacon)),
            Bridge(bridge),
            ISMVerification(ismVerification),
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

    function _deployISMVerification(HelperConfig.NetworkConfig memory cfg) private returns (address) {
        ISMVerification ismImpl = new ISMVerification({
            _validators: cfg.initialValidators,
            _threshold: cfg.initialThreshold,
            _owner: cfg.initialOwner
        });

        return ERC1967Factory(cfg.erc1967Factory).deploy({implementation: address(ismImpl), admin: cfg.initialOwner});
    }

    function _deployBridge(
        HelperConfig.NetworkConfig memory cfg,
        address twinBeacon,
        address ismVerification,
        address crossChainErc20Factory
    ) private returns (address) {
        Bridge bridgeImpl = new Bridge({
            remoteBridge: cfg.remoteBridge,
            trustedRelayer: cfg.trustedRelayer,
            twinBeacon: twinBeacon,
            ismVerification: ismVerification,
            crossChainErc20Factory: crossChainErc20Factory
        });

        return ERC1967Factory(cfg.erc1967Factory).deployDeterministic({
            implementation: address(bridgeImpl),
            admin: cfg.initialOwner,
            salt: _salt("bridge15")
        });
    }

    function _deployFactory(HelperConfig.NetworkConfig memory cfg, address precomputedBridgeAddress)
        private
        returns (address)
    {
        address erc20 = address(new CrossChainERC20(precomputedBridgeAddress));
        address erc20Beacon =
            address(new UpgradeableBeacon({initialOwner: cfg.initialOwner, initialImplementation: erc20}));

        CrossChainERC20Factory xChainERC20FactoryImpl = new CrossChainERC20Factory(erc20Beacon);
        CrossChainERC20Factory xChainERC20Factory = CrossChainERC20Factory(
            ERC1967Factory(cfg.erc1967Factory).deploy({
                implementation: address(xChainERC20FactoryImpl),
                admin: cfg.initialOwner
            })
        );

        return address(xChainERC20Factory);
    }

    function _salt(bytes12 salt) private view returns (bytes32) {
        // Concat the msg.sender and the salt
        bytes memory packed = abi.encodePacked(msg.sender, salt);
        return bytes32(packed);
    }
}
