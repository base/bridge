// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {console} from "forge-std/console.sol";

import {ERC1967Factory} from "solady/utils/ERC1967Factory.sol";
import {ERC1967FactoryConstants} from "solady/utils/ERC1967FactoryConstants.sol";
import {LibString} from "solady/utils/LibString.sol";

import {CrossChainERC20Factory} from "../../src/CrossChainERC20Factory.sol";

contract CreateTokenScript is Script {
    using stdJson for string;
    using LibString for string;

    bytes32 public immutable REMOTE_TOKEN = vm.envBytes32("REMOTE_TOKEN");
    string public tokenName = vm.envString("TOKEN_NAME");
    string public tokenSymbol = vm.envString("TOKEN_SYMBOL");

    string public data;

    CrossChainERC20Factory public crossChainERC20Factory;

    function setUp() public {
        Chain memory chain = getChain(block.chainid);
        console.log("Creating token on chain: %s", chain.name);

        string memory rootPath = vm.projectRoot();
        string memory path = string.concat(rootPath, "/deployments/", chain.chainAlias, ".json");
        data = vm.readFile(path);
        address factory = data.readAddress(".CrossChainERC20Factory");
        crossChainERC20Factory = CrossChainERC20Factory(factory);
    }

    function run() public {
        vm.startBroadcast();
        address token = crossChainERC20Factory.deploy({
            remoteToken: REMOTE_TOKEN,
            name: tokenName,
            symbol: tokenSymbol,
            decimals: 9
        });
        console.log("Deployed Token at: %s", token);
        vm.stopBroadcast();

        data = data.slice(0, bytes(data).length - 1);
        data = string.concat(data, ",");
        data = _record(data, tokenName, token);
        data = string.concat(data, "}");
        Chain memory chain = getChain(block.chainid);
        vm.writeFile(string.concat("deployments/", chain.chainAlias, ".json"), data);
    }

    function _record(string memory out, string memory key, address addr) private pure returns (string memory) {
        return string.concat(out, "\"", key, "\": \"", vm.toString(addr), "\"");
    }
}
