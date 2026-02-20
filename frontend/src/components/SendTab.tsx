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
  const { enableWalletToken } = usePrividium();
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
        enableWalletToken,
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
    <div className="tab-content" id="send-tab">
      <div className="tab-header">
        {/* <BackButton setActiveTab={setActiveTab} /> */}
        <div id="send-money" className="tab-title">
          Send Money
        </div>
      </div>
      <div className="card">
        <form onSubmit={handleSubmit} id="transfer-form">
          <div className="form-group">
            <label id="send-recipient" htmlFor="recipientAddress">
              Recipient Address
            </label>
            <input
              type="text"
              id="recipientAddress"
              placeholder="0x..."
              onChange={(e) => setRecipient(e.target.value)}
            />
          </div>

          <div className="form-group">
            <div className="label-row">
              <label id="send-amount" htmlFor="transferAmount">
                Amount (ETH)
              </label>
              <span
                className="max-link"
                onClick={btnsDisabled || isSending ? undefined : handleMax}
                role="button"
                tabIndex={btnsDisabled || isSending ? -1 : 0}
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
            />
          </div>

          <button
            id="transferBtn"
            disabled={btnsDisabled || isSending}
            type="submit"
          >
            {isSending ? "Sending..." : "Send ETH"}
          </button>
        </form>

        {isSuccess && (
          <div id="transfer-success" className="alert alert-success">
            <strong id="send-tx-sent">✓ Transaction Sent!</strong>
            <div className="info-row">
              <span id="send-tx-label" className="info-label">
                Transaction:
              </span>
              <span className="info-value">
                <a
                  id="transfer-tx-link"
                  href={`https://zksync-os-testnet-alpha.staging-scan-v2.zksync.dev/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <code id="txHashDisplay">{txHash}</code>
                </a>
              </span>
            </div>
          </div>
        )}

        {transferError && (
          <div id="transfer-error" className="alert alert-error">
            Transfer failed: {error}
          </div>
        )}
      </div>
    </div>
  );
}
