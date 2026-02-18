import { useCallback, useEffect, useMemo, useState } from "react";
import { formatEther, type Client } from "viem";
import { useConnection } from "wagmi";
import { usePrividium } from "../utils/usePrividium";
import { formatTimeLeft } from "../utils/game";
import type { SessionResult, SessionState } from "../utils/types";
import { sendClaimPayoutTx, sendPickNumberTx } from "../utils/txns";

const GAME_CONTRACT_ADDRESS = import.meta.env
  .VITE_GAME_CONTRACT_ADDRESS as `0x${string}`;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gameContract: any;
  rpcClient: Client;
  chainNowSec: number | null;
}

export function PlayerView({ gameContract, rpcClient, chainNowSec }: Props) {
  const { address } = useConnection();
  const { prividium } = usePrividium();

  const [session, setSession] = useState<SessionState | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [takenNumbers, setTakenNumbers] = useState<Set<number>>(new Set());
  const [myPickedNumber, setMyPickedNumber] = useState<number | null>(null);
  const [claimSession, setClaimSession] = useState<SessionState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pickedSuccess, setPickedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const loadSession = useCallback(async () => {
    if (!GAME_CONTRACT_ADDRESS || !gameContract) {
      setError("Game contract is not configured.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nextSessionId = (await gameContract.read.nextSessionId()) as bigint;

      if (nextSessionId === 0n) {
        setSession(null);
        setClaimSession(null);
        setTakenNumbers(new Set());
        setMyPickedNumber(null);
        setSelectedNumber(null);
        setIsLoading(false);
        return;
      }

      const latestSessionId = nextSessionId - 1n;
      const rawSession = (await gameContract.read.sessions([
        latestSessionId,
      ])) as SessionResult;
      const maxNumber = Number(rawSession[0]);
      const drawTimestamp = rawSession[2];
      const payout = rawSession[3];
      const winningNumberSet = rawSession[5];

      setSession({
        sessionId: latestSessionId,
        maxNumber,
        drawTimestamp,
        payout,
        winner: rawSession[4],
        winningNumberSet,
        payoutClaimed: rawSession[6],
      });

      const bitmap = (await gameContract.read.getTakenBitmap([
        latestSessionId,
      ])) as bigint[];

      const nextTaken = new Set<number>();

      for (let n = 1; n <= maxNumber; n += 1) {
        const zeroBased = n - 1;
        const wordIndex = Math.floor(zeroBased / 256);
        const bitIndex = BigInt(zeroBased % 256);

        const word = bitmap[wordIndex] ?? 0n;
        const isTaken = (word & (1n << bitIndex)) !== 0n;

        if (isTaken) nextTaken.add(n);
      }

      setTakenNumbers(nextTaken);

      if (address) {
        let unclaimedWinningSession: SessionState | null = null;
        for (let sid = latestSessionId; sid >= 0n; sid -= 1n) {
          const raw = (await gameContract.read.sessions([sid])) as SessionResult;
          const winner = raw[4];
          const winningNumberSetForSid = raw[5];
          const payoutClaimedForSid = raw[6];
          const isWinningSession =
            winningNumberSetForSid &&
            !payoutClaimedForSid &&
            winner.toLowerCase() !== ZERO_ADDRESS &&
            winner.toLowerCase() === address.toLowerCase();

          if (isWinningSession) {
            unclaimedWinningSession = {
              sessionId: sid,
              maxNumber: Number(raw[0]),
              drawTimestamp: raw[2],
              payout: raw[3],
              winner,
              winningNumberSet: winningNumberSetForSid,
              payoutClaimed: payoutClaimedForSid,
            };
            break;
          }

          if (sid === 0n) break;
        }
        setClaimSession(unclaimedWinningSession);

        const hasPicked = (await gameContract.read.hasPicked([
          latestSessionId,
          address,
        ])) as boolean;
        if (hasPicked) {
          const picked = (await gameContract.read.getPickedNumber([
            latestSessionId,
            address,
          ])) as number;
          setMyPickedNumber(picked);
          setSelectedNumber(picked);
        } else {
          setMyPickedNumber(null);
          setSelectedNumber(null);
        }
      } else {
        setClaimSession(null);
        setMyPickedNumber(null);
        setSelectedNumber(null);
      }
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load game session.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [address, gameContract]);

  useEffect(() => {
    loadSession();
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

  const isSessionClosed = useMemo(() => {
    if (!session) return true;
    return session.winningNumberSet || secondsLeft <= 0;
  }, [secondsLeft, session]);

  const availableNumbers = useMemo(() => {
    if (!session) return [];
    return Array.from({ length: session.maxNumber }, (_, i) => i + 1);
  }, [session]);

  const isWinner = useMemo(() => {
    if (!session || !address || !session.winningNumberSet) return false;
    return (
      session.winner.toLowerCase() !== ZERO_ADDRESS &&
      session.winner.toLowerCase() === address.toLowerCase()
    );
  }, [address, session]);

  const showNotWinnerMessage = useMemo(() => {
    if (!session) return false;
    return session.winningNumberSet && !isWinner;
  }, [isWinner, session]);

  const canClaimReward = useMemo(() => {
    return Boolean(claimSession && claimSession.winningNumberSet && !claimSession.payoutClaimed);
  }, [claimSession]);

  const showClaimRewardFirst = useMemo(() => {
    if (!session || !claimSession) return false;
    return claimSession.sessionId !== session.sessionId;
  }, [claimSession, session]);

  const pickNumber = async () => {
    if (!session || !selectedNumber || !gameContract || !rpcClient) return;

    setIsSubmitting(true);
    setTxError(null);
    try {
      console.log("going to pick: ", selectedNumber);
      await sendPickNumberTx(
        session.sessionId,
        selectedNumber,
        prividium,
        rpcClient,
      );

      setTimeout(async () => {
        await loadSession();
        setPickedSuccess(false);
      }, 1000);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Failed to submit pick.";
      setTxError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const claimReward = async () => {
    if (!claimSession || !canClaimReward) return;

    setIsSubmitting(true);
    setTxError(null);
    try {
      await sendClaimPayoutTx(claimSession.sessionId, prividium, rpcClient);
      await loadSession();
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Failed to claim payout.";
      setTxError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const winnerCongrats = (sessionId: string) => `🎉 Congrats! You are the winner of session ${sessionId}!`

  return (
    <>
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            Number Guessing Game
          </h1>
          <button
            type="button"
            onClick={() => void loadSession()}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Refresh
          </button>
        </div>
        {isLoading && (
          <p className="text-sm text-slate-600">Loading current session...</p>
        )}

        {!isLoading && error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        {!isLoading && !error && !session && (
          <p className="text-sm text-slate-600">
            No game session is available right now.
          </p>
        )}

        {!isLoading && !error && session && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
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
                  Prize Pool
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {Number(formatEther(session.payout)).toFixed(3)} ETH
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Time Left
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {isSessionClosed
                    ? "Session closed"
                    : formatTimeLeft(secondsLeft)}
                </p>
              </div>
            </div>

            {showClaimRewardFirst ? (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm text-emerald-700">
                  {winnerCongrats(session.sessionId.toString())}
                </p>
                <p className="text-sm text-emerald-700">
                  Claim your reward before playing again.
                </p>
                {canClaimReward && (
                  <button
                    type="button"
                    onClick={() => void claimReward()}
                    disabled={isSubmitting}
                    className="cursor-pointer rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  >
                    {isSubmitting ? "Submitting..." : "Claim reward"}
                  </button>
                )}
              </div>
            ) : isWinner ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {winnerCongrats(session.sessionId.toString())}
              </p>
            ) : (
              <>
                {myPickedNumber ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    Your pick for this session: <strong>{myPickedNumber}</strong>
                  </p>
                ) : (
                  <p className="text-sm text-slate-600">
                    Choose one available number between 1 and {session.maxNumber}.
                  </p>
                )}

                <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10">
                  {availableNumbers.map((num) => {
                    const isTaken = takenNumbers.has(num);
                    const isChosen = selectedNumber === num;
                    const isDisabled =
                      isSessionClosed || isTaken || Boolean(myPickedNumber);

                    return (
                      <button
                        key={num}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setSelectedNumber(num)}
                        className={[
                          "rounded-lg border px-2 py-2 text-sm font-medium transition",
                          isTaken
                            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                            : isChosen
                              ? "cursor-pointer border-slate-800 bg-slate-800 text-white"
                              : "cursor-pointer border-slate-300 bg-white text-slate-700 hover:border-slate-500 hover:bg-slate-50",
                          isDisabled && !isTaken
                            ? "cursor-not-allowed opacity-60"
                            : "",
                        ].join(" ")}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>

                {!myPickedNumber && !isSessionClosed && (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={!selectedNumber || isSubmitting}
                      onClick={() => void pickNumber()}
                      className="cursor-pointer rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {isSubmitting ? "Submitting..." : "Submit pick"}
                    </button>
                    {selectedNumber && (
                      <p className="text-sm text-slate-600">
                        Selected number: {selectedNumber}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {!showClaimRewardFirst && canClaimReward && (
              <div className="w-full">
                <button
                  type="button"
                  onClick={() => void claimReward()}
                  disabled={isSubmitting}
                  className="cursor-pointer rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
                >
                  {isSubmitting ? "Submitting..." : "Claim reward"}
                </button>
              </div>
            )}

            {showNotWinnerMessage && (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Better luck next time.
              </p>
            )}

            {pickedSuccess && (
              <p className="rounded-lg border border-green-200 bg-greeen-50 p-3 text-sm text-green-700">
                {selectedNumber} picked!
              </p>
            )}

            {txError && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {txError}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
