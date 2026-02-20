import { getContract, isAddress, type Address, type PublicClient } from "viem";
import GAME_ABI_JSON from "../utils/NumberGuessingGame.json";
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { usePrividium } from "../hooks/usePrividium";
import { AdminView } from "./AdminView";
import { PlayerView } from "./PlayerView";
import { PasskeyLogin } from "./PasskeyLogin";
import { Header } from "./Header";
import { SendTab } from "./SendTab";
import type { Tab } from "../utils/types";

const GAME_CONTRACT_ADDRESS = import.meta.env
  .VITE_GAME_CONTRACT_ADDRESS as `0x${string}`;

interface Props {
  setCompletedAccountAddress: Dispatch<SetStateAction<Address | null>>;
  address: Address | undefined;
  rpcClient: PublicClient;
  accountBalance: bigint | null;
  tab: Tab;
}

export function LoggedInView({
  setCompletedAccountAddress,
  address,
  rpcClient,
  accountBalance,
  tab
}: Props) {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [chainNowSec, setChainNowSec] = useState<number | null>(null);

  const { isAuthenticated } = usePrividium();

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
        setIsAdmin(false);
        return;
      }
      if (!address || !isAddress(address)) {
        console.log("missing wallet address");
        setIsAdmin(false);
        return;
      }
      const admin = await gameContract.read.admins([address]);
      setIsAdmin(admin === true);
    }

    getContractAdmin();
  }, [address, gameContract, isAuthenticated]);

  return (
    <div className="px-2 py-2 text-slate-900">
      {isAuthenticated && (
        <>
          {address && gameContract && rpcClient ? (
            <>
            {tab === 'game' ? (
              <>
              {isAdmin ? (
                <AdminView
                  gameContract={gameContract}
                  rpcClient={rpcClient}
                  chainNowSec={chainNowSec}
                  accountBalance={accountBalance}
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
              <SendTab balance={accountBalance} rpcClient={rpcClient} />
              </>
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
