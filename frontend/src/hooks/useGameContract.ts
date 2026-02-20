import {
  type Abi,
  type PublicClient,
  encodeFunctionData,
  getContract,
} from "viem";
import { loadExistingPasskey } from "../utils/sso/passkeys";
import { buildGasOptions, sendTxWithPasskey } from "../utils/sso/sendTxWithPasskey";
import GAME_ABI_JSON from "../utils/NumberGuessingGame.json";

const GAME_CONTRACT_ADDRESS = import.meta.env
  .VITE_GAME_CONTRACT_ADDRESS as `0x${string}`;

export function useGameContract(
  rpcClient: PublicClient,
  enableWalletToken?: (params: {
    walletAddress: `0x${string}`;
    contractAddress: `0x${string}`;
    nonce: number;
    calldata: `0x${string}`;
  }) => Promise<{ message: string; activeUntil: string }>,
) {
  const contract = getContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_ABI_JSON.abi as Abi,
    client: rpcClient,
  });


  const sendWithPasskey = async (data: `0x${string}`, value?: bigint) => {
    const { savedPasskey, savedAccount } = loadExistingPasskey();
    if (!savedPasskey || !savedAccount) {
      throw new Error("No SSO account found. Create and link a passkey first.");
    }

    const txData = [
      {
        to: GAME_CONTRACT_ADDRESS,
        value: value ?? 0n,
        data,
      },
    ];

    const gasOptions = buildGasOptions();
    return await sendTxWithPasskey(
      savedAccount,
      savedPasskey,
      txData,
      gasOptions,
      rpcClient,
      enableWalletToken,
    );
  };

  const createSession = async (
    maxNumber: number,
    minutes: number,
    payout: bigint,
  ) => {
    const data = encodeFunctionData({
      abi: GAME_ABI_JSON.abi as Abi,
      functionName: "createSession",
      args: [maxNumber, minutes],
    });
    return await sendWithPasskey(data, payout);
  };

  const pickNumber = async (sessionId: bigint, selectedNumber: number) => {
    const data = encodeFunctionData({
      abi: GAME_ABI_JSON.abi as Abi,
      functionName: "pickNumber",
      args: [sessionId, selectedNumber],
    });
    return await sendWithPasskey(data);
  };

  const setWinningNumber = async (sessionId: bigint, winningNumber: number) => {
    const data = encodeFunctionData({
      abi: GAME_ABI_JSON.abi as Abi,
      functionName: "setWinningNumber",
      args: [sessionId, winningNumber],
    });
    return await sendWithPasskey(data);
  };

  const claimPayout = async (sessionId: bigint) => {
    const data = encodeFunctionData({
      abi: GAME_ABI_JSON.abi as Abi,
      functionName: "claimPayout",
      args: [sessionId],
    });
    return await sendWithPasskey(data);
  };

  return {
    contract,
    createSession,
    pickNumber,
    setWinningNumber,
    claimPayout,
  };
}
