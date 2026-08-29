import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Loader2, AlertCircle, Hash } from "lucide-react";
import { resolveVerificationCode } from "../services/api";

/**
 * Format raw input into PHYG-XXXX-XXXX pattern.
 * Strips non-alphanumeric chars, uppercases, and inserts hyphens every 4 chars.
 */
function formatCode(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  // Split into groups of 4 and join with hyphens
  const groups = cleaned.match(/.{1,4}/g) ?? [];
  return groups.join("-");
}

export default function Scanner() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Strip the PHYG- prefix if user typed or pasted it
    let stripped = raw.replace(/^phyg-/i, "");
    // Limit to 8 alphanumeric chars (XXXX-XXXX without hyphens)
    stripped = stripped.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
    setCode(formatCode(stripped));
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const cleaned = code.replace(/-/g, "");
      if (cleaned.length < 8) return; // need at least 8 chars

      setLoading(true);
      setError(null);

      try {
        // Prepend PHYG- prefix for the API call
        const fullCode = `PHYG-${code}`;
        const res = await resolveVerificationCode(fullCode);
        // Navigate to dossier with the HMAC token
        navigate(`/dossier?token=${encodeURIComponent(res.token)}`);
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number; data?: { detail?: string } } };
        const status = axiosErr.response?.status;
        if (status === 410) {
          setError("This verification code has expired or is invalid.");
        } else {
          setError(
            axiosErr.response?.data?.detail ??
              "Could not verify this code. Please check and try again.",
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [code, navigate],
  );

  const canSubmit = code.replace(/-/g, "").length === 8 && !loading;

  return (
    <div className="max-w-md mx-auto flex flex-col items-center">
      {/* Header */}
      <div className="text-center mb-8 fade-in-up">
        <div className="inline-flex items-center gap-2 text-xs text-slate-500 mb-3">
          <ShieldCheck className="w-3 h-3 text-emerald-500" />
          Secure Verification — 72-hour time-locked dossier
        </div>
        <h1 className="text-xl font-bold text-white">Enter Verification Code</h1>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed">
          Enter the code provided with the merchant's credit dossier
        </p>
      </div>

      {/* Code Entry Form */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm card p-6 fade-in-up"
        style={{ animationDelay: "0.1s" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Hash className="w-4 h-4 text-gold" />
          <h2 className="text-sm font-semibold text-white">Verification Code</h2>
        </div>

        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          Enter the code from the merchant's dossier. The{" "}
          <span className="font-mono text-slate-300">PHYG-</span> prefix is
          added automatically.
        </p>

        {/* Input */}
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-500 pointer-events-none select-none">
            PHYG-
          </span>
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={handleChange}
            placeholder="XXXX-XXXX"
            maxLength={9}
            autoComplete="off"
            spellCheck={false}
            className="w-full bg-navy-900 border border-navy-600 rounded-lg pl-[4.2rem] pr-4 py-3.5 text-sm font-mono text-white tracking-wider placeholder-slate-600 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30 transition-all uppercase"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 mt-3 text-xs text-red-400 bg-red-500/5 border border-red-500/15 rounded-lg px-3 py-2.5">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary mt-5 w-full disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Verifying…
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              Verify
            </>
          )}
        </button>
      </form>

      {/* Info */}
      <p
        className="mt-6 text-[11px] text-slate-500 text-center max-w-xs leading-relaxed fade-in-up"
        style={{ animationDelay: "0.2s" }}
      >
        Verification codes expire 72 hours after dossier generation. Contact the
        merchant if your code is no longer valid.
      </p>
    </div>
  );
}
