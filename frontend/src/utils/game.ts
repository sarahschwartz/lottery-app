import type { PreviousSessionRow, SessionResult } from "./types";

export function formatTimeLeft(seconds: number): string {
  if (seconds < 60) return "<1 min";
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min`;
}

export function getRandomWinningNumber(maxNumber: number): number {
  console.log("MAX NUMBER:", maxNumber);
  console.log("window.crypto", window.crypto);
  if (maxNumber <= 1) return 1;

  const maxUint32 = 0xffffffff; // 2^32 - 1
  const range = maxUint32 - (maxUint32 % maxNumber);

  const randomBuffer = new Uint32Array(1);

  while (true) {
    window.crypto.getRandomValues(randomBuffer);
    const value = randomBuffer[0];

    if (value < range) {
      return (value % maxNumber) + 1;
    }
    // otherwise reject and retry
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSessionInfo(gameContract: any) {
  const nextSessionId = (await gameContract.read.nextSessionId()) as bigint;
  const createdEvents = await gameContract.getEvents.SessionCreated({
    fromBlock: 0n,
    toBlock: "latest",
  });
  const claimedEvents = await gameContract.getEvents.PayoutClaimed({
    fromBlock: 0n,
    toBlock: "latest",
  });
  const createdPayoutBySessionId = new Map<string, bigint>();
  const claimedPayoutBySessionId = new Map<string, bigint>();
  for (const event of createdEvents) {
    const sessionId = event.args?.sessionId as bigint | undefined;
    const createdPayout = event.args?.payout as bigint | undefined;
    if (sessionId !== undefined && createdPayout !== undefined) {
      createdPayoutBySessionId.set(sessionId.toString(), createdPayout);
    }
  }
  for (const event of claimedEvents) {
    const sessionId = event.args?.sessionId as bigint | undefined;
    const claimedAmount = event.args?.amount as bigint | undefined;
    if (sessionId !== undefined && claimedAmount !== undefined) {
      claimedPayoutBySessionId.set(sessionId.toString(), claimedAmount);
    }
  }

  return { nextSessionId, createdPayoutBySessionId, claimedPayoutBySessionId };
}

export async function getPreviousSessions(
  latestSessionId: bigint,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gameContract: any,
  createdPayoutBySessionId: Map<string, bigint>,
  claimedPayoutBySessionId: Map<string, bigint>,
) {
  const previous: PreviousSessionRow[] = [];
  if (latestSessionId > 0n) {
    for (let sid = latestSessionId - 1n; sid >= 0n; sid -= 1n) {
      const raw = (await gameContract.read.sessions([sid])) as SessionResult;
      const livePayout = raw[3];
      const displayedPayout =
        livePayout > 0n
          ? livePayout
          : (claimedPayoutBySessionId.get(sid.toString()) ??
            createdPayoutBySessionId.get(sid.toString()) ??
            livePayout);
      previous.push({
        sessionId: sid,
        winningNumber: Number(raw[1]),
        payout: displayedPayout,
        winner: raw[4],
        winningNumberSet: raw[6],
        payoutClaimed: raw[7],
      });

      if (sid === 0n) break;
    }
  }
  return previous;
}
