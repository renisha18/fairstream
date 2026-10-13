// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {FairStream} from "../src/FairStream.sol";

contract FairStreamTest is Test {
    uint256 constant CAP = 7_990_000; // $7.99
    uint256 constant DEPOSIT = 20_000_000; // $20

    MockUSDC usdc;
    FairStream fs;

    address viewer = makeAddr("viewer");
    uint256 meterPk;
    address meter;

    function setUp() public {
        usdc = new MockUSDC();
        fs = new FairStream(usdc, CAP);
        (meter, meterPk) = makeAddrAndKey("meter");

        usdc.mint(viewer, DEPOSIT);
        vm.startPrank(viewer);
        usdc.approve(address(fs), DEPOSIT);
        fs.deposit(DEPOSIT, meter);
        vm.stopPrank();
    }

    function _sign(uint256 pk, address v, bytes32 sessionId, uint256 amount) internal view returns (bytes memory) {
        (uint8 r_v, bytes32 r, bytes32 s) = vm.sign(pk, fs.receiptDigest(v, sessionId, amount));
        return abi.encodePacked(r, s, r_v);
    }

    function test_ValidReceiptSettlesAndReducesBalance() public {
        bytes32 sid = keccak256("session-1");
        fs.settle(viewer, sid, 10_000, _sign(meterPk, viewer, sid, 10_000));

        assertEq(fs.balance(viewer), DEPOSIT - 10_000);
        assertEq(fs.earnings(), 10_000);
        assertTrue(fs.settled(sid));
    }

    function test_WrongKeyReverts() public {
        (, uint256 otherPk) = makeAddrAndKey("attacker");
        bytes32 sid = keccak256("session-1");
        bytes memory sig = _sign(otherPk, viewer, sid, 10_000);

        vm.expectRevert(FairStream.InvalidSignature.selector);
        fs.settle(viewer, sid, 10_000, sig);
    }

    function test_SameSessionCannotSettleTwice() public {
        bytes32 sid = keccak256("session-1");
        bytes memory sig = _sign(meterPk, viewer, sid, 10_000);
        fs.settle(viewer, sid, 10_000, sig);

        vm.expectRevert(abi.encodeWithSelector(FairStream.AlreadySettled.selector, sid));
        fs.settle(viewer, sid, 10_000, sig);
    }

    function test_ChargesStopAtMonthlyCap() public {
        bytes32 sid1 = keccak256("session-1");
        fs.settle(viewer, sid1, 7_000_000, _sign(meterPk, viewer, sid1, 7_000_000));

        // Asks for $5 but only $0.99 of the cap is left.
        bytes32 sid2 = keccak256("session-2");
        fs.settle(viewer, sid2, 5_000_000, _sign(meterPk, viewer, sid2, 5_000_000));

        assertEq(fs.earnings(), CAP);
        assertEq(fs.balance(viewer), DEPOSIT - CAP);

        // Cap reached: further receipts charge nothing.
        bytes32 sid3 = keccak256("session-3");
        fs.settle(viewer, sid3, 10_000, _sign(meterPk, viewer, sid3, 10_000));
        assertEq(fs.earnings(), CAP);

        // Next 30-day period: charging resumes.
        vm.warp(block.timestamp + 30 days);
        bytes32 sid4 = keccak256("session-4");
        fs.settle(viewer, sid4, 10_000, _sign(meterPk, viewer, sid4, 10_000));
        assertEq(fs.earnings(), CAP + 10_000);
    }

    function test_ChargeNeverExceedsBalance() public {
        address poor = makeAddr("poor");
        usdc.mint(poor, 50_000); // $0.05
        vm.startPrank(poor);
        usdc.approve(address(fs), 50_000);
        fs.deposit(50_000, meter);
        vm.stopPrank();

        bytes32 sid = keccak256("poor-session");
        fs.settle(poor, sid, 1_000_000, _sign(meterPk, poor, sid, 1_000_000));

        assertEq(fs.balance(poor), 0);
        assertEq(fs.earnings(), 50_000);
    }

    function test_WithdrawBeforeDelayReverts() public {
        vm.startPrank(viewer);
        fs.requestWithdraw();
        vm.warp(block.timestamp + 2 minutes - 1);
        vm.expectRevert();
        fs.withdraw();
        vm.stopPrank();
    }

    function test_WithdrawAfterDelayReturnsFunds() public {
        vm.startPrank(viewer);
        fs.requestWithdraw();
        vm.warp(block.timestamp + 2 minutes);
        fs.withdraw();
        vm.stopPrank();

        assertEq(fs.balance(viewer), 0);
        assertEq(usdc.balanceOf(viewer), DEPOSIT);
    }

    function test_OnlyOwnerCanSettle() public {
        bytes32 sid = keccak256("session-1");
        bytes memory sig = _sign(meterPk, viewer, sid, 10_000);

        vm.prank(viewer);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, viewer));
        fs.settle(viewer, sid, 10_000, sig);
    }
}
