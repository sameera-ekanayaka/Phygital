import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ScanLine, Lock, CheckCircle2 } from "lucide-react";

export default function Scanner() {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!scanning) return;
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setDone(true);
          setTimeout(() => navigate("/dossier"), 800);
          return 100;
        }
        return p + 5;
      });
    }, 80);
    return () => clearInterval(interval);
  }, [scanning, navigate]);

  const handleScan = () => {
    if (scanning) return;
    setScanning(true);
    setProgress(0);
    setDone(false);
  };

  // Corner bracket size
  const corner = 28;
  const cornerStyle = "absolute text-gold pulse-corner";

  return (
    <div className="max-w-md mx-auto flex flex-col items-center">
      {/* Header */}
      <div className="text-center mb-8 fade-in-up">
        <div className="inline-flex items-center gap-2 text-xs text-slate-500 mb-3">
          <Lock className="w-3 h-3 text-emerald-500" />
          Secure QR Verification — 72-hour time-locked dossier
        </div>
        <h1 className="text-xl font-bold text-white">Scan Merchant QR Code</h1>
        <p className="mt-2 text-sm text-slate-400">
          Position the merchant's QR code within the frame
        </p>
      </div>

      {/* Scanner viewfinder */}
      <div
        className="relative w-72 h-72 fade-in-up"
        style={{ animationDelay: "0.1s" }}
      >
        {/* Outer glow */}
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            boxShadow: scanning
              ? "0 0 40px 4px rgba(212,168,83,0.15)"
              : "0 0 0 0 transparent",
            transition: "box-shadow 0.4s",
          }}
        />

        {/* Background */}
        <div className="absolute inset-0 bg-navy-800 rounded-2xl overflow-hidden border border-navy-600/50">
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                "linear-gradient(rgba(148,163,184,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.3) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />

          {/* Scan line */}
          {scanning && !done && (
            <div
              className="scan-line absolute left-4 right-4 h-0.5 rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, transparent, #d4a853, transparent)",
                boxShadow: "0 0 12px #d4a853",
              }}
            />
          )}

          {/* Success overlay */}
          {done && (
            <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center backdrop-blur-sm rounded-2xl">
              <div className="flex flex-col items-center gap-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-400">
                  QR Code Verified
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Corners */}
        {/* Top-left */}
        <svg
          className={`${cornerStyle}`}
          style={{ top: -1, left: -1 }}
          width={corner}
          height={corner}
          viewBox="0 0 28 28"
        >
          <path
            d="M2 14 L2 4 Q2 2 4 2 L14 2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        {/* Top-right */}
        <svg
          className={`${cornerStyle}`}
          style={{ top: -1, right: -1 }}
          width={corner}
          height={corner}
          viewBox="0 0 28 28"
        >
          <path
            d="M14 2 L24 2 Q26 2 26 4 L26 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        {/* Bottom-left */}
        <svg
          className={`${cornerStyle}`}
          style={{ bottom: -1, left: -1 }}
          width={corner}
          height={corner}
          viewBox="0 0 28 28"
        >
          <path
            d="M2 14 L2 24 Q2 26 4 26 L14 26"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        {/* Bottom-right */}
        <svg
          className={`${cornerStyle}`}
          style={{ bottom: -1, right: -1 }}
          width={corner}
          height={corner}
          viewBox="0 0 28 28"
        >
          <path
            d="M14 26 L24 26 Q26 26 26 24 L26 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Progress bar */}
      {scanning && !done && (
        <div className="w-72 mt-6">
          <div className="h-1 bg-navy-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-center text-xs text-slate-500 mt-2">
            Verifying cryptographic signature… {progress}%
          </p>
        </div>
      )}

      {/* Button */}
      <button
        onClick={handleScan}
        disabled={scanning && !done}
        className="btn-primary mt-8 w-72"
      >
        {done ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Redirecting to Dossier…
          </>
        ) : scanning ? (
          <>
            <ScanLine className="w-4 h-4 animate-pulse" />
            Scanning…
          </>
        ) : (
          <>
            <ScanLine className="w-4 h-4" />
            Scan QR Code
          </>
        )}
      </button>

      {/* Info */}
      <p className="mt-4 text-[11px] text-slate-500 text-center max-w-xs leading-relaxed">
        QR codes expire 72 hours after dossier generation. Ensure the code is
        clearly visible and well-lit.
      </p>
    </div>
  );
}
