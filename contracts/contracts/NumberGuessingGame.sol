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
  mapping(uint256 => mapping(uint256 => uint256)) private takenNumberBitmap;

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
  event PayoutRefundedToAdmin(uint256 indexed sessionId, uint256 amount);
  event ContractFundsWithdrawal(address indexed to, uint256 amount);
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

  function createSession(uint32 maxNumber, uint32 _minutes) external payable onlyAdmin returns (uint256 sessionId) {
  // function createSession(uint32 maxNumber, uint32 _hours) external payable onlyAdmin returns (uint256 sessionId) {
    require(maxNumber > 0, "maxNumber must be > 0");
    require(_minutes > 0, "minutes must be > 0");
    // require(_hours > 0, "hours must be > 0");
    require(msg.value > 0, "payout must be > 0");

    sessionId = nextSessionId;
    nextSessionId++;

    uint64 drawTimestamp = uint64(block.timestamp + _minutes * 1 minutes);
    // uint64 drawTimestamp = uint64(block.timestamp + _hours * 1 hours);
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
    _setTakenNumberBit(sessionId, number);

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

    if (session.winner == address(0) && !session.payoutClaimed) {
      session.payoutClaimed = true;
      uint256 amount = session.payout;
      (bool sent, ) = payable(admin).call{value: amount}("");
      require(sent, "admin refund transfer failed");
      emit PayoutRefundedToAdmin(sessionId, amount);
    }

    emit WinningNumberSet(sessionId, winningNumber, session.winner);
  }

  function claimPayout(uint256 sessionId) external {
    Session storage session = _getSession(sessionId);
    require(session.winningNumberSet, "winning number not set");
    require(!session.payoutClaimed, "payout already claimed");
    require(session.winner != address(0), "no winner");
    require(msg.sender == session.winner, "not winner");

    uint256 amount = session.payout;
    session.payoutClaimed = true;

    (bool sent, ) = payable(msg.sender).call{value: amount}("");
    require(sent, "payout transfer failed");

    emit PayoutClaimed(sessionId, msg.sender, amount);
  }

  function withdrawContractFunds(address payable to, uint256 amount) external onlyAdmin {
    require(to != address(0), "invalid recipient");
    require(amount <= address(this).balance, "insufficient balance");

    (bool sent, ) = to.call{value: amount}("");
    require(sent, "withdraw transfer failed");

    emit ContractFundsWithdrawal(to, amount);
  }

  function getPickedNumber(uint256 sessionId, address player) external view returns (uint32) {
    require(hasPicked[sessionId][player], "player has not picked");
    return pickedNumberByPlayer[sessionId][player];
  }

  function getTakenBitmap(uint256 sessionId) external view returns (uint256[] memory bitmap) {
    Session storage session = _getSession(sessionId);
    uint256 wordCount = (uint256(session.maxNumber) + 255) / 256;
    bitmap = new uint256[](wordCount);

    for (uint256 i = 0; i < wordCount; i++) {
      bitmap[i] = takenNumberBitmap[sessionId][i];
    }
  }

  function _setTakenNumberBit(uint256 sessionId, uint32 number) internal {
    uint256 zeroBased = uint256(number - 1);
    uint256 wordIndex = zeroBased / 256;
    uint256 bitIndex = zeroBased % 256;
    takenNumberBitmap[sessionId][wordIndex] |= (uint256(1) << bitIndex);
  }

  function _getSession(uint256 sessionId) internal view returns (Session storage session) {
    session = sessions[sessionId];
    require(session.maxNumber != 0, "session does not exist");
  }
}
