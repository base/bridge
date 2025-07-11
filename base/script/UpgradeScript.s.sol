// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {console} from "forge-std/console.sol";

import {ERC1967Factory} from "solady/utils/ERC1967Factory.sol";
import {UpgradeableBeacon} from "solady/utils/UpgradeableBeacon.sol";

import {Bridge} from "../src/Bridge.sol";
import {CrossChainERC20} from "../src/CrossChainERC20.sol";
import {CrossChainERC20Factory} from "../src/CrossChainERC20Factory.sol";
import {Twin} from "../src/Twin.sol";
import {HelperConfig} from "./HelperConfig.s.sol";

contract UpgradeScript is Script {
    using stdJson for string;

    // Upgrade Config:
    bool upgradeTwin = false; // MODIFY THIS WHEN UPGRADING
    bool upgradeERC20 = false; // MODIFY THIS WHEN UPGRADING
    bool upgradeERC20Factory = false; // MODIFY THIS WHEN UPGRADING
    bool upgradeBridge = false; // MODIFY THIS WHEN UPGRADING

    // Deployment addresss
    address bridgeAddress;
    address erc20FactoryAddress;
    address twinAddress;

    function run() public {
        HelperConfig helperConfig = new HelperConfig();
        HelperConfig.NetworkConfig memory cfg = helperConfig.getConfig();

        Chain memory chain = getChain(block.chainid);
        console.log("Upgrading contracts on chain: %s", chain.name);

        // Read existing deployment addresses
        (bridgeAddress, erc20FactoryAddress, twinAddress) = _readDeploymentFile(chain);

        vm.startBroadcast();

        // Upgrade TwinBeacon
        if (upgradeTwin) {
            _upgradeTwinBeacon(bridgeAddress, twinAddress);
        }

        // Upgrade CrossChainERC20Beacon and CrossChainERC20Factory
        address beaconAddress = CrossChainERC20Factory(erc20FactoryAddress).BEACON();

        if (upgradeERC20) {
            _upgradeCrossChainERC20Beacon(bridgeAddress, beaconAddress);
        }

        if (upgradeERC20Factory) {
            _upgradeCrossChainERC20Factory(cfg, beaconAddress, erc20FactoryAddress);
        }

        // Upgrade Bridge
        if (upgradeBridge) {
            _upgradeBridge(cfg, bridgeAddress, twinAddress, erc20FactoryAddress);
        }

        vm.stopBroadcast();
    }

    function _readDeploymentFile(Chain memory chain) internal view returns (address, address, address) {
        string memory rootPath = vm.projectRoot();
        string memory path = string.concat(rootPath, "/deployments/", chain.chainAlias, ".json");
        string memory json = vm.readFile(path);

        return (json.readAddress(".Bridge"), json.readAddress(".CrossChainERC20Factory"), json.readAddress(".Twin"));
    }

    function _upgradeTwinBeacon(address currentBridgeAddress, address twinBeacon) internal {
        // Deploy new Twin Implementation
        address twinImpl = address(new Twin(currentBridgeAddress));
        console.log("Deployed new Twin implementation: %s", twinImpl);

        // Upgrade TwinBeacon to new implementation
        UpgradeableBeacon beacon = UpgradeableBeacon(twinBeacon);
        beacon.upgradeTo(twinImpl);
        console.log("Upgraded TwinBeacon!");
    }

    function _upgradeCrossChainERC20Beacon(address currentBridgeAddress, address currentBeaconAddress) internal {
        // Deploy new erc20 implementation
        address erc20Impl = address(new CrossChainERC20(currentBridgeAddress));

        // Upgrade CrossChainERC20Beacon to new implementation --> This will automatically upgrade the Factory contract
        // as well
        UpgradeableBeacon beacon = UpgradeableBeacon(currentBeaconAddress);
        beacon.upgradeTo(erc20Impl);
        console.log("Upgraded CrossChainERC20Beacon!");
    }

    function _upgradeCrossChainERC20Factory(
        HelperConfig.NetworkConfig memory cfg,
        address currentBeaconAddress,
        address currentFactoryAddress
    ) internal {
        // Deploy new Factory implementation
        address xChainERC20FactoryImpl = address(new CrossChainERC20Factory(currentBeaconAddress));
        console.log("Deployed new CrossChainERC20Factory implementation: %s", xChainERC20FactoryImpl);

        // Upgrade CrossChainERC20Factory to new implementation
        ERC1967Factory(cfg.erc1967Factory).upgrade(currentFactoryAddress, xChainERC20FactoryImpl);
        console.log("Upgraded CrossChainERC20Factory!");
    }

    function _upgradeBridge(
        HelperConfig.NetworkConfig memory cfg,
        address currentBridgeAddress,
        address currentTwinAddress,
        address currentFactoryAddress
    ) internal {
        address bridgeImpl = address(
            new Bridge({
                remoteBridge: cfg.remoteBridge,
                trustedRelayer: cfg.trustedRelayer,
                twinBeacon: currentTwinAddress,
                crossChainErc20Factory: currentFactoryAddress
            })
        );

        console.log("Deployed new Bridge implementation: %s", bridgeImpl);
        // Use ERC1967Factory to upgrade the proxy
        ERC1967Factory(cfg.erc1967Factory).upgrade(currentBridgeAddress, bridgeImpl);
        console.log("Upgraded Bridge proxy!");
    }
}
