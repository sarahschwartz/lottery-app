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
