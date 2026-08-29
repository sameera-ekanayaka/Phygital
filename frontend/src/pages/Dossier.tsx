import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  FileText,
  Calendar,
  Store,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Minus,
  Lock,
  ShieldCheck,
  Shield,
  Brain,
  MessageSquare,
  Clock,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import CircularGauge from "../components/CircularGauge";
import { verifyQR } from "../services/api";
import type { AxiosError } from "axios";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DossierData {
  borrower_name: string;
  business_type: string;
  masked_nic: string;
  expires_at: string;
  risk_score: number;
  dscr: number;
  net_cash_flow: number;
  monthly_operating_margin: number;
  currency: string;
  dscr_history: { month: string; value: number }[];
  ai_reasoning: string[];
  interview_prompts: {
    text: string;
    category: string;
    priority: "high" | "medium" | "low";
  }[];
  ncgi_eligible: boolean;
}

type ViewState = "loading" | "success" | "expired" | "error" | "no_token";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const priorityConfig = {
  high: {
    icon: AlertTriangle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/25",
    label: "High Priority",
  },
  medium: {
    icon: Minus,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    label: "Medium Priority",
  },
  low: {
    icon: CheckCircle2,
    color: "text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/25",
    label: "Low Priority",
  },
};

const categoryColors: Record<string, string> = {
  Revenue: "badge-gold",
  Verification: "badge-green",
  Risk: "badge-red",
};

const DEFAULT_DSCR_HISTORY = [
  { month: "Jan", value: 0 },
  { month: "Feb", value: 0 },
  { month: "Mar", value: 0 },
  { month: "Apr", value: 0 },
  { month: "May", value: 0 },
  { month: "Jun", value: 0 },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 shadow-xl">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-white mt-0.5">
        DSCR: {payload[0].value.toFixed(2)}
      </div>
    </div>
  );
}

function parseDossierData(raw: Record<string, any>): DossierData {
  return {
    borrower_name: raw.borrower_name ?? "Unknown Borrower",
    business_type: raw.business_type ?? "N/A",
    masked_nic: raw.masked_nic ?? "****----",
    expires_at: raw.expires_at ?? new Date(Date.now() + 72 * 3600_000).toISOString(),
    risk_score: typeof raw.risk_score === "number" ? raw.risk_score : 0,
    dscr: typeof raw.dscr === "number" ? raw.dscr : 0,
    net_cash_flow: typeof raw.net_cash_flow === "number" ? raw.net_cash_flow : 0,
    monthly_operating_margin:
      typeof raw.monthly_operating_margin === "number" ? raw.monthly_operating_margin : 0,
    currency: raw.currency ?? "LKR",
    dscr_history:
      Array.isArray(raw.dscr_history) && raw.dscr_history.length > 0
        ? raw.dscr_history
        : DEFAULT_DSCR_HISTORY,
    ai_reasoning: Array.isArray(raw.ai_reasoning) ? raw.ai_reasoning : [],
    interview_prompts: Array.isArray(raw.interview_prompts) ? raw.interview_prompts : [],
    ncgi_eligible: Boolean(raw.ncgi_eligible),
  };
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/* ------------------------------------------------------------------ */
/*  Countdown hook                                                     */
/* ------------------------------------------------------------------ */

function useCountdown(expiresAt: string) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const diff = Math.max(0, new Date(expiresAt).getTime() - now);
  const days = Math.floor(diff / 86400_000);
  const hours = Math.floor((diff % 86400_000) / 3600_000);
  const minutes = Math.floor((diff % 3600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  return { days, hours, minutes, seconds, expired: diff === 0 };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function Dossier() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [state, setState] = useState<ViewState>(token ? "loading" : "no_token");
  const [data, setData] = useState<DossierData | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [checkedPrompts, setCheckedPrompts] = useState<Set<number>>(new Set());

  // Hook must be called unconditionally — uses fallback when data is null
  const countdownExpiresAt = data?.expires_at ?? new Date(Date.now() + 86400_000).toISOString();
  const countdown = useCountdown(countdownExpiresAt);

  async function fetchData(t: string) {
    setState("loading");
    setErrorText(null);
    try {
      const res = await verifyQR(t);
      setData(parseDossierData(res.cash_flow_data));
      setState("success");
    } catch (err: any) {
      const axiosErr = err as AxiosError;
      const status = axiosErr.response?.status;
      if (status === 410) {
        setState("expired");
      } else {
        setErrorText(
          axiosErr.response?.data
            ? (axiosErr.response.data as any)?.detail ?? "Verification failed."
            : "Network error — could not reach the server.",
        );
        setState("error");
      }
    }
  }

  useEffect(() => {
    if (token) fetchData(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function togglePrompt(idx: number) {
    setCheckedPrompts((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  /* ---------- Render states ---------- */

  if (state === "no_token") {
    return (
      <div className="max-w-md mx-auto flex flex-col items-center text-center fade-in-up">
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-lg font-bold text-white">No Token Provided</h1>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed">
          A valid QR verification token is required to view the dossier. Please
          scan a merchant QR code or enter a token manually.
        </p>
        <button onClick={() => navigate("/scan")} className="btn-primary mt-6">
          <Shield className="w-4 h-4" />
          Back to Scanner
        </button>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="max-w-md mx-auto flex flex-col items-center text-center fade-in-up">
        <div className="w-16 h-16 rounded-full bg-gold/10 border border-gold/25 flex items-center justify-center mb-4">
          <RefreshCw className="w-8 h-8 text-gold animate-spin" />
        </div>
        <h1 className="text-lg font-bold text-white">Verifying Dossier</h1>
        <p className="mt-2 text-sm text-slate-400">
          Validating cryptographic signature and fetching cash-flow data…
        </p>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className="max-w-md mx-auto flex flex-col items-center text-center fade-in-up">
        <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-5">
          <ShieldAlert className="w-10 h-10 text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-red-400">
          Security Alert: Tampered or Expired Dossier
        </h1>
        <p className="mt-3 text-sm text-slate-400 leading-relaxed max-w-sm">
          This QR code has either exceeded its 72-hour validity window or has
          been tampered with. The cryptographic signature could not be verified.
          For security reasons the dossier data is inaccessible.
        </p>
        <div className="mt-4 text-xs text-red-400/70 bg-red-500/5 border border-red-500/15 rounded-lg px-4 py-2">
          Contact the merchant to regenerate a fresh QR code.
        </div>
        <button onClick={() => navigate("/scan")} className="btn-primary mt-6">
          <Shield className="w-4 h-4" />
          Back to Scanner
        </button>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="max-w-md mx-auto flex flex-col items-center text-center fade-in-up">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="text-lg font-bold text-white">Verification Failed</h1>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed max-w-sm">
          {errorText}
        </p>
        <button
          onClick={() => token && fetchData(token)}
          className="btn-primary mt-6"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
        <button
          onClick={() => navigate("/scan")}
          className="btn-secondary mt-3"
        >
          <Shield className="w-4 h-4" />
          Back to Scanner
        </button>
      </div>
    );
  }

  /* ---------- Success ---------- */
  if (!data) return null;

  const {
    borrower_name,
    business_type,
    masked_nic,
    expires_at,
    risk_score,
    dscr,
    net_cash_flow,
    monthly_operating_margin,
    currency,
    dscr_history,
    ai_reasoning,
    interview_prompts,
    ncgi_eligible,
  } = data;

  const avgDscr =
    dscr_history.length > 0
      ? dscr_history.reduce((s, d) => s + d.value, 0) / dscr_history.length
      : 0;

  const dscrBadge =
    dscr >= 1.25
      ? { cls: "badge-green", label: "Strong" }
      : dscr >= 1.0
      ? { cls: "badge-gold", label: "Adequate" }
      : { cls: "badge-red", label: "Below Threshold" };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-4 fade-in-up">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center">
            <FileText className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">
              Explainable AI Appraisal Report
            </h1>
            <p className="text-xs text-slate-400">
              Cash-Flow ID: {token?.slice(0, 12)}…
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge-green">
            <ShieldCheck className="w-3 h-3" />
            Verified
          </span>
        </div>
      </div>

      {/* 1. Borrower Overview Card */}
      <section
        className="card p-5 fade-in-up"
        style={{ animationDelay: "0.05s" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {/* Borrower */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-navy-700 border border-navy-600 flex items-center justify-center shrink-0">
              <Store className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                Borrower
              </div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {borrower_name}
              </div>
            </div>
          </div>
          {/* Business Type */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-navy-700 border border-navy-600 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                Business Type
              </div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {business_type}
              </div>
            </div>
          </div>
          {/* Masked NIC */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-navy-700 border border-navy-600 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                Masked NIC
              </div>
              <div className="text-sm font-semibold text-white mt-0.5 font-mono">
                {masked_nic}
              </div>
            </div>
          </div>
          {/* Expiration countdown */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-navy-700 border border-navy-600 flex items-center justify-center shrink-0">
              <Clock className={`w-4 h-4 ${countdown.expired ? "text-red-400" : "text-gold"}`} />
            </div>
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                Expires In
              </div>
              <div
                className={`text-sm font-semibold mt-0.5 font-mono ${
                  countdown.expired ? "text-red-400" : "text-gold"
                }`}
              >
                {countdown.expired
                  ? "EXPIRED"
                  : `${countdown.days}d ${String(countdown.hours).padStart(2, "0")}:${String(countdown.minutes).padStart(2, "0")}:${String(countdown.seconds).padStart(2, "0")}`}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Financial Health + DSCR Chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Gauge + metrics */}
        <section
          className="card p-6 flex flex-col items-center lg:col-span-2 fade-in-up"
          style={{ animationDelay: "0.1s" }}
        >
          <CircularGauge score={risk_score} />

          {/* Financial metrics grid */}
          <div className="grid grid-cols-2 gap-4 mt-6 w-full">
            {/* DSCR */}
            <div className="bg-navy-900/50 rounded-lg p-3 border border-navy-700/40">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider">
                DSCR
              </div>
              <div className="text-lg font-bold text-white mt-1">
                {dscr.toFixed(2)}
              </div>
              <span className={`${dscrBadge.cls} mt-1 text-[10px]`}>
                {dscrBadge.label}
              </span>
            </div>
            {/* Net Cash Flow */}
            <div className="bg-navy-900/50 rounded-lg p-3 border border-navy-700/40">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider">
                Net Cash Flow
              </div>
              <div className="text-lg font-bold text-white mt-1">
                {formatCurrency(net_cash_flow, currency)}
              </div>
              <span className="text-[10px] text-slate-500">{currency}</span>
            </div>
            {/* Operating Margin */}
            <div className="bg-navy-900/50 rounded-lg p-3 border border-navy-700/40 col-span-2">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider">
                Monthly Operating Margin
              </div>
              <div className="text-lg font-bold text-white mt-1">
                {monthly_operating_margin.toFixed(1)}%
              </div>
            </div>
          </div>
        </section>

        {/* DSCR Chart */}
        <section
          className="card p-6 lg:col-span-3 fade-in-up"
          style={{ animationDelay: "0.15s" }}
        >
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Debt Service Coverage Ratio — Trend
              </h2>
              <p className="text-[11px] text-slate-500 mt-1">
                Average DSCR:{" "}
                <span className="text-gold font-semibold">
                  {avgDscr.toFixed(2)}
                </span>
              </p>
            </div>
          </div>

          <div className="mt-4" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dscr_history} barCategoryGap="30%">
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(51,65,85,0.4)"
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                />
                <YAxis
                  domain={[0, "auto"]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  width={36}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ fill: "rgba(212,168,83,0.06)" }}
                />
                <ReferenceLine
                  y={1.0}
                  stroke="#ef4444"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: "Break-even (1.0)",
                    position: "right",
                    fill: "#ef4444",
                    fontSize: 10,
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {dscr_history.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.value >= 1.0 ? "#d4a853" : "#ef4444"}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-gold" />
              Above break-even
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
              Below break-even
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t border-dashed border-red-400" />
              Break-even threshold
            </span>
          </div>
        </section>
      </div>

      {/* 3. NCGI Risk Guarantee Status */}
      <section
        className={`card p-5 fade-in-up ${
          ncgi_eligible
            ? "border-emerald-500/25"
            : "border-amber-500/25"
        }`}
        style={{ animationDelay: "0.18s" }}
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              ncgi_eligible
                ? "bg-emerald-500/10 border border-emerald-500/25"
                : "bg-amber-500/10 border border-amber-500/25"
            }`}
          >
            <ShieldCheck
              className={`w-6 h-6 ${ncgi_eligible ? "text-emerald-400" : "text-amber-400"}`}
            />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              NCGI Risk Guarantee Status
            </h2>
            {ncgi_eligible ? (
              <span className="badge-green mt-1">
                NCGI Eligible — 75%-80% Government Coverage
              </span>
            ) : (
              <span className="badge-gold mt-1">
                NCGI Not Eligible — DSCR below 1.25 threshold
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 4. AI Appraisal Cheat Sheet */}
      {ai_reasoning.length > 0 && (
        <section
          className="card fade-in-up"
          style={{ animationDelay: "0.22s" }}
        >
          <div className="px-6 py-5 border-b border-navy-700/40">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Brain className="w-4 h-4 text-gold" />
                  Appraisal Cheat Sheet
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  AI-generated reasoning — review each point during the
                  assessment
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-navy-700/50 px-2.5 py-1 rounded">
                <Lock className="w-3 h-3 text-emerald-500" />
                White-box explainability report
              </div>
            </div>
          </div>
          <div className="p-5 space-y-3">
            {ai_reasoning.map((reason, i) => (
              <div
                key={i}
                className="flex items-start gap-4 p-4 rounded-lg border bg-navy-900/30 border-navy-700/40 hover:bg-navy-700/20 transition-all"
              >
                <div className="shrink-0 w-7 h-7 rounded-full bg-navy-800 border border-navy-600 flex items-center justify-center text-xs font-bold text-gold">
                  {i + 1}
                </div>
                <p className="text-sm text-white leading-relaxed flex-1">
                  {reason}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Field Interview Prompts */}
      {interview_prompts.length > 0 && (
        <section
          className="card fade-in-up"
          style={{ animationDelay: "0.26s" }}
        >
          <div className="px-6 py-5 border-b border-navy-700/40">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-gold" />
              <h2 className="text-sm font-semibold text-white">
                Field Interview Prompts
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tick each item as you cover it during the face-to-face meeting
            </p>
          </div>
          <div className="p-5 space-y-3">
            {interview_prompts.map((prompt, i) => {
              const pCfg = priorityConfig[prompt.priority] ?? priorityConfig.medium;
              const PIcon = pCfg.icon;
              const checked = checkedPrompts.has(i);
              return (
                <div
                  key={i}
                  className={`flex items-start gap-4 p-4 rounded-lg border transition-all duration-150 ${pCfg.bg} ${pCfg.border} ${
                    checked ? "opacity-60" : "hover:bg-navy-700/20"
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => togglePrompt(i)}
                    className={`shrink-0 w-7 h-7 rounded-full border flex items-center justify-center transition-all ${
                      checked
                        ? "bg-emerald-500/20 border-emerald-500/40"
                        : "bg-navy-800 border-navy-600 hover:border-gold/50"
                    }`}
                    aria-label={`Mark prompt ${i + 1} as done`}
                  >
                    {checked ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <span className="text-xs font-bold text-slate-400">
                        {i + 1}
                      </span>
                    )}
                  </button>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-relaxed ${
                        checked
                          ? "text-slate-500 line-through"
                          : "text-white"
                      }`}
                    >
                      {prompt.text}
                    </p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span
                        className={
                          categoryColors[prompt.category] ?? "badge-gold"
                        }
                      >
                        {prompt.category}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium ${pCfg.color}`}
                      >
                        <PIcon className="w-3 h-3" />
                        {pCfg.label}
                      </span>
                    </div>
                  </div>
                  {/* Priority icon */}
                  <div
                    className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${pCfg.bg} border ${pCfg.border}`}
                  >
                    <PIcon className={`w-4 h-4 ${pCfg.color}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 6. Disclaimer */}
      <div
        className="text-center text-[11px] text-slate-600 leading-relaxed max-w-lg mx-auto pb-2 fade-in-up"
        style={{ animationDelay: "0.3s" }}
      >
        This dossier is AI-generated and must be reviewed by a qualified loan
        officer. All data is encrypted (AES-256) and processed in compliance
        with PDPA regulations. Raw inputs are purged after 72 hours.
      </div>
    </div>
  );
}
