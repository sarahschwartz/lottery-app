import { getContract, isAddress } from "viem";
import GAME_ABI_JSON from "../utils/NumberGuessingGame.json";
import { prividiumChain } from "../utils/wagmi";
import { createPrividiumClient } from "prividium";
import { useEffect, useMemo, useState } from "react";
import { usePrividium } from "../utils/usePrividium";
import { useConnection } from "wagmi";
import { AdminView } from "./AdminView";
import { PlayerView } from "./PlayerView";

const GAME_CONTRACT_ADDRESS = import.meta.env
  .VITE_GAME_CONTRACT_ADDRESS as `0x${string}`;

export function LoggedInView() {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [chainNowSec, setChainNowSec] = useState<number | null>(null);
  const { prividium, isAuthenticated } = usePrividium();
  const { address } = useConnection();

  const rpcClient = useMemo(() => {
    if (isAuthenticated) {
      return createPrividiumClient({
        chain: prividiumChain,
        transport: prividium.transport,
        account: address,
      });
    }
  }, [address, prividium.transport, isAuthenticated]);

  const gameContract = useMemo(() => {
    if (rpcClient) {
      return getContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_ABI_JSON.abi,
        client: rpcClient,
      });
    }
  }, [rpcClient]);

  useEffect(() => {
    let isMounted = true;

    const syncChainTime = async () => {
      try {
        const block = await rpcClient!.getBlock();
        if (isMounted) {
          setChainNowSec(Number(block.timestamp));
        }
      } catch (err) {
        console.error("Failed to sync chain time:", err);
      }
    };

    if (rpcClient) syncChainTime();
    const interval = setInterval(() => {
      if (rpcClient) syncChainTime();
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [rpcClient]);

  useEffect(() => {
    async function getContractAdmin() {
      if(!isAuthenticated || !gameContract){
        console.log("not authenticated or no contract");
        return;
      }
      if (!address || !isAddress(address)) {
        console.log("missing wallet address");
        return;
      }
      const admin = (await gameContract.read.admin()) as string;
      if (!admin || !isAddress(admin)) {
        console.log("error getting contract admin");
        return;
      }
      if (admin.toLowerCase() === address?.toLowerCase()) setIsAdmin(true);
    }

    getContractAdmin();
  }, [address, gameContract, isAuthenticated]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      {isAuthenticated && gameContract && rpcClient && (
        <>
          {isAdmin ? (
            <AdminView
              gameContract={gameContract}
              rpcClient={rpcClient}
              chainNowSec={chainNowSec}
            />
          ) : (
            <PlayerView
              gameContract={gameContract}
              rpcClient={rpcClient}
              chainNowSec={chainNowSec}
            />
          )}
        </>
      )}
    </div>
  );
}
