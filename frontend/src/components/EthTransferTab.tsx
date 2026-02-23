import { type ChangeEvent, useState } from "react";
import { ETH_ADDRESS } from "@matterlabs/zksync-js/core";
import {
  encodeFunctionData,
  formatEther,
  type Hex,
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

type Mode = "send" | "withdraw";

function safeParseEther(value: string): bigint | null {
  if (!value || Number(value) <= 0) return null;
  try {
    return parseEther(value);
  } catch {
    return null;
  }
}

export function EthTransferTab({ balance, rpcClient }: Props) {
  const [mode, setMode] = useState<Mode>("send");
  const [amount, setAmount] = useState<string>("0");
  const [recipient, setRecipient] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string>();
  const [txHash, setTxHash] = useState<string>();

  const { getZKsyncSDK } = useBridgeSdk(rpcClient);
  const { savedPasskey, savedAccount } = loadExistingPasskey();
  const { prividium } = usePrividium();

  const isDisabled = !savedPasskey || !savedAccount || balance === null;

  function handleAmountChange(e: ChangeEvent<HTMLInputElement>) {
    if (balance === null) return;
    const parsedAmount = safeParseEther(e.target.value);
    if (!parsedAmount) {
      setAmount(e.target.value);
      return;
    }

    if (parsedAmount > balance) {
      setAmount(formatEther(balance));
      return;
    }

    setAmount(e.target.value);
  }

  function handleMax() {
    if (balance !== null) setAmount(formatEther(balance));
  }

  function resetResultState() {
    setIsSuccess(false);
    setError(undefined);
    setTxHash(undefined);
  }

  async function submitSend(parsedAmount: bigint, recipientAddress: `0x${string}`) {
    const txData = [
      {
        to: recipientAddress,
        value: parsedAmount,
        data: "0x" as Hex,
      },
    ];

    const gasOptions = buildGasOptions();
    return sendTxWithPasskey(
      savedAccount!,
      savedPasskey!,
      txData,
      gasOptions,
      rpcClient,
      prividium.authorizeTransaction,
    );
  }

  async function submitWithdraw(
    parsedAmount: bigint,
    recipientAddress: `0x${string}`,
  ) {
    const sdk = getZKsyncSDK();
    if (!sdk) throw new Error("SDK not initialized");

    const plan = await sdk.withdrawals.prepare({
      token: ETH_ADDRESS,
      amount: parsedAmount,
      to: recipientAddress,
    } as const);

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
    return sendTxWithPasskey(
      savedAccount!,
      savedPasskey!,
      txData,
      gasOptions,
      rpcClient,
      prividium.authorizeTransaction,
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    resetResultState();

    try {
      if (!savedAccount || !savedPasskey) {
        throw new Error("Missing account or passkey");
      }

      const parsedAmount = safeParseEther(amount);
      if (!parsedAmount) {
        throw new Error("Enter a valid ETH amount greater than 0.");
      }

      if (!recipient || !isAddress(recipient)) {
        throw new Error("Enter a valid 0x recipient address.");
      }

      if (balance !== null && parsedAmount > balance) {
        throw new Error("Amount exceeds your available balance.");
      }

      const recipientAddress = recipient as `0x${string}`;
      const hash =
        mode === "send"
          ? await submitSend(parsedAmount, recipientAddress)
          : await submitWithdraw(parsedAmount, recipientAddress);

      setTxHash(hash);
      setIsSuccess(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error && submitError.message
          ? submitError.message
          : "Unknown error",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const title = mode === "send" ? "Send ETH on Prividium" : "Withdraw ETH To L1";
  const recipientLabel =
    mode === "send" ? "Recipient Address" : "L1 Recipient Address";
  const submitLabel = mode === "send" ? "Send ETH" : "Withdraw ETH";
  const submitPendingLabel = mode === "send" ? "Sending..." : "Submitting...";
  const successLabel =
    mode === "send" ? "✓ Transaction Sent!" : "✓ Withdrawal Submitted!";
  const successTxLabel = mode === "send" ? "Transaction:" : "L2 Transaction:";

  return (
    <div
      id="eth-transfer-tab"
      className="mx-auto max-w-4xl rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-xl shadow-slate-200/60 sm:p-8"
    >
      <div className="mb-6 space-y-3">
        <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1">
          <button
            type="button"
            onClick={() => {
              setMode("send");
              resetResultState();
            }}
            className={[
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              mode === "send"
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-100",
            ].join(" ")}
          >
            Send
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("withdraw");
              resetResultState();
            }}
            className={[
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              mode === "withdraw"
                ? "bg-slate-900 text-white"
                : "text-slate-700 hover:bg-slate-100",
            ].join(" ")}
          >
            Withdraw
          </button>
        </div>
        <div className="text-2xl font-semibold tracking-tight text-slate-900">
          {title}
        </div>
      </div>

      <div className="space-y-6">
        <form
          onSubmit={handleSubmit}
          id="eth-transfer-form"
          className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
        >
          <div className="space-y-1">
            <label
              htmlFor="ethRecipientAddress"
              className="text-xs uppercase tracking-wide text-slate-500"
            >
              {recipientLabel}
            </label>
            <input
              type="text"
              id="ethRecipientAddress"
              placeholder="0x..."
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="ethAmount"
                className="text-xs uppercase tracking-wide text-slate-500"
              >
                Amount (ETH)
              </label>
              <span
                onClick={isDisabled || isSubmitting ? undefined : handleMax}
                role="button"
                tabIndex={isDisabled || isSubmitting ? -1 : 0}
                className={[
                  "text-sm font-medium",
                  isDisabled || isSubmitting
                    ? "cursor-not-allowed text-slate-400"
                    : "cursor-pointer text-slate-700 hover:text-slate-900",
                ].join(" ")}
              >
                Max
              </span>
            </div>
            <input
              type="number"
              id="ethAmount"
              min="0"
              step="any"
              placeholder="0.01"
              value={amount}
              onChange={handleAmountChange}
              disabled={isDisabled || isSubmitting}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          <button
            id="ethSubmitBtn"
            disabled={isDisabled || isSubmitting}
            type="submit"
            className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSubmitting ? submitPendingLabel : submitLabel}
          </button>
        </form>

        {isSuccess && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <strong>{successLabel}</strong>
            <div className="mt-2 flex flex-wrap items-start gap-2">
              <span className="font-medium">{successTxLabel}</span>
              <span>
                <a
                  href={`${BLOCK_EXPLORER_URL}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-slate-700 underline hover:text-slate-900"
                >
                  <code className="text-xs">{txHash}</code>
                </a>
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {mode === "send" ? "Transfer failed:" : "Withdrawal failed:"} {error}
          </div>
        )}
      </div>
    </div>
  );
}
