// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";

contract DevOps is Script {
    string environment = vm.envOr("BRIDGE_ENVIRONMENT", string(""));
    string fileData;

    constructor() {
        string memory fileName = _generateDeploymentFilename();
        if (vm.isFile(fileName)) {
            fileData = vm.readFile(string.concat(vm.projectRoot(), "/", fileName));
        }
    }

    function _getAddress(string memory key) internal view returns (address) {
        return vm.parseJsonAddress({json: fileData, key: string.concat(".", key)});
    }

    function _serializeAddress(string memory key, address value) internal {
        fileData = vm.serializeAddress({objectKey: "root", valueKey: key, value: value});
    }

    function _writeJsonFile() internal {
        vm.writeJson(fileData, _generateDeploymentFilename());
    }

    function _generateDeploymentFilename() private returns (string memory) {
        Chain memory chain = getChain(block.chainid);

        if (bytes(environment).length == 0) {
            return string.concat("deployments/", chain.name, ".json");
        }

        return string.concat("deployments/", chain.name, "_", environment, ".json");
    }
}
