import { useState, useMemo, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  UserPlus,
  Phone,
  CreditCard,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Shield,
  Award,
  CheckCircle2,
} from "lucide-react";
import { registerBorrower } from "../../services/api";
import {
  validateFullName,
  validateSriLankanPhone,
  validateNIC,
  validatePassword,
} from "../../utils/validation";

export default function BorrowerRegister() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [nic, setNic] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [liyaShakthiMember, setLiyaShakthiMember] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Validate NIC and detect female gender for Liya Shakthi scheme eligibility
  const nicResult = useMemo(() => {
    if (!nic.trim()) return null;
    return validateNIC(nic);
  }, [nic]);

  const showLiyaShakthi = Boolean(nicResult?.isValid && nicResult.gender === "female");

  function validateForm(): boolean {
    const errors: Record<string, string> = {};

    const nameRes = validateFullName(fullName);
    if (!nameRes.isValid && nameRes.error) errors.name = nameRes.error;

    const phoneRes = validateSriLankanPhone(phone);
    if (!phoneRes.isValid && phoneRes.error) errors.phone = phoneRes.error;

    const nicCheck = validateNIC(nic);
    if (!nicCheck.isValid && nicCheck.error) errors.nic = nicCheck.error;

    const pwdRes = validatePassword(password);
    if (!pwdRes.isValid && pwdRes.error) errors.password = pwdRes.error;

    if (password && confirmPassword && password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    } else if (!confirmPassword) {
      errors.confirmPassword = "Confirm password is required.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!validateForm()) {
      setError("Please correct the highlighted errors before submitting.");
      return;
    }

    const phoneRes = validateSriLankanPhone(phone);
    const nicCheck = validateNIC(nic);

    setLoading(true);
    try {
      await registerBorrower({
        name: fullName.trim(),
        phone: phoneRes.data || phone.trim(),
        nic: nicCheck.normalized || nic.trim().toUpperCase(),
        password,
        ...(showLiyaShakthi ? { liya_shakthi_member: liyaShakthiMember } : {}),
      });
      navigate("/borrower/verify-otp", { state: { phone: phoneRes.data || phone.trim() } });
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
    <div className="borrower-portal min-h-screen bg-cream-100 b-paper-bg flex flex-col text-warm-900">
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
      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="max-w-md w-full space-y-6">
          {/* Heading */}
          <div className="text-center b-fade-in-up">
            <div className="w-16 h-16 rounded-full bg-teal/10 border-2 border-teal/20 flex items-center justify-center mx-auto mb-5">
              <UserPlus className="w-8 h-8 text-teal" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-warm-900 font-display">
              Create Your Account
            </h1>
            <p className="mt-2 text-warm-600 text-sm leading-relaxed">
              Register to start building your credit profile
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

            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-warm-700 mb-2 tracking-wide uppercase">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400 pointer-events-none" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: "" }));
                  }}
                  onBlur={() => {
                    const res = validateFullName(fullName);
                    if (!res.isValid && res.error) setFieldErrors((prev) => ({ ...prev, name: res.error! }));
                  }}
                  placeholder="e.g. Kamal Perera"
                  className={`b-input b-input--icon-left ${fieldErrors.name ? "border-red-400 focus:border-red-500" : ""}`}
                  disabled={loading}
                  autoComplete="name"
                />
              </div>
              {fieldErrors.name && (
                <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {fieldErrors.name}
                </p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-semibold text-warm-700 mb-2 tracking-wide uppercase">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400 pointer-events-none" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: "" }));
                  }}
                  onBlur={() => {
                    const res = validateSriLankanPhone(phone);
                    if (!res.isValid && res.error) setFieldErrors((prev) => ({ ...prev, phone: res.error! }));
                  }}
                  placeholder="0771234567"
                  className={`b-input b-input--icon-left ${fieldErrors.phone ? "border-red-400 focus:border-red-500" : ""}`}
                  disabled={loading}
                  autoComplete="tel"
                />
              </div>
              {fieldErrors.phone ? (
                <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {fieldErrors.phone}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-warm-600/70">
                  Standard 10-digit Sri Lankan number starting with 07
                </p>
              )}
            </div>

            {/* NIC */}
            <div>
              <label className="block text-xs font-semibold text-warm-700 mb-2 tracking-wide uppercase">
                NIC Number
              </label>
              <div className="relative">
                <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400 pointer-events-none" />
                <input
                  type="text"
                  value={nic}
                  onChange={(e) => {
                    setNic(e.target.value);
                    if (fieldErrors.nic) setFieldErrors((prev) => ({ ...prev, nic: "" }));
                  }}
                  onBlur={() => {
                    const res = validateNIC(nic);
                    if (!res.isValid && res.error) setFieldErrors((prev) => ({ ...prev, nic: res.error! }));
                  }}
                  placeholder="e.g. 896543456V or 198965434567"
                  className={`b-input b-input--icon-left uppercase ${fieldErrors.nic ? "border-red-400 focus:border-red-500" : ""}`}
                  disabled={loading}
                />
              </div>
              {fieldErrors.nic ? (
                <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {fieldErrors.nic}
                </p>
              ) : nicResult?.isValid ? (
                <p className="mt-1 text-[11px] text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Valid {nicResult.format === "old" ? "9-digit (old)" : "12-digit (new)"} NIC ({nicResult.gender})
                </p>
              ) : null}
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-warm-700 mb-2 tracking-wide uppercase">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: "" }));
                  }}
                  onBlur={() => {
                    const res = validatePassword(password);
                    if (!res.isValid && res.error) setFieldErrors((prev) => ({ ...prev, password: res.error! }));
                  }}
                  placeholder="Min 6 characters"
                  className={`b-input b-input--icon-left b-input--icon-right ${fieldErrors.password ? "border-red-400 focus:border-red-500" : ""}`}
                  disabled={loading}
                  autoComplete="new-password"
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
              {fieldErrors.password && (
                <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-semibold text-warm-700 mb-2 tracking-wide uppercase">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-400 pointer-events-none" />
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (fieldErrors.confirmPassword) setFieldErrors((prev) => ({ ...prev, confirmPassword: "" }));
                  }}
                  onBlur={() => {
                    if (confirmPassword && password !== confirmPassword) {
                      setFieldErrors((prev) => ({ ...prev, confirmPassword: "Passwords do not match." }));
                    }
                  }}
                  placeholder="Re-enter password"
                  className={`b-input b-input--icon-left b-input--icon-right ${fieldErrors.confirmPassword ? "border-red-400 focus:border-red-500" : ""}`}
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-warm-400 hover:text-warm-600 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {fieldErrors.confirmPassword}
                </p>
              )}
            </div>

            {/* Liya Shakthi self-declaration — shown dynamically for female NICs */}
            {showLiyaShakthi && (
              <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 p-4 space-y-2.5 b-fade-in-up">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={liyaShakthiMember}
                    onChange={(e) => setLiyaShakthiMember(e.target.checked)}
                    disabled={loading}
                    className="mt-0.5 w-4 h-4 rounded border-2 border-teal-400/60 text-teal-600 focus:ring-teal-500 focus:ring-offset-0 accent-teal cursor-pointer"
                  />
                  <div>
                    <span className="text-sm font-semibold text-warm-800 flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-teal" />
                      I am a registered NCGI Liya Shakthi member
                    </span>
                    <p className="text-xs text-warm-600 mt-1 leading-relaxed">
                      Women-owned micro-enterprises may qualify for 80% credit
                      guarantee under the NCGI Liya Shakthi scheme.
                    </p>
                  </div>
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="b-btn-primary w-full justify-center text-base py-3.5 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating Account…
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 shrink-0" />
                  Register
                </>
              )}
            </button>
          </form>

          {/* Login link */}
          <p
            className="text-center text-sm text-warm-600 b-fade-in-up"
            style={{ animationDelay: "0.12s" }}
          >
            Already have an account?{" "}
            <Link to="/borrower/login" className="text-teal font-semibold hover:underline">
              Sign in here
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
