import {
  createWalletClient,
  custom,
  encodeFunctionData,
  type Abi,
} from "viem";
import GAME_ABI_JSON from "./NumberGuessingGame.json";
import type { PrividiumChain } from "prividium";

const GAME_CONTRACT_ADDRESS = import.meta.env
  .VITE_GAME_CONTRACT_ADDRESS as `0x${string}`;

async function sendAuthorizedTx({
  functionName,
  args,
  prividium,
  rpcClient,
  value,
}: {
  functionName:
    | "pickNumber"
    | "createSession"
    | "setWinningNumber"
    | "claimPayout";
  args: readonly unknown[];
  prividium: PrividiumChain;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpcClient: any;
  value?: bigint;
}) {
  const data = encodeFunctionData({
    abi: GAME_ABI_JSON.abi as Abi,
    functionName,
    args,
  });

  const walletClient = createWalletClient({
    chain: prividium.chain,
    transport: custom(window.ethereum!),
  });

  const [address] = await walletClient.getAddresses();

  const nonce = await rpcClient.getTransactionCount({ address });
  const gas = await rpcClient.estimateGas({
    account: address,
    to: GAME_CONTRACT_ADDRESS,
    data,
    value,
  });
  const gasPrice = await rpcClient.getGasPrice();

  const request = await walletClient.prepareTransactionRequest({
    account: address,
    to: GAME_CONTRACT_ADDRESS,
    data,
    nonce,
    gas,
    gasPrice,
    value,
  });

  await prividium.authorizeTransaction({
    walletAddress: address,
    toAddress: GAME_CONTRACT_ADDRESS,
    nonce: request.nonce,
    calldata: request.data,
    value: request.value ?? 0n,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hash = await walletClient.sendTransaction(request as any);
  await rpcClient.waitForTransactionReceipt({ hash });

  return hash;
}

export const sendPickNumberTx = async (
  sessionId: bigint,
  selectedNumber: number,
  prividium: PrividiumChain,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpcClient: any
) => {
  return sendAuthorizedTx({
    functionName: "pickNumber",
    args: [sessionId, selectedNumber],
    prividium,
    rpcClient,
  });
};

export const sendCreateSessionTx = async (
  maxNumber: number,
  minutes: number,
  payout: bigint,
  prividium: PrividiumChain,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpcClient: any
) => {
  return sendAuthorizedTx({
    functionName: "createSession",
    args: [maxNumber, minutes],
    value: payout,
    prividium,
    rpcClient,
  });
};

export const sendSetWinningNumberTx = async (
  sessionId: bigint,
  winningNumber: number,
  prividium: PrividiumChain,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpcClient: any
) => {
  return sendAuthorizedTx({
    functionName: "setWinningNumber",
    args: [sessionId, winningNumber],
    prividium,
    rpcClient,
  });
};

export const sendClaimPayoutTx = async (
  sessionId: bigint,
  prividium: PrividiumChain,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpcClient: any
) => {
  return sendAuthorizedTx({
    functionName: "claimPayout",
    args: [sessionId],
    prividium,
    rpcClient,
  });
};
