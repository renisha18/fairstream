// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {FairStream} from "../src/FairStream.sol";

contract Deploy is Script {
    uint256 constant MONTHLY_CAP = 7_990_000; // $7.99 at 6 decimals

    function run() external {
        vm.startBroadcast();
        MockUSDC usdc = new MockUSDC();
        FairStream fairStream = new FairStream(usdc, MONTHLY_CAP);
        vm.stopBroadcast();

        console.log("MockUSDC:", address(usdc));
        console.log("FairStream:", address(fairStream));
    }
}
