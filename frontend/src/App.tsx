import { LoaderCircle, TriangleAlert } from "lucide-react";
import "./App.css";
import { LoggedInView } from "./components/LoggedInView";
import { usePrividium } from "./utils/usePrividium";
import { injected, useConnect, useConnection } from "wagmi";

function App() {
  const { isAuthenticated, isAuthenticating, authError, authenticate } =
    usePrividium();
  const { isConnected, isConnecting } = useConnection();
  const connect = useConnect();

  const login = async () => {
    const success = await authenticate();
    if (success) {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen">
      {isAuthenticated ? (
        <>
          {!isConnected ? (
            <button
              type="button"
              disabled={isConnecting}
              onClick={() => connect.mutate({ connector: injected() })}
              className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isConnecting ? "Connecting wallet..." : "Connect wallet to play"}
            </button>
          ) : (
            <LoggedInView />
          )}
        </>
      ) : (
        <div>
          <p>You are NOT authenticated 🥺</p>

          {authError && (
            <div className="mt-8 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
              <TriangleAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 font-bold leading-relaxed">
                {authError}
              </p>
            </div>
          )}

          {isAuthenticating && (
          <div className="w-full place-items-center">
            <LoaderCircle className="animate-spin" />
            </div>
        )}

          <button
            onClick={login}
            className="mt-2 p-2 text-base cursor-pointer border border-blue-400 rounded-sm"
            disabled={isAuthenticating}
          >
            Authenticate via Prividium
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
