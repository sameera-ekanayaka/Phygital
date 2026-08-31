import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LogIn, CreditCard, Lock, Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
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
      sessionStorage.setItem(BORROWER_TOKEN_KEY, data.access_token);
      sessionStorage.setItem("phygital_borrower_name", data.borrower_name);
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
    <div className="max-w-md mx-auto space-y-6">
      <div className="text-center b-fade-in-up">
        <div className="w-14 h-14 rounded-full bg-teal/10 border-2 border-teal/20 flex items-center justify-center mx-auto mb-4">
          <LogIn className="w-7 h-7 text-teal" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-warm-900 font-display">
          Borrower Login
        </h1>
        <p className="mt-2 text-warm-600 text-sm">Sign in to access your credit dashboard</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="b-card p-5 md:p-6 b-fade-in-up space-y-4"
        style={{ animationDelay: "0.05s" }}
        noValidate
      >
        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-warm-700 mb-1.5">
            NIC or Mobile Number
          </label>
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. 896543456V or 0771234567"
              className="b-input pl-10"
              disabled={loading}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-warm-700 mb-1.5">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="b-input pl-10 pr-10"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="b-btn-primary w-full justify-center text-base py-3.5"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Signing In…
            </>
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              Sign In
            </>
          )}
        </button>
      </form>

      <p
        className="text-center text-xs text-warm-500/70 b-fade-in-up"
        style={{ animationDelay: "0.1s" }}
      >
        Test: NIC{" "}
        <code className="font-mono bg-cream-200 px-1.5 py-0.5 rounded">896543456V</code> /
        Password{" "}
        <code className="font-mono bg-cream-200 px-1.5 py-0.5 rounded">test1234</code>
      </p>

      <p
        className="text-center text-sm text-warm-600 b-fade-in-up"
        style={{ animationDelay: "0.12s" }}
      >
        New user?{" "}
        <Link to="/borrower/register" className="text-teal font-semibold hover:underline">
          Register here
        </Link>
      </p>
    </div>
  );
}
