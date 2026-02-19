import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";

import { loadExistingPasskey } from "../utils/sso/passkeys";
import { usePrividium } from "./usePrividium";
import type { UserProfileWallet } from "../utils/types";

export function useSsoAccount() {
  const { userWallets } = usePrividium();
  const [account, setAccount] = useState<Address | null>(null);

  // Keep latest wallets without making refresh re-create each render
  const userWalletsRef = useRef<UserProfileWallet[] | null>(null);

  useEffect(() => {
    userWalletsRef.current = userWallets as UserProfileWallet[] ?? null;
  }, [userWallets]);

  const refresh = useCallback(() => {
    const { savedAccount } = loadExistingPasskey();

    const nextAccount = (() => {
      if (!savedAccount) return null;

      const wallets = userWalletsRef.current ?? [];
      const linkedWallets = wallets.map((w) => w.walletAddress.toLowerCase());

      if (!linkedWallets.length) {
        // Keep locally selected account visible if profile wallets are temporarily unavailable.
        return savedAccount;
      }

      const isLinked = linkedWallets.includes(savedAccount.toLowerCase());
      return isLinked ? savedAccount : null;
    })();

    // Avoid setting state if it didn't actually change
    setAccount((prev) => (prev === nextAccount ? prev : nextAccount));
  }, []);

  // Initial load + storage listener (runs once)
  useEffect(() => {
    refresh();

    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  // Re-run when wallets update (but refresh is stable)
  useEffect(() => {
    refresh();
  }, [userWallets, refresh]);

  return { account, refresh };
}
