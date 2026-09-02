import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Plus,
  QrCode,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  getTransactionSummary,
  generateSessionCode,
  type TransactionSummaryResponse,
} from "../../services/api";

interface DashboardState {
  loading: boolean;
  error: string | null;
  summary: TransactionSummaryResponse | null;
}

function formatLKR(amount: number): string {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function shortenId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

export default function BorrowerDashboard() {
  const navigate = useNavigate();
  const [state, setState] = useState<DashboardState>({
    loading: true,
    error: null,
    summary: null,
  });
  const [generating, setGenerating] = useState(false);
  const borrowerName = localStorage.getItem("phygital_borrower_name") ?? "Business Owner";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summary = await getTransactionSummary();
        if (!cancelled) setState({ loading: false, error: null, summary });
      } catch {
        if (!cancelled)
          setState({
            loading: false,
            error: "Unable to load your transaction summary. Please try again later.",
            summary: null,
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerateCode = useCallback(async () => {
    setGenerating(true);
    try {
      const response = await generateSessionCode();
      navigate("/borrower/processing", {
        state: {
          verificationCode: response.verification_code,
          token: response.token,
        },
      });
    } catch {
      setGenerating(false);
      setState((prev) => ({
        ...prev,
        error: "Failed to generate verification code. Please try again.",
      }));
    }
  }, [navigate]);

  /* ── Loading ─────────────────────────────────────────────────────── */
  if (state.loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-teal animate-spin" />
        <p className="text-sm text-warm-600">Loading your dashboard…</p>
      </div>
    );
  }

  /* ── Error ───────────────────────────────────────────────────────── */
  if (state.error && !state.summary) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <div className="b-card p-6 border-red-200 bg-red-50 flex flex-col items-center text-center gap-4">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <h2 className="text-lg font-semibold text-warm-900">Something went wrong</h2>
          <p className="text-sm text-warm-600">{state.error}</p>
          <button
            onClick={() => window.location.reload()}
            className="b-btn-primary text-sm px-6 py-2.5"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { summary } = state;
  const isEmpty = !summary || summary.transaction_count === 0;

  /* ── Empty state ─────────────────────────────────────────────────── */
  if (isEmpty) {
    return (
      <div className="max-w-lg mx-auto flex flex-col items-center text-center">
        <div className="b-fade-in-up mb-6">
          <div className="w-20 h-20 rounded-full bg-cream-200 border-2 border-cream-300 flex items-center justify-center mx-auto">
            <FileText className="w-10 h-10 text-warm-500" />
          </div>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-warm-900 font-display b-fade-in-up" style={{ animationDelay: "0.05s" }}>
          Welcome, {borrowerName}
        </h1>

        <div className="w-full b-card p-8 mt-8 b-fade-in-up" style={{ animationDelay: "0.1s" }}>
          <FileText className="w-12 h-12 text-warm-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-warm-900 mb-2">No transactions yet</h2>
          <p className="text-sm text-warm-600 leading-relaxed mb-6">
            Start by adding your first financial record. Upload photos of your ledger,
            record a voice note, or type in your transactions.
          </p>
          <button
            onClick={() => navigate("/borrower/upload")}
            className="b-btn-primary text-base px-8 py-3"
          >
            <Plus className="w-4 h-4 shrink-0" />
            Add Records
          </button>
        </div>
      </div>
    );
  }

  /* ── With transactions ───────────────────────────────────────────── */
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="b-fade-in-up">
        <h1 className="text-2xl md:text-3xl font-bold text-warm-900 font-display">
          Welcome back, {borrowerName}
        </h1>
        <p className="mt-1 text-warm-600 text-sm">
          Here's a summary of your financial records
        </p>
      </div>

      {/* Inline error banner */}
      {state.error && (
        <div className="b-card p-4 border-amber-200 bg-amber-50 flex items-start gap-3 b-fade-in-up">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">{state.error}</p>
        </div>
      )}

      {/* Business name badge */}
      {summary.business_name && (
        <div className="b-fade-in-up" style={{ animationDelay: "0.05s" }}>
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold/10 border border-gold/30 text-sm font-medium text-warm-800">
            <DollarSign className="w-4 h-4 text-gold shrink-0" />
            {summary.business_name}
          </span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 b-fade-in-up" style={{ animationDelay: "0.1s" }}>
        {/* Total Revenue */}
        <div className="b-card p-5 border-green-200 bg-green-50/60">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-green-600 shrink-0" />
            <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
              Total Revenue
            </span>
          </div>
          <p className="text-2xl font-bold text-green-800">
            {formatLKR(summary.total_revenue)}
          </p>
        </div>

        {/* Total Expenses */}
        <div className="b-card p-5 border-orange-200 bg-orange-50/60">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-orange-600 shrink-0" />
            <span className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
              Total Expenses
            </span>
          </div>
          <p className="text-2xl font-bold text-orange-800">
            {formatLKR(summary.total_expenses)}
          </p>
        </div>

        {/* Personal Expenses */}
        <div className="b-card p-5 border-blue-200 bg-blue-50/60">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-blue-600 shrink-0" />
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
              Personal Expenses
            </span>
          </div>
          <p className="text-2xl font-bold text-blue-800">
            {formatLKR(summary.total_personal)}
          </p>
        </div>
      </div>

      {/* Transaction count badge */}
      <div className="flex items-center gap-3 b-fade-in-up" style={{ animationDelay: "0.15s" }}>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal/10 border border-teal/30 text-sm font-semibold text-teal">
          <FileText className="w-4 h-4 shrink-0" />
          {summary.transaction_count} transaction{summary.transaction_count !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Transaction list */}
      {summary.items.length > 0 && (
        <div className="b-card p-5 md:p-6 b-fade-in-up" style={{ animationDelay: "0.2s" }}>
          <h2 className="text-sm font-semibold text-warm-900 mb-4">Transaction Records</h2>
          <div className="space-y-3">
            {summary.items.map((item) => (
              <div
                key={item.request_id}
                className="flex items-start gap-3 p-3 rounded-lg bg-cream-50 border border-cream-200"
              >
                <div className="w-8 h-8 rounded-lg bg-teal/10 flex items-center justify-center shrink-0 mt-0.5">
                  <FileText className="w-4 h-4 text-teal" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-warm-500 bg-cream-200 px-2 py-0.5 rounded">
                      {shortenId(item.request_id)}
                    </span>
                    <span className="text-xs text-warm-500">
                      {formatDate(item.processed_at)}
                    </span>
                  </div>
                  <p className="text-sm text-warm-700 leading-relaxed line-clamp-2">
                    {item.raw_text
                      ? item.raw_text.slice(0, 120) + (item.raw_text.length > 120 ? "…" : "")
                      : "Processed transaction record"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3 b-fade-in-up" style={{ animationDelay: "0.25s" }}>
        <button
          onClick={() => navigate("/borrower/upload")}
          className="flex-1 w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-cream-300 bg-cream-50 text-warm-700 text-sm font-medium hover:bg-cream-100 transition-colors"
        >
          <Plus className="w-4 h-4 shrink-0" />
          Add More Records
        </button>
        <button
          onClick={handleGenerateCode}
          disabled={generating}
          className="flex-1 w-full sm:w-auto b-btn-primary justify-center text-base px-6 py-3"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <QrCode className="w-4 h-4 shrink-0" />
              Generate Verification Code
            </>
          )}
        </button>
      </div>

      {/* Privacy note */}
      <p className="text-center text-[11px] text-warm-600/50 leading-relaxed max-w-md mx-auto pb-2 b-fade-in-up" style={{ animationDelay: "0.3s" }}>
        Your data is encrypted (AES-256) and automatically purged after 72 hours
        in compliance with PDPA regulations.
      </p>
    </div>
  );
}
