import { type ChangeEvent, useState } from "react";
import {
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

interface Props {
  balance: bigint | null;
  rpcClient: PublicClient;
}

export function SendTab({ balance, rpcClient }: Props) {
  const [amount, setAmount] = useState<string>("0");
  const [recipient, setRecipient] = useState<string>();
  const [transferError, setTransferError] = useState<string>();
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string>();
  const [txHash, setTxHash] = useState<string>();
  const { savedPasskey, savedAccount } = loadExistingPasskey();
  const { prividium } = usePrividium();
  const btnsDisabled = savedPasskey && savedAccount && balance ? false : true;

  function handleAmountChange(e: ChangeEvent<HTMLInputElement>) {
    if(balance !== null){
    const newAmount = parseEther(e.target.value);
    if (newAmount > balance) {
      setAmount(formatEther(balance));
    } else {
      setAmount(e.target.value);
    }
    }

  }

  function handleMax() {
    if(balance !== null) setAmount(formatEther(balance));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSending(true);
    setIsSuccess(false);
    setTransferError(undefined);
    setError(undefined);
    setTxHash(undefined);

    try {
      if (!savedAccount || !savedPasskey)
        throw new Error("missing account or passkey");
      const parsedAmount = parseEther(amount);
      if (parsedAmount === BigInt(0) || !recipient) {
        setTransferError("inputError");
        return;
      }
      if (!isAddress(recipient)) {
        setTransferError("addressError");
        return;
      }

      const txData = [
        {
          to: recipient,
          value: parsedAmount,
          data: "0x" as Hex,
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
      // TODO: refetch balance?
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.log("Error sending transfer:", error);
      setTransferError("transferFailed");
      setError(
        error.message && typeof error.message === "string"
          ? error.message
          : "unknown error",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div
      id="send-tab"
      className="mx-auto max-w-4xl rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-xl shadow-slate-200/60 sm:p-8"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div id="send-money" className="text-2xl font-semibold tracking-tight text-slate-900">
          Send ETH on Prividium
        </div>
      </div>
      <div className="space-y-6">
        <form onSubmit={handleSubmit} id="transfer-form" className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="space-y-1">
            <label
              id="send-recipient"
              htmlFor="recipientAddress"
              className="text-xs uppercase tracking-wide text-slate-500"
            >
              Recipient Address
            </label>
            <input
              type="text"
              id="recipientAddress"
              placeholder="0x..."
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label
                id="send-amount"
                htmlFor="transferAmount"
                className="text-xs uppercase tracking-wide text-slate-500"
              >
                Amount (ETH)
              </label>
              <span
                onClick={btnsDisabled || isSending ? undefined : handleMax}
                role="button"
                tabIndex={btnsDisabled || isSending ? -1 : 0}
                className={[
                  "text-sm font-medium",
                  btnsDisabled || isSending
                    ? "cursor-not-allowed text-slate-400"
                    : "cursor-pointer text-slate-700 hover:text-slate-900",
                ].join(" ")}
              >
                Max
              </span>
            </div>
            <input
              type="number"
              id="transferAmount"
              min="0"
              step="any"
              placeholder="0.01"
              value={amount}
              onChange={handleAmountChange}
              disabled={btnsDisabled || isSending}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          <button
            id="transferBtn"
            disabled={btnsDisabled || isSending}
            type="submit"
            className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSending ? "Sending..." : "Send ETH"}
          </button>
        </form>

        {isSuccess && (
          <div id="transfer-success" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            <strong id="send-tx-sent">✓ Transaction Sent!</strong>
            <div className="mt-2 flex flex-wrap items-start gap-2">
              <span id="send-tx-label" className="font-medium">
                Transaction:
              </span>
              <span>
                <a
                  id="transfer-tx-link"
                  href={`${BLOCK_EXPLORER_URL}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-slate-700 underline hover:text-slate-900"
                >
                  <code id="txHashDisplay" className="text-xs">{txHash}</code>
                </a>
              </span>
            </div>
          </div>
        )}

        {transferError && (
          <div id="transfer-error" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            Transfer failed: {error}
          </div>
        )}
      </div>
    </div>
  );
}
