import { type Abi, type PublicClient, encodeFunctionData, getContract, pad, toHex } from 'viem';
import { loadExistingPasskey } from '../utils/sso/passkeys';
import { sendTxWithPasskey } from '../utils/sso/sendTxWithPasskey';
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
  }) => Promise<{ message: string; activeUntil: string }>
) {
  const contract = getContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_ABI_JSON.abi as Abi,
    client: rpcClient
  });

  // Internal helper for defensive checks (matching React)
  const buildGasOptions = () => {
    const callGasLimit = 500000n;
    const verificationGasLimit = 2000000n;
    const maxFeePerGas = 10000000000n;
    const maxPriorityFeePerGas = 5000000000n;
    const preVerificationGas = 200000n;

    const accountGasLimits = pad(toHex((verificationGasLimit << 128n) | callGasLimit), {
      size: 32
    });
    const gasFees = pad(toHex((maxPriorityFeePerGas << 128n) | maxFeePerGas), { size: 32 });

    return {
      gasFees,
      accountGasLimits,
      callGasLimit,
      verificationGasLimit,
      preVerificationGas,
      maxFeePerGas,
      maxPriorityFeePerGas
    };
  };

  const sendWithPasskey = async (data: `0x${string}`, value?: bigint) => {
    const { savedPasskey, savedAccount } = loadExistingPasskey();
    if (!savedPasskey || !savedAccount) {
      throw new Error('No SSO account found. Create and link a passkey first.');
    }

    const txData = [
      {
        to: GAME_CONTRACT_ADDRESS,
        value: value ?? 0n,
        data
      }
    ];

    const gasOptions = buildGasOptions();
    return await sendTxWithPasskey(
      savedAccount,
      savedPasskey,
      txData,
      gasOptions,
      rpcClient,
      enableWalletToken
    );
  };
    // | "pickNumber"
    // | "createSession"
    // | "setWinningNumber"
    // | "claimPayout";

  // Write functions
  const createSession = async (maxNumber: number, minutes: number) => {
    const data = encodeFunctionData({
      abi: GAME_ABI_JSON.abi as Abi,
      functionName: 'createSession',
      args: [maxNumber, minutes]
    });
    return await sendWithPasskey(data);
  };

  const pickNumber = async (sessionId: bigint, selectedNumber: number) => {
    const data = encodeFunctionData({
      abi: GAME_ABI_JSON.abi as Abi,
      functionName: 'pickNumber',
      args: [sessionId, selectedNumber]
    });
    return await sendWithPasskey(data);
  };

  return {
    contract,
    createSession,
    pickNumber
  };
}
