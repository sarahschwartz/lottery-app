import { getContract, isAddress, type Address } from "viem";
import GAME_ABI_JSON from "../utils/NumberGuessingGame.json";
import { prividiumChain } from "../utils/wagmi";
import { createPrividiumClient } from "prividium";
import { useEffect, useMemo, useState } from "react";
import { usePrividium } from "../hooks/usePrividium";
import { AdminView } from "./AdminView";
import { PlayerView } from "./PlayerView";
import { PasskeyLogin } from "./PasskeyLogin";
import { Header } from "./Header";
import { useSsoAccount } from "../hooks/useSSOAccount";
import { handleResetPasskey } from "../utils/sso/passkeys";

const GAME_CONTRACT_ADDRESS = import.meta.env
  .VITE_GAME_CONTRACT_ADDRESS as `0x${string}`;

export function LoggedInView() {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [chainNowSec, setChainNowSec] = useState<number | null>(null);
  const [completedAccountAddress, setCompletedAccountAddress] =
    useState<Address | null>(null);
  const { account } = useSsoAccount();

  const address = completedAccountAddress || account || undefined;

  const { prividium, isAuthenticated } = usePrividium();

  const rpcClient = useMemo(() => {
    if (isAuthenticated && address) {
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
      if (!isAuthenticated || !gameContract) {
        console.log("not authenticated or no contract");
        return;
      }
      if (!address || !isAddress(address)) {
        console.log("missing wallet address");
        return;
      }
      const admin = (await gameContract.read.admins([address]));
      if (admin === true) setIsAdmin(true);
    }

    getContractAdmin();
  }, [address, gameContract, isAuthenticated]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      {isAuthenticated && (
        <>
          {address && gameContract && rpcClient ? (
            <>
            <button onClick={handleResetPasskey}>Log Out</button>
            <div>Your Address: {address}</div>
            <div>Your Balance: (todo)</div>
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
          ) : (
            <>
              <Header isAuthenticated={true} />
              <PasskeyLogin
                setCompletedAccountAddress={setCompletedAccountAddress}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
