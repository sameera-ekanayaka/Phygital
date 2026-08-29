import { useState, useCallback } from "react";
import { useLocation, Navigate, Link } from "react-router-dom";
import { CheckCircle, Copy, Clock, Home, Check } from "lucide-react";
import { useCountdown } from "../../hooks/useCountdown";

interface SuccessState {
  verificationCode: string;
  expiresAt: string;
}

export default function BorrowerSuccess() {
  const location = useLocation();
  const state = location.state as SuccessState | null;
  const [copied, setCopied] = useState(false);

  // Redirect if no state
  if (!state) return <Navigate to="/borrower/upload" replace />;

  const { days, hours, minutes, seconds, isExpired } = useCountdown(state.expiresAt);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(state.verificationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = state.verificationCode;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [state.verificationCode]);

  return (
    <div className="max-w-lg mx-auto flex flex-col items-center text-center">
      {/* Success icon */}
      <div className="b-fade-in-up mb-6">
        <div className="w-20 h-20 rounded-full bg-teal/15 border-2 border-teal/30 flex items-center justify-center mx-auto">
          <CheckCircle className="w-10 h-10 text-teal" />
        </div>
      </div>

      {/* Title */}
      <h1 className="text-2xl md:text-3xl font-bold text-warm-900 font-display b-fade-in-up" style={{ animationDelay: "0.05s" }}>
        Your Verification Code is Ready
      </h1>
      <p className="mt-2 text-warm-600 text-sm b-fade-in-up" style={{ animationDelay: "0.1s" }}>
        Share this code with your bank officer
      </p>

      {/* Verification code card */}
      <div className="w-full b-card p-6 mt-8 b-fade-in-up border-2 border-gold/30" style={{ animationDelay: "0.15s" }}>
        <div className="bg-cream-100 rounded-xl px-6 py-6 border border-cream-300">
          <p className="text-[11px] text-warm-600/70 uppercase tracking-wider font-semibold mb-3">
            Verification Code
          </p>
          <p className="text-3xl md:text-4xl font-mono font-bold b-shimmer tracking-widest select-all">
            {state.verificationCode}
          </p>
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className={`mt-4 w-full b-btn-primary justify-center transition-all ${
            copied ? "!bg-teal" : ""
          }`}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy Code
            </>
          )}
        </button>

        {/* Countdown */}
        <div className="mt-4 flex items-center justify-center gap-2 text-warm-600">
          <Clock className="w-4 h-4" />
          {isExpired ? (
            <span className="text-sm font-semibold text-red-500">Code Expired</span>
          ) : (
            <span className="text-sm font-medium">
              Code expires in:{" "}
              <span className="font-semibold text-warm-900 tabular-nums">
                {days}d {hours}h {minutes}m {seconds}s
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="w-full b-card p-5 mt-6 text-left b-fade-in-up" style={{ animationDelay: "0.2s" }}>
        <h3 className="text-sm font-semibold text-warm-900 mb-2">What to do next</h3>
        <p className="text-sm text-warm-600 leading-relaxed">
          Share this code with your bank officer. They will enter it in their
          portal to access your credit dossier. The code is valid for 72 hours
          from generation.
        </p>
      </div>

      {/* Return home */}
      <Link
        to="/"
        className="b-btn-secondary mt-8 b-fade-in-up"
        style={{ animationDelay: "0.25s" }}
      >
        <Home className="w-4 h-4" />
        Return to Home
      </Link>
    </div>
  );
}
