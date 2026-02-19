import { useState, type Dispatch, type SetStateAction } from "react";
import { usePrividium } from "../hooks/usePrividium";
import { Check, TriangleAlert } from "lucide-react";
import {
  createNewPasskey,
  saveAccountAddress,
  selectExistingPasskey,
} from "../utils/sso/passkeys";
import { DEPLOY_ACCOUNT_ENDPOINT, RP_ID } from "../utils/sso/constants";
import {
  createPublicClient,
  type Address,
  type Chain,
  type Transport,
} from "viem";
import type { UserProfileWallet } from "../utils/types";

interface Props {
  setCompletedAccountAddress: Dispatch<SetStateAction<Address | null>>;
}

type PasskeyStep = "idle" | "creating" | "deploying" | "checking";
type SetupSelection = "create" | "existing";

export function PasskeyLogin({ setCompletedAccountAddress }: Props) {
  const [passkeyStep, setPasskeyStep] = useState<PasskeyStep>("idle");
  const [setupSelection, setSetupSelection] =
    useState<SetupSelection>("create");
  const [passkeyUsername, setPasskeyUsername] = useState<string>("");
  const [passkeyError, setPasskeyError] = useState<string | null>();


  const {
    isAuthenticated,
    getAuthHeaders,
    userProfile,
    refreshUserProfile,
    getChain,
    getTransport,
  } = usePrividium();

  async function ensureUserProfileReady(options?: { requireUserId?: boolean }) {
    const requireUserId = options?.requireUserId ?? false;
    if (userProfile && (!requireUserId || userProfile.id)) return;

    await refreshUserProfile();

    if (userProfile && (!requireUserId || userProfile.id)) return;
    if (!userProfile) {
      throw new Error("User profile not available");
    }
    if (requireUserId) {
      throw new Error("User profile missing id");
    }
  }

  async function handlePasskey() {
    console.log("setupSelection", setupSelection);

    if (setupSelection === "create") {
      await createPasskey();
    } else {
      await getExistingPasskey();
    }
  }

  async function createPasskey() {
    console.log("passkeyUsername", passkeyUsername);
    if (!passkeyUsername) return;
    setPasskeyError(null);
    setCompletedAccountAddress(null);
    setPasskeyStep("creating");
    try {
      await ensureUserProfileReady({ requireUserId: true });
      const userId = userProfile?.id;
      if (!userId) {
        throw new Error("User profile missing id");
      }

      // 1. Create Passkey
      const creds = await createNewPasskey(passkeyUsername);

      // 2. Deploy Account
      setPasskeyStep("deploying");

      const response = await fetch(DEPLOY_ACCOUNT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          originDomain: RP_ID,
          credentialId: creds.credentialId,
          credentialPublicKey: creds.credentialPublicKey,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            errorData.message ||
            "Failed to deploy smart account",
        );
      }

      const data = (await response.json()) as {
        responseObject?: {
          accountAddress?: string;
          walletAssociated?: boolean;
          walletAssociationError?: string;
        };
        accountAddress?: string;
      };
      const accountAddress =
        data?.responseObject?.accountAddress ?? data?.accountAddress;
      if (!accountAddress || !accountAddress.startsWith("0x")) {
        throw new Error("No account address returned from backend");
      }
      if (data?.responseObject?.walletAssociated === false) {
        throw new Error(
          data?.responseObject?.walletAssociationError ||
            "Backend failed to link wallet to user",
        );
      }
      const accountAddressHex = accountAddress as `0x${string}`;

      // 3. Save account and refresh the profile with linked wallets from backend.
      saveAccountAddress(accountAddressHex);
      setCompletedAccountAddress(accountAddressHex);
      await refreshUserProfile();
    } catch (e) {
      console.error(e);
      setPasskeyError(
        e instanceof Error
          ? e.message
          : "Unknown error during passkey creation",
      );
      setPasskeyStep("idle");
    }
  }

  async function getExistingPasskey() {
    setPasskeyError(null);
    setCompletedAccountAddress(null);
    setPasskeyStep("checking");
    try {
      const headers = getAuthHeaders();
      if (!headers) {
        throw new Error("Authentication required");
      }
      if (!userProfile) {
        await refreshUserProfile();
      }
      if (!userProfile) {
        throw new Error("User profile not available");
      }
      console.log("[passkeys] profile loaded", userProfile);
      console.log("userProfile.wallets:", userProfile.wallets);
      const profileWalletList: Address[] = (
        (userProfile?.wallets as UserProfileWallet[]) ?? []
      ).map((w) => w.walletAddress);
      const linkedWallets = profileWalletList.map((w) => w.toLowerCase());
      console.log("[passkeys] linked wallets (normalized)", linkedWallets);
      if (!linkedWallets.length) {
        throw new Error(
          "No linked wallets found for this user. Create a new passkey first or link a wallet to your profile.",
        );
      }
      const fromAddress = linkedWallets[linkedWallets.length - 1] as Address;
      console.log("[passkeys] using from address", fromAddress);
      const displayName = passkeyUsername || userProfile?.displayName || "User";
      const rpcClient = createPublicClient({
        chain: getChain() as unknown as Chain, // viem version conflict
        transport: getTransport() as unknown as Transport,
      });
      const result = await selectExistingPasskey(
        displayName,
        rpcClient,
        fromAddress,
      );
      console.log("[passkeys] selectExistingPasskey result", result);
      const accountAddress = result.accountAddress?.toLowerCase();
      console.log("[passkeys] passkey account address", accountAddress);
      console.log(
        "[passkeys] passkey linked?",
        accountAddress ? linkedWallets.includes(accountAddress) : false,
      );
      if (accountAddress && !linkedWallets.includes(accountAddress)) {
        throw new Error(
          "This passkey account is not linked to your profile. Create it again to link automatically.",
        );
      }
      setCompletedAccountAddress(result.accountAddress);
    } catch (e) {
      console.error(e);
      setPasskeyError(
        e instanceof Error
          ? e.message
          : "Unknown error during passkey selection",
      );
      setPasskeyStep("idle");
    }
  }

  return (
    <>
      {isAuthenticated && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white px-5 py-5 md:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
              <div className="shrink-0">
                {passkeyStep === "checking" || passkeyStep === "creating" ? (
                  <div className="w-11 h-11 rounded-full border-2 border-accent/20 border-t-accent animate-spin"></div>
                ) : (
                  <>
                    {passkeyStep === "deploying" ? (
                      <div className="w-11 h-11 rounded-full bg-green-100 text-green-700 flex items-center justify-center">
                        <Check className="w-6 h-6" />
                      </div>
                    ) : (
                      <div className="w-11 h-11 rounded-full border border-dashed border-slate-300 text-slate-500 text-sm font-semibold flex items-center justify-center">
                        1
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-2xl font-semibold text-slate-900 leading-tight">
                      Security Key Setup
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {passkeyStep === "checking"
                        ? "Validating your existing passkey."
                        : passkeyStep === "creating"
                          ? "Creating your new passkey on this device."
                          : passkeyStep === "deploying"
                            ? "Security key ready for account setup."
                            : "Choose how you want to proceed."}
                    </p>
                  </div>
                </div>

                <div className="mt-4 inline-flex items-center rounded-xl bg-slate-100 p-1">
                  <button
                    onClick={() => setSetupSelection("create")}
                    disabled={passkeyStep !== "idle"}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${setupSelection === "create" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"} ${passkeyStep !== "idle" ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    Create New Passkey
                  </button>
                  <button
                    onClick={() => setSetupSelection("existing")}
                    disabled={passkeyStep !== "idle"}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg transition ${setupSelection === "existing" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"} ${passkeyStep !== "idle" ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    Use Existing
                  </button>
                </div>
                {setupSelection === "create" && passkeyStep === "idle" && (
                  <div className="my-4">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                      Username
                    </label>
                    <input
                      value={passkeyUsername}
                      onChange={(e) => setPasskeyUsername(e.target.value)}
                      type="text"
                      placeholder="ex. alice"
                      className="mt-2 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                    />
                  </div>
                )}

                {setupSelection === "existing" && passkeyStep === "idle" && (
                  <p className="mt-4 text-sm text-slate-500">
                    Select your existing passkey to continue with the wallet
                    already linked to your profile.
                  </p>
                )}

                <div className="mt-10 flex md:justify-end">
                  {passkeyStep === "idle" && (
                    <button
                      onClick={handlePasskey}
                      disabled={setupSelection === "create" && !passkeyUsername}
                      className="enterprise-button-primary w-full md:w-64 py-3 disabled:opacity-50! disabled:cursor-not-allowed!"
                    >
                      {setupSelection === "create"
                        ? "Create Passkey"
                        : "Use Existing Passkey"}
                    </button>
                  )}

                  {passkeyStep === "checking" ||
                    (passkeyStep === "creating" && (
                      <button
                        className="enterprise-button-secondary w-full md:w-64 py-3 opacity-70 cursor-not-allowed"
                        disabled
                      >
                        Processing...
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white px-5 py-5 md:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="shrink-0">
                {passkeyStep === "deploying" ? (
                  <div className="w-11 h-11 rounded-full border-2 border-accent/20 border-t-accent animate-spin"></div>
                ) : (
                  <div className="w-11 h-11 rounded-full border border-dashed border-slate-300 text-slate-500 text-sm font-semibold flex items-center justify-center">
                            2
                          </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-2xl font-semibold text-slate-900 leading-tight">
                  Deploy & Link Smart Wallet
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Deploying wallet, funding it, and linking it to your Prividium profile.
                </p>
              </div>
            </div>
          </div>
          {passkeyError && (
            <div className="mt-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
              <TriangleAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 font-bold leading-relaxed">
                {passkeyError}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
