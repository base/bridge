// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {LibString} from "solady/utils/LibString.sol";

contract DevOps is Script {
    string environment = vm.envString("BRIDGE_ENVIRONMENT");

    constructor() {
        string memory fileName = _generateDeploymentFilename();
        if (!vm.isFile(fileName)) {
            string memory fileData = vm.readFile(string.concat(vm.projectRoot(), "/deployments/template.json"));
            vm.writeJson({json: fileData, path: fileName});
        }
    }

    function _getAddress(string memory key) internal returns (address) {
        string memory fileData = vm.readFile(string.concat(vm.projectRoot(), "/", _generateDeploymentFilename()));
        return vm.parseJsonAddress({json: fileData, key: string.concat(".", key)});
    }

    function _serializeAddress(string memory key, address value) internal {
        vm.writeJson({
            json: LibString.toHexStringChecksummed(value),
            path: _generateDeploymentFilename(),
            valueKey: string.concat(".", key)
        });
    }

    function _generateDeploymentFilename() private returns (string memory) {
        Chain memory chain = getChain(block.chainid);

        if (bytes(environment).length == 0) {
            return string.concat("deployments/", chain.chainAlias, ".json");
        }

        return string.concat("deployments/", chain.chainAlias, "_", environment, ".json");
    }
}
