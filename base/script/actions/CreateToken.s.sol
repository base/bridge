// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {stdJson} from "forge-std/StdJson.sol";
import {console} from "forge-std/console.sol";
import {ERC1967Factory} from "solady/utils/ERC1967Factory.sol";
import {ERC1967FactoryConstants} from "solady/utils/ERC1967FactoryConstants.sol";
import {LibString} from "solady/utils/LibString.sol";

import {CrossChainERC20Factory} from "../../src/CrossChainERC20Factory.sol";
import {DevOps} from "../DevOps.s.sol";

contract CreateTokenScript is DevOps {
    using stdJson for string;
    using LibString for string;

    bytes32 public immutable REMOTE_TOKEN = vm.envBytes32("REMOTE_TOKEN");
    string public tokenName = vm.envString("TOKEN_NAME");
    string public tokenSymbol = vm.envString("TOKEN_SYMBOL");

    CrossChainERC20Factory public crossChainERC20Factory;

    function setUp() public {
        crossChainERC20Factory = CrossChainERC20Factory(_getAddress("CrossChainERC20Factory"));
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

        _serializeAddress({key: tokenName, value: token});
    }
}
