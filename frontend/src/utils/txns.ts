import { encodeFunctionData, type Abi } from "viem";
import GAME_ABI_JSON from "./NumberGuessingGame.json";
import type { PrividiumChain } from "prividium";
// import { sendWithPasskey } from "./sso/sendTxWithPasskey";

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
  console.log("DATA", data)
  // const hash = await sendWithPasskey(
  //   data,
  //   rpcClient,
  //   prividium.authorizeTransaction,
  //   value,
  // );
  // return hash;
}

export const sendPickNumberTx = async (
  sessionId: bigint,
  selectedNumber: number,
  prividium: PrividiumChain,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpcClient: any,
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
  rpcClient: any,
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
  rpcClient: any,
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
  rpcClient: any,
) => {
  return sendAuthorizedTx({
    functionName: "claimPayout",
    args: [sessionId],
    prividium,
    rpcClient,
  });
};
