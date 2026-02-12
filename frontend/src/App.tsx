import { LoaderCircle, TriangleAlert } from "lucide-react";
import "./App.css";
import { LoggedInView } from "./components/LoggedInView";
import { usePrividium } from "./utils/usePrividium";

function App() {
  const { isAuthenticated, isAuthenticating, authError, authenticate } =
    usePrividium();

  const login = async () => {
    const success = await authenticate();
    console.log("SUCCESS:", success);
    if (success) {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen">
      {isAuthenticated ? (
        <div>
          <p>
            <LoggedInView />
          </p>
        </div>
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

          {isAuthenticating && <LoaderCircle className="animate-spin" />}

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
