import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Loader2, KeyRound, Check, Sparkles } from "lucide-react";
import { loginOfficer } from "../../services/api";

export default function BankLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  function handleAutoFill() {
    setUsername("officer.perera");
    setPassword("PhygitalBank2026!");
    setError("");
    setAutoFilled(true);
    setTimeout(() => setAutoFilled(false), 2500);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await loginOfficer(username.trim(), password);
      localStorage.setItem("phygital_access_token", data.access_token);
      localStorage.setItem("phygital_officer_name", username.trim());
      navigate("/bank/verify", { replace: true });
    } catch (err: unknown) {
      const msg =
        err instanceof Error && "response" in err
          ? ((err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
            "Authentication failed. Please check credentials.")
          : "Network error. Please check your connection and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Subtle radial background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(212,168,83,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="w-full max-w-sm fade-in-up relative z-10">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center shadow-lg shadow-gold/5">
            <Shield className="w-5 h-5 text-gold" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-white tracking-tight">Phygital</h1>
            <p className="text-xs text-slate-400 mt-0.5">Credit Assessment Platform · Bank Portal</p>
          </div>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="card p-6 space-y-5"
          noValidate
        >
          <div>
            <label
              htmlFor="username"
              className="block text-xs font-medium text-slate-400 mb-1.5"
            >
              Officer ID
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. officer.perera"
              className="w-full rounded-lg bg-navy-900 border border-navy-600/60 text-sm text-white placeholder-slate-600 px-3.5 py-2.5 outline-none focus:border-gold/60 focus:ring-1 focus:ring-gold/30 transition"
              disabled={loading}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-slate-400 mb-1.5"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg bg-navy-900 border border-navy-600/60 text-sm text-white placeholder-slate-600 px-3.5 py-2.5 outline-none focus:border-gold/60 focus:ring-1 focus:ring-gold/30 transition"
              disabled={loading}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign In as Bank Officer"
            )}
          </button>
        </form>

        {/* Demo Credentials Helper Box */}
        <div className="mt-4 p-4 rounded-xl bg-navy-800/80 border border-gold/20 backdrop-blur-sm space-y-2.5 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gold tracking-wide uppercase flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              Demo Officer Credentials
            </span>
            <button
              type="button"
              onClick={handleAutoFill}
              className="text-[11px] font-semibold text-gold hover:text-white bg-gold/15 hover:bg-gold/30 px-2.5 py-1 rounded-md border border-gold/40 transition-all flex items-center gap-1 cursor-pointer"
            >
              {autoFilled ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Filled!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" />
                  Auto-fill
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-navy-900/80 p-2 rounded-lg border border-navy-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-medium tracking-wider mb-0.5">Officer ID</span>
              <code className="text-white font-mono text-[11px] select-all">officer.perera</code>
            </div>
            <div className="bg-navy-900/80 p-2 rounded-lg border border-navy-700/60">
              <span className="text-slate-400 block text-[10px] uppercase font-medium tracking-wider mb-0.5">Password</span>
              <code className="text-white font-mono text-[11px] select-all">PhygitalBank2026!</code>
            </div>
          </div>

          <p className="text-[11px] text-slate-400/90 leading-relaxed">
            Grants credit assessment access for code verification and NCGI dossier evaluation.
          </p>
        </div>

        <p className="text-center text-[11px] text-slate-600 mt-5">
          Phygital — Central Bank of Sri Lanka · NCGI-backed SME credit
        </p>
      </div>
    </div>
  );
}
