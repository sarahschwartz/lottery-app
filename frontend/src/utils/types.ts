export type SessionState = {
  sessionId: bigint;
  maxNumber: number;
  drawTimestamp: bigint;
  payout: bigint;
  winner: `0x${string}`;
  winningNumberSet: boolean;
  payoutClaimed: boolean;
};

export type SessionResult = readonly [number, number, bigint, bigint, `0x${string}`, boolean, boolean];

export type BlockReader = { getBlock: () => Promise<{ timestamp: bigint }> };
export type PreviousSessionRow = {
  sessionId: bigint;
  winningNumber: number;
  payout: bigint;
  winner: `0x${string}`;
  payoutClaimed: boolean;
  winningNumberSet: boolean;
};