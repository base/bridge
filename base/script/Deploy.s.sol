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
    bytes12 salt = bytes12(keccak256(abi.encode(block.timestamp)));

    function run() public returns (Twin, BridgeValidator, Bridge, CrossChainERC20Factory, HelperConfig) {
        HelperConfig helperConfig = new HelperConfig();
        HelperConfig.NetworkConfig memory cfg = helperConfig.getConfig();

        address precomputedBridgeAddress = ERC1967Factory(cfg.erc1967Factory).predictDeterministicAddress(_salt(salt));

        vm.startBroadcast(msg.sender);
        address twinBeacon = _deployTwinBeacon({cfg: cfg, precomputedBridgeAddress: precomputedBridgeAddress});
        address factory = _deployFactory({cfg: cfg, precomputedBridgeAddress: precomputedBridgeAddress});
        address bridgeValidator = _deployBridgeValidator({cfg: cfg, bridge: precomputedBridgeAddress});
        address bridge = _deployBridge({
            cfg: cfg,
            twinBeacon: twinBeacon,
            crossChainErc20Factory: factory,
            bridgeValidator: bridgeValidator
        });
        vm.stopBroadcast();

        require(address(bridge) == precomputedBridgeAddress, "Bridge address mismatch");

        console.log("Deployed TwinBeacon at: %s", twinBeacon);
        console.log("Deployed BridgeValidator at: %s", bridgeValidator);
        console.log("Deployed Bridge at: %s", bridge);
        console.log("Deployed CrossChainERC20Factory at: %s", factory);

        _serializeAddress({key: "Bridge", value: bridge});
        _serializeAddress({key: "BridgeValidator", value: bridgeValidator});
        _serializeAddress({key: "CrossChainERC20Factory", value: factory});
        _serializeAddress({key: "Twin", value: twinBeacon});

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

        address xChainErc20FactoryImpl = address(new CrossChainERC20Factory(erc20Beacon));
        return
            ERC1967Factory(cfg.erc1967Factory).deploy({implementation: xChainErc20FactoryImpl, admin: cfg.initialOwner});
    }

    function _deployBridgeValidator(HelperConfig.NetworkConfig memory cfg, address bridge) private returns (address) {
        address bridgeValidatorImpl = address(
            new BridgeValidator({
                partnerThreshold: cfg.partnerValidatorThreshold,
                bridgeAddress: bridge,
                partnerValidators: cfg.partnerValidators
            })
        );

        return ERC1967Factory(cfg.erc1967Factory).deployAndCall({
            implementation: bridgeValidatorImpl,
            admin: cfg.initialOwner,
            data: abi.encodeCall(BridgeValidator.initialize, (cfg.baseValidators, cfg.baseSignatureThreshold))
        });
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
            salt: _salt(salt),
            data: abi.encodeCall(Bridge.initialize, (cfg.initialOwner, cfg.guardians))
        });
    }

    function _salt(bytes12 salt_) private view returns (bytes32) {
        // Concat the msg.sender and the salt_
        bytes memory packed = abi.encodePacked(msg.sender, salt_);
        return bytes32(packed);
    }
}
