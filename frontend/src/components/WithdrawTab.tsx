import { type ChangeEvent, useState } from "react";
import { ETH_ADDRESS } from "@matterlabs/zksync-js/core";
import {
  encodeFunctionData,
  formatEther,
  isAddress,
  parseEther,
  type PublicClient,
} from "viem";
import {
  buildGasOptions,
  sendTxWithPasskey,
} from "../utils/sso/sendTxWithPasskey";
import { loadExistingPasskey } from "../utils/sso/passkeys";
import { usePrividium } from "../hooks/usePrividium";
import { BLOCK_EXPLORER_URL } from "../utils/sso/constants";
import { useBridgeSdk } from "../hooks/useBridgeSdk";

interface Props {
  balance: bigint | null;
  rpcClient: PublicClient;
}

function safeParseEther(value: string): bigint | null {
  if (!value || Number(value) <= 0) return null;
  try {
    return parseEther(value);
  } catch {
    return null;
  }
}

export function WithdrawTab({ balance, rpcClient }: Props) {
  const [amount, setAmount] = useState<string>("0");
  const [recipient, setRecipient] = useState<string>();
  const [withdrawError, setWithdrawError] = useState<string>();
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string>();
  const [txHash, setTxHash] = useState<string>();

  const { getZKsyncSDK } = useBridgeSdk(rpcClient);

  const { savedPasskey, savedAccount } = loadExistingPasskey();
  const { prividium } = usePrividium();
  const btnsDisabled = savedPasskey && savedAccount && balance ? false : true;

  function handleAmountChange(e: ChangeEvent<HTMLInputElement>) {
    if (balance === null) return;
    const parsedAmount = safeParseEther(e.target.value);
    if (!parsedAmount) {
      setAmount(e.target.value);
      return;
    }

    if (parsedAmount > balance) {
      setAmount(formatEther(balance));
    } else {
      setAmount(e.target.value);
    }
  }

  function handleMax() {
    if (balance !== null) setAmount(formatEther(balance));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsWithdrawing(true);
    setIsSuccess(false);
    setWithdrawError(undefined);
    setError(undefined);
    setTxHash(undefined);

    try {
      if (!savedAccount || !savedPasskey) {
        throw new Error("Missing account or passkey");
      }

      const parsedAmount = safeParseEther(amount);
      if (!parsedAmount) {
        setWithdrawError("amountError");
        return;
      }

      if (!recipient || !isAddress(recipient)) {
        setWithdrawError("addressError");
        return;
      }

      if (balance !== null && parsedAmount > balance) {
        setWithdrawError("balanceError");
        return;
      }

      const sdk = getZKsyncSDK();
      if (!sdk) {
        throw new Error("SDK not initialized");
      }

      const params = {
        token: ETH_ADDRESS,
        amount: parsedAmount,
        to: recipient,
      } as const;

      const plan = await sdk.withdrawals.prepare(params);

      const planTx = plan.steps[0].tx;

      const data = encodeFunctionData({
        abi: planTx.abi,
        functionName: planTx.functionName,
        args: planTx.args,
      });

      const txData = [
        {
          to: planTx.address,
          value: parsedAmount,
          data,
        },
      ];

      const gasOptions = buildGasOptions();

      const hash = await sendTxWithPasskey(
        savedAccount,
        savedPasskey,
        txData,
        gasOptions,
        rpcClient,
        prividium.authorizeTransaction,
      );

      setTxHash(hash);
      setIsSuccess(true);
    } catch (submitError) {
      console.log("Error submitting withdrawal:", submitError);
      setWithdrawError("withdrawFailed");
      setError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : "unknown error",
      );
    } finally {
      setIsWithdrawing(false);
    }
  }

  return (
    <div
      id="withdraw-tab"
      className="mx-auto max-w-4xl rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-xl shadow-slate-200/60 sm:p-8"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div
          id="withdraw-money"
          className="text-2xl font-semibold tracking-tight text-slate-900"
        >
          Withdraw ETH To L1
        </div>
      </div>

      <div className="space-y-6">
        <form
          onSubmit={handleSubmit}
          id="withdraw-form"
          className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
        >
          <div className="space-y-1">
            <label
              id="withdraw-recipient"
              htmlFor="withdrawRecipientAddress"
              className="text-xs uppercase tracking-wide text-slate-500"
            >
              L1 Recipient Address
            </label>
            <input
              type="text"
              id="withdrawRecipientAddress"
              placeholder="0x..."
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label
                id="withdraw-amount"
                htmlFor="withdrawAmount"
                className="text-xs uppercase tracking-wide text-slate-500"
              >
                Amount (ETH)
              </label>
              <span
                onClick={btnsDisabled || isWithdrawing ? undefined : handleMax}
                role="button"
                tabIndex={btnsDisabled || isWithdrawing ? -1 : 0}
                className={[
                  "text-sm font-medium",
                  btnsDisabled || isWithdrawing
                    ? "cursor-not-allowed text-slate-400"
                    : "cursor-pointer text-slate-700 hover:text-slate-900",
                ].join(" ")}
              >
                Max
              </span>
            </div>
            <input
              type="number"
              id="withdrawAmount"
              min="0"
              step="any"
              placeholder="0.01"
              value={amount}
              onChange={handleAmountChange}
              disabled={btnsDisabled || isWithdrawing}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          <button
            id="withdrawBtn"
            disabled={btnsDisabled || isWithdrawing}
            type="submit"
            className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isWithdrawing ? "Submitting..." : "Withdraw ETH"}
          </button>
        </form>

        {isSuccess && (
          <div
            id="withdraw-success"
            className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700"
          >
            <strong id="withdraw-tx-sent">✓ Withdrawal Submitted!</strong>
            <div className="mt-2 flex flex-wrap items-start gap-2">
              <span id="withdraw-tx-label" className="font-medium">
                L2 Transaction:
              </span>
              <span>
                <a
                  id="withdraw-tx-link"
                  href={`${BLOCK_EXPLORER_URL}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-slate-700 underline hover:text-slate-900"
                >
                  <code id="withdrawTxHashDisplay" className="text-xs">
                    {txHash}
                  </code>
                </a>
              </span>
            </div>
          </div>
        )}

        {withdrawError && (
          <div
            id="withdraw-error"
            className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            Withdrawal failed: {error}
          </div>
        )}
      </div>
    </div>
  );
}
