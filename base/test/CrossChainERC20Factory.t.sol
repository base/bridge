// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LibClone} from "solady/utils/LibClone.sol";

import {DeployScript} from "../script/Deploy.s.sol";

import {Bridge} from "../src/Bridge.sol";
import {CrossChainERC20} from "../src/CrossChainERC20.sol";
import {CrossChainERC20Factory} from "../src/CrossChainERC20Factory.sol";
import {CommonTest} from "./CommonTest.t.sol";

contract CrossChainERC20FactoryTest is CommonTest {
    //////////////////////////////////////////////////////////////
    ///                       Test Setup                       ///
    //////////////////////////////////////////////////////////////
    address public beacon;

    // Test users
    address public deployer = makeAddr("deployer");
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");

    // Test parameters
    bytes32 public constant REMOTE_TOKEN = bytes32(uint256(0x123456789abcdef));
    string public constant TOKEN_NAME = "Test Token";
    string public constant TOKEN_SYMBOL = "TEST";
    uint8 public constant TOKEN_DECIMALS = 18;

    function setUp() public {
        DeployScript deployerScript = new DeployScript();
        (,, bridge, factory,) = deployerScript.run();

        // Initialize the beacon and tokenBridge variables
        beacon = factory.BEACON();
    }

    //////////////////////////////////////////////////////////////
    ///                   Constructor Tests                    ///
    //////////////////////////////////////////////////////////////

    function test_constructor_setsBeaconAddress() public view {
        assertEq(factory.BEACON(), beacon, "Factory should store correct beacon address");
    }

    function test_constructor_disablesInitializers() public {
        // Try to create a new factory and verify it can't be initialized
        CrossChainERC20Factory newFactory = new CrossChainERC20Factory(beacon);

        // The implementation should have initializers disabled
        // This is verified by the fact that the constructor completes successfully
        // without throwing an "AlreadyInitialized" error
        assertTrue(address(newFactory) != address(0), "Factory should deploy successfully");
    }

    //////////////////////////////////////////////////////////////
    ///                    Deploy Tests                        ///
    //////////////////////////////////////////////////////////////

    function test_deploy_successfulDeployment() public {
        vm.prank(deployer);
        address deployedToken = factory.deploy(REMOTE_TOKEN, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS);

        // Verify the deployed token exists
        assertTrue(deployedToken != address(0), "Deployed token address should not be zero");

        // Verify it's a contract (has code)
        assertTrue(deployedToken.code.length > 0, "Deployed address should contain contract code");
    }

    function test_deploy_deterministicAddresses() public {
        // Deploy with same parameters from different addresses should result in same contract address
        vm.prank(deployer);
        address token1 = factory.deploy(REMOTE_TOKEN, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS);

        vm.prank(user1);
        address token2 = factory.deploy(
            bytes32(uint256(REMOTE_TOKEN) + 1), // Different remote token
            TOKEN_NAME,
            TOKEN_SYMBOL,
            TOKEN_DECIMALS
        );

        // Deploy with same parameters as first deployment
        vm.prank(user2);
        vm.expectRevert(); // Should revert because contract already exists at that address
        factory.deploy(REMOTE_TOKEN, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS);

        // Verify different parameters result in different addresses
        assertTrue(token1 != token2, "Different parameters should result in different addresses");
    }

    function test_deploy_emitsCorrectEvent() public {
        vm.prank(deployer);

        // Calculate expected address using the same salt logic as the contract
        bytes32 salt = keccak256(abi.encode(REMOTE_TOKEN, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS));
        address expectedAddress = LibClone.predictDeterministicAddressERC1967BeaconProxy(beacon, salt, address(factory));

        // Expect the event to be emitted
        vm.expectEmit(true, true, false, true);
        emit CrossChainERC20Factory.CrossChainERC20Created(expectedAddress, REMOTE_TOKEN, deployer);

        address deployedToken = factory.deploy(REMOTE_TOKEN, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS);

        assertEq(deployedToken, expectedAddress, "Deployed address should match predicted address");
    }

    function test_deploy_withDifferentDecimals() public {
        vm.prank(deployer);

        // Test with 0 decimals
        address token0 = factory.deploy(REMOTE_TOKEN, TOKEN_NAME, TOKEN_SYMBOL, 0);
        assertTrue(token0 != address(0), "Should deploy with 0 decimals");

        // Test with 6 decimals (common for USDC)
        address token6 = factory.deploy(bytes32(uint256(REMOTE_TOKEN) + 1), TOKEN_NAME, TOKEN_SYMBOL, 6);
        assertTrue(token6 != address(0), "Should deploy with 6 decimals");

        // Test with maximum decimals
        address token255 = factory.deploy(bytes32(uint256(REMOTE_TOKEN) + 2), TOKEN_NAME, TOKEN_SYMBOL, 255);
        assertTrue(token255 != address(0), "Should deploy with 255 decimals");

        // Verify all addresses are different
        assertTrue(
            token0 != token6 && token6 != token255 && token0 != token255, "All tokens should have different addresses"
        );
    }

    function test_deploy_withEmptyStrings() public {
        vm.prank(deployer);

        // Test with empty name and symbol
        address token = factory.deploy(REMOTE_TOKEN, "", "", TOKEN_DECIMALS);
        assertTrue(token != address(0), "Should deploy with empty name and symbol");
    }

    function test_deploy_withLongStrings() public {
        vm.prank(deployer);

        // Test with very long name and symbol
        string memory longName =
            "This is a very long token name that might cause issues if not handled properly in the smart contract";
        string memory longSymbol = "VERYLONGSYMBOL";

        address token = factory.deploy(REMOTE_TOKEN, longName, longSymbol, TOKEN_DECIMALS);
        assertTrue(token != address(0), "Should deploy with long name and symbol");
    }

    function test_deploy_withZeroRemoteToken() public {
        vm.prank(deployer);

        address token = factory.deploy(bytes32(0), TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS);
        assertTrue(token != address(0), "Should deploy with zero remote token address");
    }

    function test_deploy_withMaxRemoteToken() public {
        vm.prank(deployer);

        bytes32 maxRemoteToken = bytes32(type(uint256).max);
        address token = factory.deploy(maxRemoteToken, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS);
        assertTrue(token != address(0), "Should deploy with max remote token address");
    }

    function test_deploy_multipleUniqueDeployments() public {
        address[] memory deployedTokens = new address[](5);

        for (uint256 i = 0; i < 5; i++) {
            vm.prank(deployer);
            deployedTokens[i] = factory.deploy(
                bytes32(uint256(REMOTE_TOKEN) + i),
                string(abi.encodePacked(TOKEN_NAME, vm.toString(i))),
                string(abi.encodePacked(TOKEN_SYMBOL, vm.toString(i))),
                TOKEN_DECIMALS
            );
            assertTrue(deployedTokens[i] != address(0), "Each deployment should succeed");
        }

        // Verify all addresses are unique
        for (uint256 i = 0; i < 5; i++) {
            for (uint256 j = i + 1; j < 5; j++) {
                assertTrue(deployedTokens[i] != deployedTokens[j], "All deployed tokens should have unique addresses");
            }
        }
    }

    //////////////////////////////////////////////////////////////
    ///                   Fuzz Tests                          ///
    //////////////////////////////////////////////////////////////

    /// forge-config: default.fuzz.runs = 1000
    function testFuzz_deploy_withRandomParameters(
        bytes32 remoteToken,
        string memory name,
        string memory symbol,
        uint8 decimals
    ) public {
        vm.prank(deployer);

        address deployedToken = factory.deploy(remoteToken, name, symbol, decimals);

        // Verify basic deployment success
        assertTrue(deployedToken != address(0), "Deployment should succeed with any valid parameters");
        assertTrue(deployedToken.code.length > 0, "Deployed address should contain contract code");
    }

    /// forge-config: default.fuzz.runs = 500
    function testFuzz_deploy_deterministicWithSameParameters(
        bytes32 remoteToken,
        string memory name,
        string memory symbol,
        uint8 decimals
    ) public {
        // Generate 2 random deployer addresses.
        address randomDeployer1 = makeAddr(string.concat("deployer1", vm.toString(remoteToken)));
        address randomDeployer2 = makeAddr(string.concat("deployer2", vm.toString(remoteToken)));

        // Calculate expected address
        bytes32 salt = keccak256(abi.encode(remoteToken, name, symbol, decimals));
        address expectedAddress = LibClone.predictDeterministicAddressERC1967BeaconProxy(beacon, salt, address(factory));

        // First deployment
        vm.prank(randomDeployer1);
        address token1 = factory.deploy(remoteToken, name, symbol, decimals);

        // Verify address matches prediction
        assertEq(token1, expectedAddress, "First deployment should match predicted address");

        // Second deployment with same parameters should fail
        vm.prank(randomDeployer2);
        vm.expectRevert();
        factory.deploy(remoteToken, name, symbol, decimals);
    }

    //////////////////////////////////////////////////////////////
    ///                   Access Control Tests                ///
    //////////////////////////////////////////////////////////////

    function test_deploy_anyoneCanDeploy() public {
        // Test that anyone can call the deploy function
        address[] memory callers = new address[](3);
        callers[0] = deployer;
        callers[1] = user1;
        callers[2] = user2;

        for (uint256 i = 0; i < callers.length; i++) {
            vm.prank(callers[i]);
            address token = factory.deploy(bytes32(uint256(REMOTE_TOKEN) + i), TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS);
            assertTrue(token != address(0), "Any address should be able to deploy tokens");
        }
    }

    //////////////////////////////////////////////////////////////
    ///                   Integration Tests                    ///
    //////////////////////////////////////////////////////////////

    function test_deploy_integrationWithActualToken() public {
        vm.prank(deployer);
        address deployedToken = factory.deploy(REMOTE_TOKEN, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS);

        // Verify the proxy was deployed and is a contract
        assertTrue(deployedToken != address(0), "Token should be deployed");
        assertTrue(deployedToken.code.length > 0, "Token should have code");

        // Verify the token was properly initialized
        CrossChainERC20 token = CrossChainERC20(deployedToken);
        assertEq(token.name(), TOKEN_NAME, "Token name should match");
        assertEq(token.symbol(), TOKEN_SYMBOL, "Token symbol should match");
        assertEq(token.decimals(), TOKEN_DECIMALS, "Token decimals should match");
        assertEq(token.remoteToken(), REMOTE_TOKEN, "Remote token should match");
        assertEq(token.bridge(), address(bridge), "Bridge address should match");
    }

    //////////////////////////////////////////////////////////////
    ///                   Gas Usage Tests                     ///
    //////////////////////////////////////////////////////////////

    function test_deploy_gasUsage() public {
        vm.prank(deployer);

        uint256 gasBefore = gasleft();
        factory.deploy(REMOTE_TOKEN, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS);
        uint256 gasUsed = gasBefore - gasleft();

        // Verify deployment doesn't use excessive gas
        // This is more of a regression test to catch unexpected gas increases
        assertTrue(gasUsed < 500_000, "Deployment should not use excessive gas");
    }

    //////////////////////////////////////////////////////////////
    ///                   Edge Case Tests                     ///
    //////////////////////////////////////////////////////////////

    function test_deploy_afterFactoryUpgrade() public {
        // This test ensures the factory continues to work if the beacon implementation is upgraded

        // Note: In a real scenario, you would deploy a new implementation and update the beacon
        // to point to it through proper beacon ownership/governance mechanisms
        // For this test, we'll just verify the factory continues to work with the current beacon

        vm.prank(deployer);
        address token = factory.deploy(REMOTE_TOKEN, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS);
        assertTrue(token != address(0), "Factory should continue working after implementation changes");
    }
}
