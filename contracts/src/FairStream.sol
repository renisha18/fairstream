// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @notice Viewers prepay a balance; the owner settles signed playback receipts
/// against it, capped at `monthlyCap` per viewer per 30-day period.
contract FairStream is EIP712, Ownable {
    using SafeERC20 for IERC20;

    bytes32 public constant RECEIPT_TYPEHASH =
        keccak256("Receipt(address viewer,bytes32 sessionId,uint256 amount)");
    uint256 public constant WITHDRAW_DELAY = 2 minutes;

    IERC20 public immutable usdc;
    uint256 public immutable monthlyCap;

    mapping(address viewer => uint256) public balance;
    mapping(address viewer => address) public meterKey;
    mapping(address viewer => mapping(uint256 month => uint256)) public monthlySpent;
    mapping(bytes32 sessionId => bool) public settled;
    mapping(address viewer => uint256) public withdrawRequestedAt;
    uint256 public earnings;

    event Deposited(address indexed viewer, uint256 amount);
    event MeterKeySet(address indexed viewer, address indexed key);
    event SessionSettled(address indexed viewer, bytes32 indexed sessionId, uint256 requested, uint256 charged);
    event WithdrawRequested(address indexed viewer, uint256 availableAt);
    event Withdrawn(address indexed viewer, uint256 amount);

    error AlreadySettled(bytes32 sessionId);
    error InvalidSignature();
    error NoWithdrawRequested();
    error WithdrawTooEarly(uint256 availableAt);

    constructor(IERC20 usdc_, uint256 monthlyCap_) EIP712("FairStream", "1") Ownable(msg.sender) {
        usdc = usdc_;
        monthlyCap = monthlyCap_;
    }

    function currentMonth() public view returns (uint256) {
        return block.timestamp / 30 days;
    }

    function deposit(uint256 amount, address key) external {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        balance[msg.sender] += amount;
        emit Deposited(msg.sender, amount);

        if (key != address(0)) {
            meterKey[msg.sender] = key;
            emit MeterKeySet(msg.sender, key);
        }
    }

    function settle(address viewer, bytes32 sessionId, uint256 amount, bytes calldata signature)
        external
        onlyOwner
    {
        if (settled[sessionId]) revert AlreadySettled(sessionId);

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(RECEIPT_TYPEHASH, viewer, sessionId, amount)));
        address key = meterKey[viewer];
        if (key == address(0) || !SignatureChecker.isValidSignatureNow(key, digest, signature)) {
            revert InvalidSignature();
        }

        uint256 month = currentMonth();
        uint256 charge = _min(_min(amount, monthlyCap - monthlySpent[viewer][month]), balance[viewer]);

        settled[sessionId] = true;
        balance[viewer] -= charge;
        monthlySpent[viewer][month] += charge;
        earnings += charge;

        emit SessionSettled(viewer, sessionId, amount, charge);
    }

    function requestWithdraw() external {
        uint256 availableAt = block.timestamp + WITHDRAW_DELAY;
        withdrawRequestedAt[msg.sender] = block.timestamp;
        emit WithdrawRequested(msg.sender, availableAt);
    }

    function withdraw() external {
        uint256 requestedAt = withdrawRequestedAt[msg.sender];
        if (requestedAt == 0) revert NoWithdrawRequested();
        uint256 availableAt = requestedAt + WITHDRAW_DELAY;
        if (block.timestamp < availableAt) revert WithdrawTooEarly(availableAt);

        uint256 amount = balance[msg.sender];
        balance[msg.sender] = 0;
        withdrawRequestedAt[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function claimEarnings(address to) external onlyOwner {
        uint256 amount = earnings;
        earnings = 0;
        usdc.safeTransfer(to, amount);
    }

    /// @notice The EIP-712 hash a meter key signs for a receipt. Handy for off-chain checks.
    function receiptDigest(address viewer, bytes32 sessionId, uint256 amount) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(RECEIPT_TYPEHASH, viewer, sessionId, amount)));
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
