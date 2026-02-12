// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract NumberGuessingGame {
  struct Session {
    uint32 maxNumber;
    uint32 winningNumber;
    uint64 drawTimestamp;
    uint256 payout;
    address winner;
    bool winningNumberSet;
    bool payoutClaimed;
  }

  address public admin;
  uint256 public nextSessionId;

  mapping(uint256 => Session) public sessions;
  mapping(uint256 => mapping(uint32 => address)) public pickedByNumber;
  mapping(uint256 => mapping(address => uint32)) public pickedNumberByPlayer;
  mapping(uint256 => mapping(address => bool)) public hasPicked;

  event SessionCreated(
    uint256 indexed sessionId,
    uint32 maxNumber,
    uint256 payout,
    uint64 drawTimestamp
  );
  event NumberPicked(
    uint256 indexed sessionId,
    address indexed player,
    uint32 number
  );
  event WinningNumberSet(
    uint256 indexed sessionId,
    uint32 winningNumber,
    address winner
  );
  event PayoutClaimed(
    uint256 indexed sessionId,
    address indexed winner,
    uint256 amount
  );
  event EmergencyWithdrawal(address indexed to, uint256 amount);
  event AdminChanged(address indexed previousAdmin, address indexed newAdmin);

  modifier onlyAdmin() {
    require(msg.sender == admin, "only admin");
    _;
  }

  constructor() {
    admin = msg.sender;
  }

  function changeAdmin(address newAdmin) external onlyAdmin {
    require(newAdmin != address(0), "invalid admin");
    address previousAdmin = admin;
    admin = newAdmin;
    emit AdminChanged(previousAdmin, newAdmin);
  }

  function createSession(uint32 maxNumber) external payable onlyAdmin returns (uint256 sessionId) {
    require(maxNumber > 0, "maxNumber must be > 0");
    require(msg.value > 0, "payout must be > 0");

    sessionId = nextSessionId;
    nextSessionId++;

    uint64 drawTimestamp = uint64(block.timestamp + 1 days);
    sessions[sessionId] = Session({
      maxNumber: maxNumber,
      winningNumber: 0,
      drawTimestamp: drawTimestamp,
      payout: msg.value,
      winner: address(0),
      winningNumberSet: false,
      payoutClaimed: false
    });

    emit SessionCreated(sessionId, maxNumber, msg.value, drawTimestamp);
  }

  function pickNumber(uint256 sessionId, uint32 number) external {
    Session storage session = _getSession(sessionId);
    require(!session.winningNumberSet, "winner already chosen");
    require(block.timestamp < session.drawTimestamp, "session closed");
    require(number >= 1 && number <= session.maxNumber, "number out of range");
    require(!hasPicked[sessionId][msg.sender], "already picked");
    require(pickedByNumber[sessionId][number] == address(0), "number already picked");

    pickedByNumber[sessionId][number] = msg.sender;
    pickedNumberByPlayer[sessionId][msg.sender] = number;
    hasPicked[sessionId][msg.sender] = true;

    emit NumberPicked(sessionId, msg.sender, number);
  }

  function setWinningNumber(uint256 sessionId, uint32 winningNumber) external onlyAdmin {
    Session storage session = _getSession(sessionId);
    require(!session.winningNumberSet, "winning number already set");
    require(block.timestamp >= session.drawTimestamp, "too early");
    require(winningNumber >= 1 && winningNumber <= session.maxNumber, "number out of range");

    session.winningNumber = winningNumber;
    session.winningNumberSet = true;
    session.winner = pickedByNumber[sessionId][winningNumber];

    emit WinningNumberSet(sessionId, winningNumber, session.winner);
  }

  function claimPayout(uint256 sessionId) external {
    Session storage session = _getSession(sessionId);
    require(session.winningNumberSet, "winning number not set");
    require(!session.payoutClaimed, "payout already claimed");
    require(session.winner != address(0), "no winner");
    require(msg.sender == session.winner, "not winner");

    uint256 amount = session.payout;
    session.payout = 0;
    session.payoutClaimed = true;

    (bool sent, ) = payable(msg.sender).call{value: amount}("");
    require(sent, "payout transfer failed");

    emit PayoutClaimed(sessionId, msg.sender, amount);
  }

  function emergencyWithdraw(address payable to, uint256 amount) external onlyAdmin {
    require(to != address(0), "invalid recipient");
    require(amount <= address(this).balance, "insufficient balance");

    (bool sent, ) = to.call{value: amount}("");
    require(sent, "withdraw transfer failed");

    emit EmergencyWithdrawal(to, amount);
  }

  function getPickedNumber(uint256 sessionId, address player) external view returns (uint32) {
    require(hasPicked[sessionId][player], "player has not picked");
    return pickedNumberByPlayer[sessionId][player];
  }

  function _getSession(uint256 sessionId) internal view returns (Session storage session) {
    session = sessions[sessionId];
    require(session.maxNumber != 0, "session does not exist");
  }
}
