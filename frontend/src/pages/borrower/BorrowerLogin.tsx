import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LogIn, CreditCard, Lock, Eye, EyeOff, Loader2, AlertCircle, Shield } from "lucide-react";
import { loginBorrower, BORROWER_TOKEN_KEY } from "../../services/api";

export default function BorrowerLogin() {
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!identifier.trim() || !password) {
      setError("Please enter both fields.");
      return;
    }
    setLoading(true);
    try {
      const data = await loginBorrower(identifier.trim(), password);
      localStorage.setItem(BORROWER_TOKEN_KEY, data.access_token);
      localStorage.setItem("phygital_borrower_name", data.borrower_name);
      navigate("/borrower/dashboard");
    } catch (err: unknown) {
      const msg =
        err instanceof Error && "response" in err
          ? ((err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
            "Invalid credentials. Please try again.")
          : "Network error. Please check your connection and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="borrower-portal min-h-screen b-paper-bg flex flex-col">
      {/* Minimal top bar */}
      <header className="flex items-center gap-2.5 px-5 py-4 bg-cream-50/80 backdrop-blur-sm border-b border-cream-300/60">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal flex items-center justify-center shadow-sm">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-base font-bold text-warm-900 tracking-tight font-display">
              Phygital
            </span>
            <span className="block text-[10px] text-warm-600 font-medium -mt-0.5 tracking-wide">
              SME Credit Portal
            </span>
          </div>
        </Link>
      </header>

      {/* Centered auth form */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="max-w-md w-full space-y-6">
          {/* Heading */}
          <div className="text-center b-fade-in-up">
            <div className="w-16 h-16 rounded-full bg-teal/10 border-2 border-teal/20 flex items-center justify-center mx-auto mb-5">
              <LogIn className="w-8 h-8 text-teal" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-warm-900 font-display">
              Borrower Login
            </h1>
            <p className="mt-2 text-warm-600 text-sm leading-relaxed">
              Sign in to access your credit dashboard
            </p>
          </div>

          {/* Form card */}
          <form
            onSubmit={handleSubmit}
            className="b-card p-6 md:p-8 b-fade-in-up space-y-5"
            style={{ animationDelay: "0.06s" }}
            noValidate
          >
            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-warm-700 mb-2 tracking-wide uppercase">
                NIC or Mobile Number
              </label>
              <div className="relative">
                <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400 pointer-events-none" />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. 896543456V or 0771234567"
                  className="b-input b-input--icon-left"
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-warm-700 mb-2 tracking-wide uppercase">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="b-input b-input--icon-left b-input--icon-right"
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="b-btn-primary w-full justify-center text-base py-3.5 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing In…
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 shrink-0" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Test credentials hint */}
          <div
            className="b-card px-4 py-3 b-fade-in-up"
            style={{ animationDelay: "0.12s" }}
          >
            <p className="text-center text-xs text-warm-600">
              <span className="font-semibold text-warm-700">Demo: </span>
              NIC{" "}
              <code className="font-mono bg-cream-200 px-1.5 py-0.5 rounded text-warm-800 text-[11px]">
                896543456V
              </code>{" "}
              / Password{" "}
              <code className="font-mono bg-cream-200 px-1.5 py-0.5 rounded text-warm-800 text-[11px]">
                test1234
              </code>
            </p>
          </div>

          {/* Register link */}
          <p
            className="text-center text-sm text-warm-600 b-fade-in-up"
            style={{ animationDelay: "0.18s" }}
          >
            New user?{" "}
            <Link to="/borrower/register" className="text-teal font-semibold hover:underline">
              Register here
            </Link>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-4 py-3 border-t border-cream-300/60 text-center">
        <span className="text-xs text-warm-600/60">
          Phygital — Empowering Informal SMEs
        </span>
      </footer>
    </div>
  );
}
