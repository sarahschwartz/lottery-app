import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, parseEther, type Client } from "viem";
import { formatTimeLeft } from "../utils/countdown";
import type { SessionResult, SessionState } from "../utils/types";
import { usePrividium } from "../utils/usePrividium";
import { sendCreateSessionTx, sendSetWinningNumberTx } from "../utils/txns";

const DEFAULT_SESSION_PAYOUT_ETH = "0.1";
type BlockReader = { getBlock: () => Promise<{ timestamp: bigint }> };

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gameContract: any;
  rpcClient: Client;
  chainNowSec: number | null;
}

type PreviousSessionRow = {
  sessionId: bigint;
  winningNumber: number;
  payout: bigint;
  winner: `0x${string}`;
  payoutClaimed: boolean;
  winningNumberSet: boolean;
};

export function AdminView({ gameContract, rpcClient, chainNowSec }: Props) {
  const { prividium } = usePrividium();

  const [session, setSession] = useState<SessionState | null>(null);
  const [previousSessions, setPreviousSessions] = useState<PreviousSessionRow[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [maxNumberInput, setMaxNumberInput] = useState<string>("90");
  const [minutesInput, setMinutesInput] = useState<string>("20");
  const [payoutInput, setPayoutInput] = useState<string>(
    DEFAULT_SESSION_PAYOUT_ETH,
  );

  const [txError, setTxError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const loadSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
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

      if (nextSessionId === 0n) {
        setSession(null);
        setPreviousSessions([]);
        return;
      }

      const latestSessionId = nextSessionId - 1n;
      const rawSession = (await gameContract.read.sessions([
        latestSessionId,
      ])) as SessionResult;

      setSession({
        sessionId: latestSessionId,
        maxNumber: Number(rawSession[0]),
        drawTimestamp: rawSession[2],
        payout: rawSession[3],
        winner: rawSession[4],
        winningNumberSet: rawSession[5],
        payoutClaimed: rawSession[6],
      });

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
            winningNumberSet: raw[5],
            payoutClaimed: raw[6],
          });

          if (sid === 0n) break;
        }
      }
      setPreviousSessions(previous);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load latest session.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [gameContract]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const secondsLeft = useMemo(() => {
    if (!session) return 0;
    if (chainNowSec === null) return 1;
    const currentSec = chainNowSec;
    return Math.max(
      0,
      Number(session.drawTimestamp) - currentSec,
    );
  }, [chainNowSec, session]);

  const isDone = useMemo(() => {
    if (!session) return true;
    if (chainNowSec === null) return false;
    return secondsLeft <= 0;
  }, [chainNowSec, secondsLeft, session]);

  const canChooseWinner = useMemo(() => {
    return Boolean(session && isDone && !session.winningNumberSet);
  }, [isDone, session]);

  const canCreateSession = useMemo(() => {
    if (!session) return true;
    return isDone && session.winningNumberSet;
  }, [isDone, session]);

  function getRandomWinningNumber(maxNumber: number): number {
  if (maxNumber <= 1) return 1;
  const randomBuffer = new Uint32Array(1);
  window.crypto.getRandomValues(randomBuffer);
  return (randomBuffer[0] % maxNumber) + 1;
}

  const chooseWinner = async () => {
    if (!session || !canChooseWinner) return;

    const winningNumber = getRandomWinningNumber(session.maxNumber);

    setIsSubmitting(true);
    setTxError(null);
    setTxSuccess(null);

    try {
      const latestBlock = await (rpcClient as unknown as BlockReader).getBlock();
      const currentSec = Number(latestBlock.timestamp);
      if (currentSec < Number(session.drawTimestamp)) {
        const remaining = Number(session.drawTimestamp) - currentSec;
        setTxError(
          `Too early on-chain. Try again in ${formatTimeLeft(remaining)}.`,
        );
        return;
      }

      await sendSetWinningNumberTx(
        session.sessionId,
        winningNumber,
        prividium,
        rpcClient,
      );
      setTxSuccess(`Winning number was set successfully: ${winningNumber}.`);
      await loadSession();
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Failed to set winning number.";
      setTxError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const createSession = async () => {
    if (!canCreateSession) return;

    const maxNumber = Number(maxNumberInput);
    const minutes = Number(minutesInput);

    if (!Number.isInteger(maxNumber) || maxNumber <= 0) {
      setTxError("Max number must be a positive whole number.");
      return;
    }

    if (!Number.isInteger(minutes) || minutes <= 0) {
      setTxError("Minutes must be a positive whole number.");
      return;
    }

    let payout: bigint;
    try {
      payout = parseEther(payoutInput);
    } catch {
      setTxError("Payout must be a valid ETH amount.");
      return;
    }

    if (payout <= 0n) {
      setTxError("Payout must be greater than 0.");
      return;
    }

    setIsSubmitting(true);
    setTxError(null);
    setTxSuccess(null);

    try {
      await sendCreateSessionTx(
        maxNumber,
        minutes,
        payout,
        prividium,
        rpcClient,
      );
      setTxSuccess("New session created successfully.");
      await loadSession();
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Failed to create session.";
      setTxError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Admin Panel</h1>
        <button
          type="button"
          onClick={() => void loadSession()}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        >
          Refresh
        </button>
      </div>

      {isLoading && (
        <p className="text-sm text-slate-600">Loading latest session...</p>
      )}

      {!isLoading && error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {!isLoading && !error && (
        <div className="space-y-6">
          {session ? (
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Session
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  #{session.sessionId.toString()}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Max Number
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {session.maxNumber}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Payout
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {Number(formatEther(session.payout)).toFixed(3)} ETH
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Status
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {!isDone
                    ? `Ends in ${formatTimeLeft(secondsLeft)}`
                    : session.winningNumberSet
                      ? "Complete"
                      : "Waiting for winner"}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">No sessions exist yet.</p>
          )}

          {!session || canCreateSession ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-sm font-semibold text-slate-900">
                Create New Session
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    Max Number
                  </span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={maxNumberInput}
                    onChange={(event) => setMaxNumberInput(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    Minutes Open
                  </span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={minutesInput}
                    onChange={(event) => setMinutesInput(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    Payout (ETH)
                  </span>
                  <input
                    type="text"
                    value={payoutInput}
                    onChange={(event) => setPayoutInput(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
                    placeholder="0.1"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => void createSession()}
                disabled={isSubmitting}
                className="cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSubmitting ? "Submitting..." : "Create session"}
              </button>
            </div>
          ) : null}

          {session && canChooseWinner ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-sm font-semibold text-slate-900">
                Choose Winner
              </h2>
              <p className="text-sm text-slate-600">
                This session is over. Click below to select a random winning
                number between 1 and {session.maxNumber}.
              </p>
              <button
                type="button"
                onClick={() => void chooseWinner()}
                disabled={isSubmitting}
                className="cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSubmitting ? "Submitting..." : "Pick random winner"}
              </button>
            </div>
          ) : null}

          {session && !isDone ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              Session is still open. Winner can be chosen in{" "}
              {formatTimeLeft(secondsLeft)}.
            </p>
          ) : null}

          {txSuccess && (
            <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {txSuccess}
            </p>
          )}

          {txError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {txError}
            </p>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              Previous Sessions
            </h2>
            {previousSessions.length === 0 ? (
              <p className="text-sm text-slate-600">No previous sessions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm text-slate-700">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2 font-medium">Session</th>
                      <th className="px-2 py-2 font-medium">Winning Number</th>
                      <th className="px-2 py-2 font-medium">Payout</th>
                      <th className="px-2 py-2 font-medium">Winning Address</th>
                      <th className="px-2 py-2 font-medium">Claimed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previousSessions.map((row) => (
                      <tr
                        key={row.sessionId.toString()}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="px-2 py-2">#{row.sessionId.toString()}</td>
                        <td className="px-2 py-2">
                          {row.winningNumberSet ? row.winningNumber : "—"}
                        </td>
                        <td className="px-2 py-2">
                          {Number(formatEther(row.payout)).toFixed(3)} ETH
                        </td>
                        <td className="px-2 py-2">
                          {row.winner ===
                          "0x0000000000000000000000000000000000000000"
                            ? "No winner"
                            : `${row.winner.slice(0, 8)}...${row.winner.slice(-8)}`}
                        </td>
                        <td className="px-2 py-2">
                          {row.winningNumberSet
                            ? row.payoutClaimed
                              ? "Yes"
                              : "No"
                            : "Pending"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
