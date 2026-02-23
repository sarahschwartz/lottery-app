import { type ChangeEvent, useState } from "react";
import { createViemClient, createWithdrawalsResource } from "@matterlabs/zksync-js/viem";
import {
  ETH_ADDRESS,
  L2_ASSET_ROUTER_ADDRESS,
  L2_BASE_TOKEN_ADDRESS,
  L2_NATIVE_TOKEN_VAULT_ADDRESS,
} from "@matterlabs/zksync-js/core";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  formatEther,
  http,
  isAddress,
  parseEther,
  type Address,
  type Hex,
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

      const l1RpcUrl = import.meta.env.VITE_L1_RPC_URL as string | undefined;
      if (!l1RpcUrl) {
        throw new Error("Missing VITE_L1_RPC_URL");
      }

      const l1ChainIdRaw = import.meta.env.VITE_L1_CHAIN_ID as
        | string
        | undefined;
      if (!l1ChainIdRaw) {
        throw new Error("Missing VITE_L1_CHAIN_ID in frontend env");
      }

      const l1ChainId = Number(l1ChainIdRaw);
      if (!Number.isFinite(l1ChainId)) {
        throw new Error(`Invalid VITE_L1_CHAIN_ID: ${l1ChainIdRaw}`);
      }

      const l1Chain = defineChain({
        id: l1ChainId,
        name:
          (import.meta.env.VITE_L1_CHAIN_NAME as string | undefined) ??
          `L1-${l1ChainId}`,
        nativeCurrency: {
          name: "Ether",
          symbol: "ETH",
          decimals: 18,
        },
        rpcUrls: {
          default: { http: [l1RpcUrl] },
          public: { http: [l1RpcUrl] },
        },
      });

      const l1Client = createPublicClient({
        chain: l1Chain,
        transport: http(l1RpcUrl),
      });
      // Use the authenticated Prividium client from app state for L2 reads.
      // Creating a fresh http client here can miss auth/session context.
      const l2Client = rpcClient;
      const l1Wallet = createWalletClient({
        chain: l1Chain,
        account: savedAccount,
        transport: http(l1RpcUrl),
      });

      const zkClient = createViemClient({
        l1: l1Client,
        l2: l2Client,
        l1Wallet,
      });

      // Debug guard: if bridgehub resolves from L2 but has no code on configured L1 RPC,
      // the app is connected to mismatched networks (common with local stacks).
      const bridgehubAddress = await zkClient.zks.getBridgehubAddress();
      const bridgehubCode = await l1Client.getCode({
        address: bridgehubAddress as Address,
      });
      if (!bridgehubCode || bridgehubCode === "0x") {
        throw new Error(
          `Bridgehub ${bridgehubAddress} not deployed on configured L1 RPC (${l1RpcUrl}). Check VITE_L1_RPC_URL/VITE_L1_CHAIN_ID.`,
        );
      }
      const resolvedAddresses = await zkClient.ensureAddresses();
      const zeroAssetId =
        "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

      // ETH-only token resolver override:
      // avoids SDK token metadata RPC calls like originChainId(assetId),
      // which may be blocked by Prividium RPC policy.
      const customTokens = {
        resolve: async () => ({
          kind: "eth" as const,
          l1: ETH_ADDRESS,
          l2: ETH_ADDRESS,
          assetId: zeroAssetId,
          originChainId: 0n,
          isChainEthBased: true,
          baseTokenAssetId: zeroAssetId,
          wethL1: L2_BASE_TOKEN_ADDRESS,
          wethL2: L2_BASE_TOKEN_ADDRESS,
        }),
        l1TokenFromAssetId: async () => ETH_ADDRESS,
      };
      const customContracts = {
        addresses: async () => ({
          ...resolvedAddresses,
          l2AssetRouter: L2_ASSET_ROUTER_ADDRESS,
          l2NativeTokenVault: L2_NATIVE_TOKEN_VAULT_ADDRESS,
          l2BaseTokenSystem: L2_BASE_TOKEN_ADDRESS,
        }),
      };

      const withdrawals = createWithdrawalsResource(
        zkClient,
        customTokens as never,
        customContracts as never,
      );
      const gasOptions = buildGasOptions();
      const withdrawPlan = await withdrawals.prepare({
        token: ETH_ADDRESS,
        amount: parsedAmount,
        to: recipient as Address,
        // Avoid protected eth_estimateGas call on Prividium RPC by supplying explicit gas.
        l2TxOverrides: {
          gasLimit: gasOptions.callGasLimit,
          maxFeePerGas: gasOptions.maxFeePerGas,
          maxPriorityFeePerGas: gasOptions.maxPriorityFeePerGas,
        },
      });

      const withdrawStep =
        withdrawPlan.steps.find((step) => step.kind.includes("withdraw")) ??
        withdrawPlan.steps.at(-1);
      if (!withdrawStep) throw new Error("Failed to build withdraw step");

      const txRequest = withdrawStep.tx;
      const calldata = encodeFunctionData({
        abi: txRequest.abi,
        functionName: txRequest.functionName,
        args: txRequest.args,
      });

      const txData = [
        {
          to: txRequest.address as Address,
          value: txRequest.value ?? parsedAmount,
          data: calldata as Hex,
        },
      ];

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
