import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, parseEther, type Client, type PublicClient } from "viem";
import {
  formatTimeLeft,
  getPreviousSessions,
  getRandomWinningNumber,
  getSessionInfo,
} from "../utils/game";
import type {
  BlockReader,
  PreviousSessionRow,
  SessionResult,
  SessionState,
} from "../utils/types";
import { usePrividium } from "../hooks/usePrividium";
import { useGameContract } from "../hooks/useGameContract";
import { Check } from "lucide-react";

const DEFAULT_SESSION_PAYOUT_ETH = "0.1";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gameContract: any;
  rpcClient: Client;
  chainNowSec: number | null;
  accountBalance: bigint | null;
}

export function AdminView({
  gameContract,
  rpcClient,
  chainNowSec,
  accountBalance,
}: Props) {
  const { prividium } = usePrividium();

  const [session, setSession] = useState<SessionState | null>(null);
  const [previousSessions, setPreviousSessions] = useState<
    PreviousSessionRow[]
  >([]);
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

  const { createSession, setWinningNumber } = useGameContract(rpcClient as PublicClient, prividium.authorizeTransaction);

  const loadSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const {
        nextSessionId,
        createdPayoutBySessionId,
        claimedPayoutBySessionId,
      } = await getSessionInfo(gameContract);

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
        winningNumber: Number(rawSession[1]),
        drawTimestamp: rawSession[2],
        payout: rawSession[3],
        winner: rawSession[5],
        winningNumberSet: rawSession[6],
        payoutClaimed: rawSession[7],
      });

      const previous = await getPreviousSessions(
        latestSessionId,
        gameContract,
        createdPayoutBySessionId,
        claimedPayoutBySessionId,
      );
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
    return Math.max(0, Number(session.drawTimestamp) - currentSec);
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

  const activeSession = useMemo(() => {
    if (!session) return null;
    return isDone ? null : session;
  }, [isDone, session]);

  const displayedPreviousSessions = useMemo(() => {
    if (!session || !isDone) return previousSessions;

    const latestClosedRow: PreviousSessionRow = {
      sessionId: session.sessionId,
      winningNumber: session.winningNumber,
      payout: session.payout,
      winner: session.winner,
      winningNumberSet: session.winningNumberSet,
      payoutClaimed: session.payoutClaimed,
    };

    return [
      latestClosedRow,
      ...previousSessions.filter((row) => row.sessionId !== session.sessionId),
    ];
  }, [isDone, previousSessions, session]);

  const parsedPayout = useMemo(() => {
    try {
      return parseEther(payoutInput);
    } catch {
      return null;
    }
  }, [payoutInput]);

  const payoutExceedsBalance = useMemo(() => {
    if (parsedPayout === null || accountBalance === null) return false;
    return parsedPayout > accountBalance;
  }, [accountBalance, parsedPayout]);

  const chooseWinner = async () => {
    if (!session || !canChooseWinner) return;

    const winningNumber = getRandomWinningNumber(session.maxNumber);

    setIsSubmitting(true);
    setTxError(null);
    setTxSuccess(null);

    try {
      const latestBlock = await (
        rpcClient as unknown as BlockReader
      ).getBlock();
      const currentSec = Number(latestBlock.timestamp);
      if (currentSec < Number(session.drawTimestamp)) {
        const remaining = Number(session.drawTimestamp) - currentSec;
        setTxError(
          `Too early on-chain. Try again in ${formatTimeLeft(remaining)}.`,
        );
        return;
      }

      await setWinningNumber(session.sessionId, winningNumber)
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

  const createNewSession = async () => {
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

    if (parsedPayout === null) {
      setTxError("Payout must be a valid ETH amount.");
      return;
    }

    const payout = parsedPayout;
    if (payout <= 0n) {
      setTxError("Payout must be greater than 0.");
      return;
    }
    if (accountBalance !== null && payout > accountBalance) {
      setTxError("Payout exceeds your available balance.");
      return;
    }

    setIsSubmitting(true);
    setTxError(null);
    setTxSuccess(null);

    try {
      await createSession(maxNumber, minutes, payout);
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

  const isCreateDisabled =
    isSubmitting ||
    parsedPayout === null ||
    parsedPayout <= 0n ||
    payoutExceedsBalance;

  return (
    <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-xl shadow-slate-200/60 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Admin Panel
        </h1>
        <button
          type="button"
          onClick={() => void loadSession()}
          className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
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
          {activeSession ? (
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Session
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  #{activeSession.sessionId.toString()}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Max Number
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {activeSession.maxNumber}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Payout
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {Number(formatEther(activeSession.payout)).toFixed(3)} ETH
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Status
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {!isDone
                    ? `Ends in ${formatTimeLeft(secondsLeft)}`
                    : activeSession.winningNumberSet
                      ? "Complete"
                      : "Waiting for winner"}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">No open session right now.</p>
          )}

          {!session || canCreateSession ? (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
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
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
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
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
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
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 ${
                      payoutExceedsBalance
                        ? "border-rose-300 bg-rose-50"
                        : "border-slate-300"
                    }`}
                    placeholder="0.1"
                  />
                  <p className="text-xs text-slate-500">
                    Available:{" "}
                    {accountBalance === null
                      ? "Loading..."
                      : `${Number(formatEther(accountBalance)).toFixed(4)} ETH`}
                  </p>
                  {payoutExceedsBalance && (
                    <p className="text-xs text-rose-600">
                      Payout exceeds your available balance.
                    </p>
                  )}
                </label>
              </div>
              <button
                type="button"
                onClick={createNewSession}
                disabled={isCreateDisabled}
                className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSubmitting ? "Submitting..." : "Create session"}
              </button>
            </div>
          ) : null}

          {session && canChooseWinner ? (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
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
                className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
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
            {displayedPreviousSessions.length === 0 ? (
              <p className="text-sm text-slate-600">
                No previous sessions yet.
              </p>
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
                    {displayedPreviousSessions.map((row) => (
                      <tr
                        key={row.sessionId.toString()}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="px-2 py-2">
                          #{row.sessionId.toString()}
                        </td>
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
                            ? row.winner ===
                              "0x0000000000000000000000000000000000000000"
                              ? "-"
                              : row.payoutClaimed
                                ? <Check className="w-4 h-4 text-green-500" />
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
