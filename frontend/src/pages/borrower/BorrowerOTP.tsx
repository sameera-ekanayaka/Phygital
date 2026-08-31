import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { ShieldCheck, Info, Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { verifyOtp } from "../../services/api";

const OTP_LENGTH = 6;

export default function BorrowerOTP() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { phone?: string } | null;
  const phone = state?.phone;

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const [resendDisabled, setResendDisabled] = useState(true);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (!resendDisabled) return;
    if (resendTimer <= 0) {
      setResendDisabled(false);
      return;
    }
    const id = setTimeout(() => setResendTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [resendTimer, resendDisabled]);

  function handleChange(index: number, e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (!/^\d*$/.test(val)) return;
    const next = [...digits];
    next[index] = val.slice(-1);
    setDigits(next);
    setError("");

    if (val && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (next.every((d) => d !== "")) {
      const code = next.join("");
      handleVerify(code);
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
        const next = [...digits];
        next[index - 1] = "";
        setDigits(next);
      } else {
        const next = [...digits];
        next[index] = "";
        setDigits(next);
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = [...digits];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setDigits(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIdx]?.focus();
    if (next.every((d) => d !== "")) {
      handleVerify(next.join(""));
    }
  }

  async function handleVerify(code: string) {
    if (!phone) return;
    setLoading(true);
    setError("");
    try {
      await verifyOtp(phone, code);
      navigate("/borrower/login");
    } catch (err: unknown) {
      const msg =
        err instanceof Error && "response" in err
          ? ((err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
            "Invalid verification code. Please try again.")
          : "Network error. Please try again.";
      setError(msg);
      setDigits(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  function handleResend() {
    setResendTimer(60);
    setResendDisabled(true);
    setDigits(Array(OTP_LENGTH).fill(""));
    setError("");
    inputRefs.current[0]?.focus();
  }

  if (!phone) return <Navigate to="/borrower/register" replace />;

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="text-center b-fade-in-up">
        <div className="w-14 h-14 rounded-full bg-teal/10 border-2 border-teal/20 flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="w-7 h-7 text-teal" />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-warm-900 font-display">
          Verify Your Phone
        </h1>
        <p className="mt-2 text-warm-600 text-sm">
          Enter the 6-digit code sent to{" "}
          <span className="font-semibold text-warm-800">{phone}</span>
        </p>
      </div>

      {/* Dev hint */}
      <div
        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-sky-50 border border-sky-200 text-sm text-sky-700 b-fade-in-up"
        style={{ animationDelay: "0.05s" }}
      >
        <Info className="w-4 h-4 shrink-0" />
        <span>
          <strong>Demo Mode:</strong> Use code{" "}
          <code className="font-mono font-bold bg-sky-100 px-1.5 py-0.5 rounded">123456</code>
        </span>
      </div>

      <div
        className="b-card p-5 md:p-6 b-fade-in-up space-y-5"
        style={{ animationDelay: "0.1s" }}
      >
        {error && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-center gap-2.5" onPaste={handlePaste}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={loading}
              className="w-12 h-14 text-center text-xl font-bold font-mono b-input !p-0 disabled:opacity-50"
            />
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-sm text-warm-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Verifying…
          </div>
        )}

        <div className="text-center">
          {resendDisabled ? (
            <p className="text-sm text-warm-500">
              Resend code in{" "}
              <span className="font-semibold tabular-nums text-warm-700">{resendTimer}s</span>
            </p>
          ) : (
            <button
              onClick={handleResend}
              className="inline-flex items-center gap-1.5 text-sm text-teal font-semibold hover:underline"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Resend Code
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
