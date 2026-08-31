import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { UserPlus, Phone, CreditCard, Lock, Eye, EyeOff, User, Loader2, AlertCircle } from "lucide-react";
import { registerBorrower } from "../../services/api";

export default function BorrowerRegister() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [nic, setNic] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (!fullName.trim()) return "Full name is required.";
    if (!phone.trim()) return "Phone number is required.";
    if (!/^0\d{9}$/.test(phone)) return "Phone must start with 0 and be 10 digits.";
    if (!nic.trim()) return "NIC number is required.";
    if (!/^(\d{9}[VXvx]|\d{12})$/.test(nic))
      return "NIC must be 9 digits + V/X or 12 digits.";
    if (!password) return "Password is required.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (password !== confirmPassword) return "Passwords do not match.";
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      await registerBorrower({
        name: fullName.trim(),
        phone: phone.trim(),
        nic: nic.trim(),
        password,
      });
      navigate("/borrower/verify-otp", { state: { phone: phone.trim() } });
    } catch (err: unknown) {
      const msg =
        err instanceof Error && "response" in err
          ? ((err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
            "Registration failed. Please try again.")
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
          <UserPlus className="w-7 h-7 text-teal" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-warm-900 font-display">
          Create Your Account
        </h1>
        <p className="mt-2 text-warm-600 text-sm">
          Register to start building your credit profile
        </p>
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
            Full Name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Kamal Perera"
              className="b-input pl-10"
              disabled={loading}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-warm-700 mb-1.5">
            Phone Number
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0771234567"
              className="b-input pl-10"
              disabled={loading}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-warm-700 mb-1.5">
            NIC Number
          </label>
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
            <input
              type="text"
              value={nic}
              onChange={(e) => setNic(e.target.value)}
              placeholder="e.g. 896543456V"
              className="b-input pl-10"
              disabled={loading}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-warm-700 mb-1.5">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
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

        <div>
          <label className="block text-xs font-semibold text-warm-700 mb-1.5">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400" />
            <input
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              className="b-input pl-10 pr-10"
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600 transition-colors"
              tabIndex={-1}
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
              Creating Account…
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              Register
            </>
          )}
        </button>
      </form>

      <p className="text-center text-sm text-warm-600 b-fade-in-up" style={{ animationDelay: "0.1s" }}>
        Already have an account?{" "}
        <Link to="/borrower/login" className="text-teal font-semibold hover:underline">
          Login
        </Link>
      </p>
    </div>
  );
}
