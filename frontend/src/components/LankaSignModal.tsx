import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  FileSignature,
  CheckCircle2,
  Loader2,
  X,
  Download,
  Copy,
} from "lucide-react";

interface LankaSignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSign: () => Promise<void>;
  loanData: {
    borrowerName: string;
    approvedAmount: number;
    interestRate: number;
    ncgiCoverage: number;
    officerId: string;
  };
  signatureResult?: {
    contractId: string;
    certHash: string;
    timestamp: string;
    ncgiRef: string;
  } | null;
  isLoading: boolean;
}

function formatLKR(value: number): string {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function LankaSignModal({
  isOpen,
  onClose,
  onSign,
  loanData,
  signatureResult,
  isLoading,
}: LankaSignModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) onClose();
    },
    [isLoading, onClose],
  );

  // Fix 2: Preserve and restore overflow value
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget && !isLoading) onClose();
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function truncateHash(hash: string, len = 12) {
    if (hash.length <= len * 2 + 3) return hash;
    return `${hash.slice(0, len)}…${hash.slice(-len)}`;
  }

  // Fix 1: Generate HTML contract and trigger download
  function handleDownloadContract() {
    if (!signatureResult) return;

    const contractHTML = `<!DOCTYPE html>
<html><head><title>Loan Contract ${signatureResult.contractId}</title>
<style>body{font-family:serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}
h1{text-align:center;border-bottom:2px solid #333;padding-bottom:10px}
.field{margin:8px 0}.label{font-weight:bold;display:inline-block;width:250px}
.hash{font-family:monospace;word-break:break-all;background:#f5f5f5;padding:8px;border:1px solid #ddd}
.footer{margin-top:40px;border-top:1px solid #ccc;padding-top:20px;font-size:0.9em;color:#666}
</style></head><body>
<h1>LEGALLY BINDING LOAN CONTRACT</h1>
<p style="text-align:center"><em>Executed under the Electronic Transactions Act No. 19 of 2006, Sri Lanka</em></p>
<hr>
<div class="field"><span class="label">Contract ID:</span> ${signatureResult.contractId}</div>
<div class="field"><span class="label">Execution Timestamp:</span> ${new Date(signatureResult.timestamp).toLocaleString()}</div>
<div class="field"><span class="label">Borrower:</span> ${loanData.borrowerName}</div>
<div class="field"><span class="label">Approved Amount:</span> LKR ${loanData.approvedAmount.toLocaleString()}</div>
<div class="field"><span class="label">Interest Rate:</span> ${loanData.interestRate}% p.a.</div>
<div class="field"><span class="label">NCGI Coverage:</span> ${loanData.ncgiCoverage}%</div>
<div class="field"><span class="label">NCGI Guarantee Ref:</span> ${signatureResult.ncgiRef}</div>
<div class="field"><span class="label">Signing Officer:</span> ${loanData.officerId}</div>
<hr>
<h3>LankaSign Digital Certificate</h3>
<div class="hash">${signatureResult.certHash}</div>
<div class="footer">
<p>This contract has been digitally signed via LankaSign Certificate Authority and is legally binding under the Electronic Transactions Act No. 19 of 2006.</p>
<p>National Credit Guarantee Institution (NCGI) provides ${loanData.ncgiCoverage}% risk coverage for this loan.</p>
<p><strong>Status: APPROVED AND EXECUTED</strong></p>
</div></body></html>`;

    const blob = new Blob([contractHTML], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Contract_${signatureResult.contractId}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      style={{ animation: "fadeIn 0.2s ease-out" }}
      onClick={handleOverlayClick}
    >
      <div
        className="card w-full max-w-lg p-0 overflow-hidden"
        style={{ animation: "scaleIn 0.25s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-700/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center">
              <FileSignature className="w-4.5 h-4.5 text-gold" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                {signatureResult ? "Contract Digitally Signed" : "LankaSign Digital Signature"}
              </h2>
              <p className="text-[11px] text-slate-500">
                {signatureResult ? "Legally binding execution complete" : "Review and sign the loan contract"}
              </p>
            </div>
          </div>
          {!isLoading && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-navy-700/50 border border-navy-600/50 flex items-center justify-center text-slate-400 hover:text-white hover:bg-navy-600 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-6 py-5">
          {!signatureResult ? (
            /* Pre-signing state */
            <>
              {/* Loan terms table */}
              <div className="space-y-3 mb-5">
                {[
                  ["Borrower", loanData.borrowerName],
                  ["Approved Amount", formatLKR(loanData.approvedAmount)],
                  ["Interest Rate", `${loanData.interestRate.toFixed(1)}% p.a.`],
                  ["NCGI Coverage", `${loanData.ncgiCoverage}%`],
                  ["Officer ID", loanData.officerId],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between py-2 border-b border-navy-700/30 last:border-0"
                  >
                    <span className="text-xs text-slate-500">{label}</span>
                    <span className="text-sm font-medium text-white">{value}</span>
                  </div>
                ))}
              </div>

              {/* Legal notice */}
              <div className="bg-navy-900/50 border border-navy-700/40 rounded-lg px-4 py-3 mb-5">
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  By signing, you confirm compliance with the{" "}
                  <span className="text-gold font-medium">
                    Electronic Transactions Act No. 19 of 2006
                  </span>{" "}
                  and acknowledge that this digital signature carries the same legal weight
                  as a handwritten signature under Sri Lankan law.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={onSign}
                  disabled={isLoading}
                  className="btn-primary flex-1"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Signing…
                    </>
                  ) : (
                    <>
                      <FileSignature className="w-4 h-4" />
                      Digitally Sign with LankaSign
                    </>
                  )}
                </button>
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            /* Post-signing state */
            <>
              {/* Success banner */}
              <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-4 py-3 mb-5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-400">
                    Contract Digitally Signed
                  </p>
                  <p className="text-[11px] text-emerald-400/70">
                    Execution recorded on the blockchain ledger
                  </p>
                </div>
              </div>

              {/* Certificate details */}
              <div className="space-y-3 mb-5">
                {[
                  { label: "Contract ID", value: signatureResult.contractId, mono: false },
                  { label: "SHA-256 Certificate Hash", value: signatureResult.certHash, mono: true },
                  { label: "Timestamp", value: new Date(signatureResult.timestamp).toLocaleString("en-LK"), mono: false },
                  { label: "NCGI Guarantee Ref", value: signatureResult.ncgiRef, mono: false },
                ].map(({ label, value, mono }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between py-2 border-b border-navy-700/30 last:border-0"
                  >
                    <span className="text-xs text-slate-500 shrink-0">{label}</span>
                    <div className="flex items-center gap-1.5 ml-3 min-w-0">
                      <span
                        className={`text-sm font-medium text-white truncate ${mono ? "font-mono text-xs" : ""}`}
                        title={value}
                      >
                        {mono ? truncateHash(value) : value}
                      </span>
                      {mono && (
                        <button
                          onClick={() => copyToClipboard(value)}
                          className="shrink-0 text-slate-500 hover:text-gold transition-colors"
                          title="Copy full hash"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDownloadContract}
                  className="btn-primary flex-1"
                >
                  <Download className="w-4 h-4" />
                  Download Legally Binding Contract (PDF)
                </button>
                <button onClick={onClose} className="btn-secondary">
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Inline keyframes for modal animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );

  return createPortal(modal, document.body);
}
