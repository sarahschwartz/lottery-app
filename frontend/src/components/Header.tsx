interface Props {
  isAuthenticated: boolean;
}

export function Header({ isAuthenticated }: Props) {
  return (
    <div className="text-center mb-8 md:mb-10">
      <h2
        className={
          isAuthenticated
            ? "text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-3"
            : "text-xl font-semibold tracking-tight text-slate-800 mb-2"
        }
      >
        {isAuthenticated ? "Get Started" : "Secure Access"}
      </h2>
      <p className="text-slate-500 text-sm max-w-md mx-auto">
        {isAuthenticated
          ? "Set up your secure smart wallet to deploy and link it with your Prividium profile."
          : "Please authenticate to access the game."}
      </p>
    </div>
  );
}
