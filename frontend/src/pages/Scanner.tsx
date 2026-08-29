import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import { ScanLine, Lock, CheckCircle2, Camera, Keyboard, AlertTriangle } from "lucide-react";

type ScanMode = "camera" | "manual";
type ScanStatus = "idle" | "scanning" | "success" | "error";

export default function Scanner() {
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = "qr-scanner-region";

  const [mode, setMode] = useState<ScanMode>("camera");
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  // Extract token from scanned URL or raw token
  function extractToken(raw: string): string {
    // Backend QR encodes: http://localhost:8000/api/v1/qrcode/verify/{token}
    const match = raw.match(/\/qrcode\/verify\/([^/?#]+)/);
    if (match) return decodeURIComponent(match[1]);
    // Fallback: treat entire string as token
    return raw.trim();
  }

  function handleTokenResolved(token: string) {
    setStatus("success");
    // Small delay for success animation then navigate
    setTimeout(() => {
      navigate(`/dossier?token=${encodeURIComponent(token)}`);
    }, 900);
  }

  // Initialize / teardown camera scanner
  useEffect(() => {
    if (mode !== "camera") return;

    let mounted = true;
    let scanner: Html5Qrcode | null = null;

    async function startScanner() {
      try {
        scanner = new Html5Qrcode(scannerContainerId, { verbose: false });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 240, height: 240 },
          },
          (decodedText) => {
            // Successful decode — stop scanner immediately to release camera
            if (scanner && mounted) {
              try { scanner.stop().catch(() => {}); } catch { /* noop */ }
              try { scanner.clear(); } catch { /* noop */ }
              scannerRef.current = null;
              const token = extractToken(decodedText);
              handleTokenResolved(token);
            }
          },
          () => {
            // Scan failure callback (called each frame with no QR) — ignore
          },
        );

        if (mounted) setStatus("scanning");
      } catch (err: unknown) {
        if (mounted) {
          setStatus("error");
          const msg = err instanceof Error ? err.message : "";
          setErrorMsg(
            msg.includes("Permission")
              ? "Camera permission denied. Please allow camera access and reload."
              : "Unable to access camera. Ensure a camera is connected and not in use.",
          );
        }
      }
    }

    startScanner();

    return () => {
      mounted = false;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        try { scanner.stop().catch(() => {}); } catch { /* noop */ }
        try { scanner.clear(); } catch { /* noop */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function handleManualVerify() {
    const token = manualToken.trim();
    if (!token) return;
    setManualLoading(true);
    setErrorMsg(null);
    // Simulate brief verification delay then navigate
    setTimeout(() => {
      setManualLoading(false);
      handleTokenResolved(token);
    }, 500);
  }

  // Corner bracket SVGs
  const corner = 28;
  const cornerStyle = "absolute text-gold pulse-corner";

  return (
    <div className="max-w-md mx-auto flex flex-col items-center">
      {/* Header */}
      <div className="text-center mb-6 fade-in-up">
        <div className="inline-flex items-center gap-2 text-xs text-slate-500 mb-3">
          <Lock className="w-3 h-3 text-emerald-500" />
          Secure QR Verification — 72-hour time-locked dossier
        </div>
        <h1 className="text-xl font-bold text-white">Scan Merchant QR Code</h1>
        <p className="mt-2 text-sm text-slate-400">
          Position the merchant's QR code within the frame
        </p>
      </div>

      {/* Mode toggle */}
      <div
        className="flex items-center gap-1 p-1 rounded-lg bg-navy-800 border border-navy-700 mb-6 fade-in-up"
        style={{ animationDelay: "0.05s" }}
      >
        <button
          onClick={() => {
            setMode("camera");
            setStatus("idle");
            setErrorMsg(null);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
            mode === "camera"
              ? "bg-gold/15 text-gold border border-gold/30"
              : "text-slate-400 hover:text-slate-300 border border-transparent"
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          Camera Scan
        </button>
        <button
          onClick={() => {
            setMode("manual");
            setStatus("idle");
            setErrorMsg(null);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all ${
            mode === "manual"
              ? "bg-gold/15 text-gold border border-gold/30"
              : "text-slate-400 hover:text-slate-300 border border-transparent"
          }`}
        >
          <Keyboard className="w-3.5 h-3.5" />
          Manual Entry
        </button>
      </div>

      {/* Camera mode */}
      {mode === "camera" && (
        <>
          {/* Scanner viewfinder */}
          <div
            className="relative w-72 h-72 fade-in-up"
            style={{ animationDelay: "0.1s" }}
          >
            {/* Outer glow */}
            <div
              className="absolute inset-0 rounded-2xl"
              style={{
                boxShadow:
                  status === "scanning"
                    ? "0 0 40px 4px rgba(212,168,83,0.15)"
                    : status === "success"
                    ? "0 0 40px 4px rgba(16,185,129,0.2)"
                    : "0 0 0 0 transparent",
                transition: "box-shadow 0.4s",
              }}
            />

            {/* Background / video region */}
            <div className="absolute inset-0 bg-navy-800 rounded-2xl overflow-hidden border border-navy-600/50">
              {/* Live camera feed container — html5-qrcode injects video here */}
              <div
                id={scannerContainerId}
                className="absolute inset-0 rounded-2xl overflow-hidden"
                style={{ display: status === "success" ? "none" : "block" }}
              />

              {/* Grid overlay (visible before camera starts) */}
              {status === "idle" && (
                <div
                  className="absolute inset-0 opacity-10"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(148,163,184,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.3) 1px, transparent 1px)",
                    backgroundSize: "24px 24px",
                  }}
                />
              )}

              {/* Scan line animation */}
              {status === "scanning" && (
                <div
                  className="scan-line absolute left-4 right-4 h-0.5 rounded-full z-10"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, #d4a853, transparent)",
                    boxShadow: "0 0 12px #d4a853",
                  }}
                />
              )}

              {/* Success overlay */}
              {status === "success" && (
                <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center backdrop-blur-sm rounded-2xl">
                  <div className="flex flex-col items-center gap-2">
                    <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-400">
                      QR Code Verified
                    </span>
                    <span className="text-xs text-slate-400">
                      Redirecting to dossier…
                    </span>
                  </div>
                </div>
              )}

              {/* Error overlay */}
              {status === "error" && errorMsg && (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <AlertTriangle className="w-8 h-8 text-red-400" />
                    <p className="text-xs text-red-400 leading-relaxed">{errorMsg}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Gold corner brackets */}
            <svg className={cornerStyle} style={{ top: -1, left: -1 }} width={corner} height={corner} viewBox="0 0 28 28">
              <path d="M2 14 L2 4 Q2 2 4 2 L14 2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <svg className={cornerStyle} style={{ top: -1, right: -1 }} width={corner} height={corner} viewBox="0 0 28 28">
              <path d="M14 2 L24 2 Q26 2 26 4 L26 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <svg className={cornerStyle} style={{ bottom: -1, left: -1 }} width={corner} height={corner} viewBox="0 0 28 28">
              <path d="M2 14 L2 24 Q2 26 4 26 L14 26" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <svg className={cornerStyle} style={{ bottom: -1, right: -1 }} width={corner} height={corner} viewBox="0 0 28 28">
              <path d="M14 26 L24 26 Q26 26 26 24 L26 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>

          {/* Status text */}
          {status === "scanning" && (
            <p className="mt-4 text-xs text-slate-500 text-center flex items-center gap-2">
              <ScanLine className="w-3 h-3 animate-pulse text-gold" />
              Scanning for QR code…
            </p>
          )}
        </>
      )}

      {/* Manual entry mode */}
      {mode === "manual" && (
        <div
          className="w-full max-w-sm card p-6 fade-in-up"
          style={{ animationDelay: "0.1s" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Keyboard className="w-4 h-4 text-gold" />
            <h2 className="text-sm font-semibold text-white">Manual Token Entry</h2>
          </div>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Paste the JWT token extracted from the merchant's QR code. This is
            useful for demo purposes or when the camera is unavailable.
          </p>
          <textarea
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder="Paste token here…"
            rows={3}
            className="w-full bg-navy-900 border border-navy-600 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30 transition-all resize-none"
          />
          <button
            onClick={handleManualVerify}
            disabled={!manualToken.trim() || manualLoading}
            className="btn-primary mt-4 w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {manualLoading ? (
              <>
                <ScanLine className="w-4 h-4 animate-pulse" />
                Verifying…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Verify Token
              </>
            )}
          </button>
        </div>
      )}

      {/* Info */}
      <p
        className="mt-6 text-[11px] text-slate-500 text-center max-w-xs leading-relaxed fade-in-up"
        style={{ animationDelay: "0.2s" }}
      >
        QR codes expire 72 hours after dossier generation. Ensure the code is
        clearly visible and well-lit.
      </p>
    </div>
  );
}
