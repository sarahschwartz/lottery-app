// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

struct PackedUserOperation {
  address sender;
  uint256 nonce;
  bytes initCode;
  bytes callData;
  bytes32 accountGasLimits;
  uint256 preVerificationGas;
  bytes32 gasFees;
  bytes paymasterAndData;
  bytes signature;
}

interface IEntryPoint {
  function depositTo(address account) external payable;
  function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external;
  function addStake(uint32 unstakeDelaySec) external payable;
  function unlockStake() external;
  function withdrawStake(address payable withdrawAddress) external;
  function balanceOf(address account) external view returns (uint256);
}

interface IPaymaster {
  enum PostOpMode {
    opSucceeded,
    opReverted,
    postOpReverted
  }

  function validatePaymasterUserOp(
    PackedUserOperation calldata userOp,
    bytes32 userOpHash,
    uint256 maxCost
  ) external returns (bytes memory context, uint256 validationData);

  function postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost, uint256 actualUserOpFeePerGas) external;
}

contract AcceptAllPaymaster is IPaymaster {
  address public immutable ENTRY_POINT;
  address public owner;
  bool public paused;

  modifier onlyOwner() {
    require(msg.sender == owner, "only owner");
    _;
  }

  modifier onlyEntryPoint() {
    require(msg.sender == ENTRY_POINT, "only entryPoint");
    _;
  }

  constructor(address entryPoint_, address owner_) {
    require(entryPoint_ != address(0), "invalid entryPoint");
    require(owner_ != address(0), "invalid owner");
    ENTRY_POINT = entryPoint_;
    owner = owner_;
  }

  function setPaused(bool value) external onlyOwner {
    paused = value;
  }

  function transferOwnership(address newOwner) external onlyOwner {
    require(newOwner != address(0), "invalid owner");
    owner = newOwner;
  }

  function validatePaymasterUserOp(
    PackedUserOperation calldata,
    bytes32,
    uint256
  ) external view onlyEntryPoint returns (bytes memory context, uint256 validationData) {
    require(!paused, "paymaster paused");
    return ("", 0);
  }

  function postOp(PostOpMode, bytes calldata, uint256, uint256) external view onlyEntryPoint {}

  function deposit() external payable onlyOwner {
    IEntryPoint(ENTRY_POINT).depositTo{value: msg.value}(address(this));
  }

  function addStake(uint32 unstakeDelaySec) external payable onlyOwner {
    IEntryPoint(ENTRY_POINT).addStake{value: msg.value}(unstakeDelaySec);
  }

  function unlockStake() external onlyOwner {
    IEntryPoint(ENTRY_POINT).unlockStake();
  }

  function withdrawStake(address payable to) external onlyOwner {
    IEntryPoint(ENTRY_POINT).withdrawStake(to);
  }

  function withdrawDepositTo(address payable to, uint256 amount) external onlyOwner {
    IEntryPoint(ENTRY_POINT).withdrawTo(to, amount);
  }

  function entryPointDeposit() external view returns (uint256) {
    return IEntryPoint(ENTRY_POINT).balanceOf(address(this));
  }

  receive() external payable {}
}
