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

contract UpgradeScript is DevOps {
    // Upgrade Config:
    bool upgradeTwin = false; // MODIFY THIS WHEN UPGRADING
    bool upgradeERC20 = false; // MODIFY THIS WHEN UPGRADING
    bool upgradeERC20Factory = false; // MODIFY THIS WHEN UPGRADING
    bool upgradeBridgeValidator = false; // MODIFY THIS WHEN UPGRADING
    bool upgradeBridge = false; // MODIFY THIS WHEN UPGRADING

    // Deployment addresss
    address bridgeValidatorAddress;
    address bridgeAddress;
    address erc20FactoryAddress;
    address twinBeaconAddress;
    address crossChainERC20BeaconAddress;

    function setUp() external {
        // Read existing deployment addresses
        (bridgeAddress, erc20FactoryAddress, twinBeaconAddress) = _readAndParseDeploymentFile();

        // Upgrade CrossChainERC20Beacon and CrossChainERC20Factory
        crossChainERC20BeaconAddress = CrossChainERC20Factory(erc20FactoryAddress).BEACON();
    }

    function run() public {
        HelperConfig helperConfig = new HelperConfig();
        HelperConfig.NetworkConfig memory cfg = helperConfig.getConfig();

        vm.startBroadcast();

        // Upgrade TwinBeacon
        if (upgradeTwin) {
            _upgradeTwinBeacon();
        }

        if (upgradeERC20) {
            _upgradeCrossChainERC20Beacon();
        }

        if (upgradeERC20Factory) {
            _upgradeCrossChainERC20Factory(cfg);
        }

        if (upgradeBridgeValidator) {
            _upgradeBridgeValidator(cfg);
        }

        // Upgrade Bridge
        if (upgradeBridge) {
            _upgradeBridge(cfg);
        }

        vm.stopBroadcast();
    }

    function _readAndParseDeploymentFile() internal view returns (address, address, address) {
        return (_getAddress("Bridge"), _getAddress("CrossChainERC20Factory"), _getAddress("Twin"));
    }

    function _upgradeTwinBeacon() internal {
        // Deploy new Twin Implementation
        address twinImpl = address(new Twin(bridgeAddress));
        console.log("Deployed new Twin implementation: %s", twinImpl);

        // Upgrade TwinBeacon to new implementation
        UpgradeableBeacon beacon = UpgradeableBeacon(twinBeaconAddress);
        beacon.upgradeTo(twinImpl);
        console.log("Upgraded TwinBeacon!");
    }

    function _upgradeCrossChainERC20Beacon() internal {
        // Deploy new erc20 implementation
        address erc20Impl = address(new CrossChainERC20(bridgeAddress));

        // Upgrade CrossChainERC20Beacon to new implementation --> This will automatically upgrade the Factory contract
        // as well
        UpgradeableBeacon beacon = UpgradeableBeacon(crossChainERC20BeaconAddress);
        beacon.upgradeTo(erc20Impl);
        console.log("Upgraded CrossChainERC20Beacon!");
    }

    function _upgradeCrossChainERC20Factory(HelperConfig.NetworkConfig memory cfg) internal {
        // Deploy new Factory implementation
        address xChainERC20FactoryImpl = address(new CrossChainERC20Factory(crossChainERC20BeaconAddress));
        console.log("Deployed new CrossChainERC20Factory implementation: %s", xChainERC20FactoryImpl);

        // Upgrade CrossChainERC20Factory to new implementation
        ERC1967Factory(cfg.erc1967Factory).upgrade(erc20FactoryAddress, xChainERC20FactoryImpl);
        console.log("Upgraded CrossChainERC20Factory!");
    }

    function _upgradeBridgeValidator(HelperConfig.NetworkConfig memory cfg) internal {
        address bridgeValidatorImpl = address(
            new BridgeValidator({
                trustedRelayer: cfg.trustedRelayer,
                partnerValidatorThreshold: cfg.partnerValidatorThreshold
            })
        );

        console.log("Deployed new BridgeValidator implementation: %s", bridgeValidatorImpl);
        // Use ERC1967Factory to upgrade the proxy
        ERC1967Factory(cfg.erc1967Factory).upgrade(bridgeValidatorAddress, bridgeValidatorImpl);
        console.log("Upgraded BridgeValidator proxy!");
    }

    function _upgradeBridge(HelperConfig.NetworkConfig memory cfg) internal {
        address bridgeImpl = address(
            new Bridge({
                remoteBridge: cfg.remoteBridge,
                twinBeacon: twinBeaconAddress,
                crossChainErc20Factory: erc20FactoryAddress,
                bridgeValidator: bridgeValidatorAddress
            })
        );

        console.log("Deployed new Bridge implementation: %s", bridgeImpl);
        // Use ERC1967Factory to upgrade the proxy
        ERC1967Factory(cfg.erc1967Factory).upgrade(bridgeAddress, bridgeImpl);
        console.log("Upgraded Bridge proxy!");
    }
}
