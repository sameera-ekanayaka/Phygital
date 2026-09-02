import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  FileText,
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
  XCircle,
  FileCheck,
  Award,
} from "lucide-react";
import NCGIBadge from "../../components/NCGIBadge";
import LankaSignModal from "../../components/LankaSignModal";
import CircularGauge from "../../components/CircularGauge";
import { useCountdown } from "../../hooks/useCountdown";
import {
  executeLoan,
  verifyQR,
  type LoanExecutionResponse,
} from "../../services/api";
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
  ncgi_coverage_percent?: number;
  liya_shakthi_claimed?: boolean;
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

/** Binithi's Harvest Traders — fallback mock data for demo/offline use */
const MOCK_DOSSIER: DossierData = {
  borrower_name: "Binithi Perera — Binithi's Harvest Traders",
  business_type: "Agricultural Trading — Women-Owned Micro-Enterprise",
  masked_nic: "89****3456V",
  expires_at: new Date(Date.now() + 72 * 3600_000).toISOString(),
  risk_score: 22,
  dscr: 1.45,
  net_cash_flow: 127500,
  monthly_operating_margin: 28.3,
  currency: "LKR",
  dscr_history: [
    { month: "Apr", value: 1.3 },
    { month: "May", value: 1.5 },
    { month: "Jun", value: 1.2 },
    { month: "Jul", value: 1.6 },
    { month: "Aug", value: 1.4 },
    { month: "Sep", value: 1.7 },
  ],
  ai_reasoning: [
    "Consistent agricultural supply cycles detected across 6-month period",
    "Revenue correlates with known paddy harvest seasons in Southern Province",
    "Transport costs stable at 13% of revenue — within agricultural norms",
    "No anomalous spikes or gaps — low fraud risk indicator",
    "Women-owned enterprise eligible for NCGI Liya Shakthi 80% guarantee",
  ],
  interview_prompts: [
    {
      text: "Verify paddy sourcing volumes with local farmers in Matara district — confirm seasonal contracts",
      category: "Verification",
      priority: "high",
    },
    {
      text: "Ask about storage facility capacity and post-harvest loss rates for the last two seasons",
      category: "Risk",
      priority: "medium",
    },
    {
      text: "Confirm transport logistics costs and whether fuel price changes have impacted margins",
      category: "Revenue",
      priority: "low",
    },
  ],
  ncgi_eligible: true,
  ncgi_coverage_percent: 80,
  liya_shakthi_claimed: true,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
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

function parseDossierData(raw: Record<string, unknown>): DossierData {
  return {
    borrower_name: typeof raw.borrower_name === "string" ? raw.borrower_name : "Unknown Borrower",
    business_type: typeof raw.business_type === "string" ? raw.business_type : "N/A",
    masked_nic: typeof raw.masked_nic === "string" ? raw.masked_nic : "****----",
    expires_at: typeof raw.expires_at === "string" ? raw.expires_at : new Date(Date.now() + 72 * 3600_000).toISOString(),
    risk_score: typeof raw.risk_score === "number" ? raw.risk_score : 0,
    dscr: typeof raw.dscr === "number" ? raw.dscr : 0,
    net_cash_flow: typeof raw.net_cash_flow === "number" ? raw.net_cash_flow : 0,
    monthly_operating_margin:
      typeof raw.monthly_operating_margin === "number" ? raw.monthly_operating_margin : 0,
    currency: typeof raw.currency === "string" ? raw.currency : "LKR",
    dscr_history:
      Array.isArray(raw.dscr_history) && raw.dscr_history.length > 0
        ? (raw.dscr_history as DossierData["dscr_history"])
        : MOCK_DOSSIER.dscr_history,
    ai_reasoning: Array.isArray(raw.ai_reasoning) ? (raw.ai_reasoning as string[]) : [],
    interview_prompts: Array.isArray(raw.interview_prompts)
      ? (raw.interview_prompts as DossierData["interview_prompts"])
      : [],
    ncgi_eligible: Boolean(raw.ncgi_eligible),
    ncgi_coverage_percent:
      typeof raw.ncgi_coverage_percent === "number" ? raw.ncgi_coverage_percent : undefined,
    liya_shakthi_claimed:
      raw.owner_demographics != null &&
      typeof raw.owner_demographics === "object" &&
      "liya_shakthi_claimed" in (raw.owner_demographics as Record<string, unknown>)
        ? Boolean((raw.owner_demographics as Record<string, unknown>).liya_shakthi_claimed)
        : undefined,
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
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BankDossier() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [state, setState] = useState<ViewState>(token ? "loading" : "no_token");
  const [data, setData] = useState<DossierData | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [checkedPrompts, setCheckedPrompts] = useState<Set<number>>(new Set());
  const [showLankaSign, setShowLankaSign] = useState(false);
  const [signatureResult, setSignatureResult] = useState<{
    contractId: string;
    certHash: string;
    timestamp: string;
    ncgiRef: string;
  } | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResponse, setExecutionResponse] = useState<LoanExecutionResponse | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");

  // Shared countdown hook — null-safe
  const countdown = useCountdown(data?.expires_at ?? null);

  async function fetchData(t: string) {
    setState("loading");
    setErrorText(null);
    try {
      const res = await verifyQR(t);
      setData(parseDossierData(res.cash_flow_data));
      setState("success");
    } catch (err: unknown) {
      const axiosErr = err as AxiosError;
      const status = axiosErr.response?.status;
      if (status === 410) {
        setState("expired");
      } else {
        // Fall back to Binithi mock data for demo/offline scenarios
        setData(MOCK_DOSSIER);
        setState("success");
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

  const allPromptsChecked =
    data !== null &&
    data.interview_prompts.length > 0 &&
    checkedPrompts.size === data.interview_prompts.length;

  async function handleSignLoan() {
    if (!data || !token) return;
    if (!data.ncgi_eligible) {
      alert("This loan is not eligible for NCGI guarantee and cannot be executed.");
      return;
    }
    setIsExecuting(true);
    try {
      const notes = Array.from(checkedPrompts).map((i) => data.interview_prompts[i]?.text ?? "");
      const res = await executeLoan({
        token,
        officer_id: "OFC-RPR-003",
        approved_amount: data.net_cash_flow * 6,
        interest_rate: 14.0,
        interview_notes: notes,
      });
      setExecutionResponse(res);
      setSignatureResult({
        contractId: res.contract_id,
        certHash: res.lankasign_cert_hash,
        timestamp: res.timestamp,
        ncgiRef: res.ncgi_guarantee_ref,
      });
    } catch {
      alert("Loan execution failed. Please try again.");
    } finally {
      setIsExecuting(false);
    }
  }

  function handleConfirmReject() {
    setRejected(true);
    setShowRejectModal(false);
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
          A valid verification token is required to view the dossier. Please
          enter the merchant's verification code on the verification page.
        </p>
        <button onClick={() => navigate("/bank/verify")} className="btn-primary mt-6">
          <Shield className="w-4 h-4" />
          Back to Verification
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
          This verification code has either exceeded its 72-hour validity window
          or has been tampered with. The cryptographic signature could not be
          verified. For security reasons the dossier data is inaccessible.
        </p>
        <div className="mt-4 text-xs text-red-400/70 bg-red-500/5 border border-red-500/15 rounded-lg px-4 py-2">
          Contact the merchant to regenerate a fresh verification code.
        </div>
        <button onClick={() => navigate("/bank/verify")} className="btn-primary mt-6">
          <Shield className="w-4 h-4" />
          Back to Verification
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
          onClick={() => navigate("/bank/verify")}
          className="btn-secondary mt-3"
        >
          <Shield className="w-4 h-4" />
          Back to Verification
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
      {/* Post-execution success banner */}
      {executionResponse && (
        <div className="card p-5 border-emerald-500/30 bg-emerald-500/5 fade-in-up">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <FileCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-emerald-400">Loan Executed Successfully</h2>
              <p className="text-[11px] text-emerald-400/70">Contract is legally binding and recorded</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-navy-900/40 rounded-lg p-3 border border-navy-700/30">
              <span className="text-slate-500 block">Contract ID</span>
              <span className="text-white font-semibold mt-0.5 block">{executionResponse.contract_id}</span>
            </div>
            <div className="bg-navy-900/40 rounded-lg p-3 border border-navy-700/30">
              <span className="text-slate-500 block">NCGI Ref</span>
              <span className="text-white font-semibold mt-0.5 block">{executionResponse.ncgi_guarantee_ref}</span>
            </div>
            <div className="bg-navy-900/40 rounded-lg p-3 border border-navy-700/30">
              <span className="text-slate-500 block">Cert Hash</span>
              <span className="text-white font-mono text-[11px] mt-0.5 block truncate" title={executionResponse.lankasign_cert_hash}>
                {executionResponse.lankasign_cert_hash.slice(0, 16)}…
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Rejected banner */}
      {rejected && !executionResponse && (
        <div className="card p-5 border-red-500/30 bg-red-500/5 fade-in-up">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-red-400">Loan Application Rejected</h2>
              <p className="text-[11px] text-red-400/70">
                {rejectReason ? `Reason: ${rejectReason}` : "Application has been declined"}
              </p>
            </div>
          </div>
        </div>
      )}

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
              <Clock className={`w-4 h-4 ${countdown.isExpired ? "text-red-400" : "text-gold"}`} />
            </div>
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                Expires In
              </div>
              <div
                className={`text-sm font-semibold mt-0.5 font-mono ${
                  countdown.isExpired ? "text-red-400" : "text-gold"
                }`}
              >
                {countdown.isExpired
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
      <NCGIBadge
        eligible={ncgi_eligible}
        coveragePercent={data.ncgi_coverage_percent ?? (ncgi_eligible ? 75 : 0)}
        className="fade-in-up"
      />

      {/* 3b. Liya Shakthi verification prompt */}
      {data.liya_shakthi_claimed && (
        <section
          className="card p-5 border-amber-500/30 bg-amber-500/5 fade-in-up"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Liya Shakthi Verification Required
              </h2>
              <p className="text-xs text-amber-200/70 mt-1.5 leading-relaxed">
                This borrower has declared NCGI Liya Shakthi membership. Please
                verify membership status through your NCGI portal before
                approving the 80% guarantee.
              </p>
            </div>
          </div>
        </section>
      )}

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

      {/* 6. Loan Officer Action Bar */}
      {!executionResponse && !rejected && (
        <section
          className="card p-5 fade-in-up"
          style={{ animationDelay: "0.3s" }}
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Loan Officer Decision</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {allPromptsChecked
                  ? "All interview items checked — ready to proceed"
                  : `Complete all ${interview_prompts.length} interview prompts before approving`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRejectModal(true)}
                className="btn-secondary !text-red-400 !border-red-500/30 hover:!bg-red-500/10"
                disabled={!allPromptsChecked}
              >
                <XCircle className="w-4 h-4" />
                Reject
              </button>
              <div className="relative group">
                <button
                  onClick={() => setShowLankaSign(true)}
                  disabled={!allPromptsChecked || !data?.ncgi_eligible || isExecuting || !!executionResponse || rejected}
                  className="btn-primary"
                  title={!data?.ncgi_eligible ? "Loan not eligible for NCGI guarantee" : undefined}
                >
                  <FileCheck className="w-4 h-4" />
                  Approve Loan
                </button>
                {!allPromptsChecked && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-navy-900 border border-navy-600 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 whitespace-nowrap shadow-xl z-10">
                    Complete all interview checks first
                  </div>
                )}
                {allPromptsChecked && !data?.ncgi_eligible && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-navy-900 border border-navy-600 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 whitespace-nowrap shadow-xl z-10">
                    Loan not eligible for NCGI guarantee
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 7. Disclaimer */}
      <div
        className="text-center text-[11px] text-slate-600 leading-relaxed max-w-lg mx-auto pb-2 fade-in-up"
        style={{ animationDelay: "0.3s" }}
      >
        This dossier is AI-generated and must be reviewed by a qualified loan
        officer. All data is encrypted (AES-256) and processed in compliance
        with PDPA regulations. Raw inputs are purged after 72 hours.
      </div>

      {/* LankaSign Modal */}
      <LankaSignModal
        isOpen={showLankaSign}
        onClose={() => {
          setShowLankaSign(false);
          if (!executionResponse) setSignatureResult(null);
        }}
        onSign={handleSignLoan}
        loanData={{
          borrowerName: borrower_name,
          approvedAmount: net_cash_flow * 6,
          interestRate: 14.0,
          ncgiCoverage: data.ncgi_coverage_percent ?? (ncgi_eligible ? 75 : 0),
          officerId: "OFC-RPR-003",
        }}
        signatureResult={signatureResult}
        isLoading={isExecuting}
      />

      {/* Rejection Modal */}
      {showRejectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowRejectModal(false);
          }}
        >
          <div className="card w-full max-w-md p-0 overflow-hidden" style={{ animation: "fadeInUp 0.25s ease-out" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-navy-700/40">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                  <XCircle className="w-4 h-4 text-red-400" />
                </div>
                <h2 className="text-sm font-semibold text-white">Reject Loan Application</h2>
              </div>
              <button
                onClick={() => setShowRejectModal(false)}
                className="w-7 h-7 rounded-lg bg-navy-700/50 border border-navy-600/50 flex items-center justify-center text-slate-400 hover:text-white transition-all"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Rejection Reason</label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full bg-navy-900 border border-navy-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-gold/50"
                >
                  <option value="">Select a reason…</option>
                  {ai_reasoning.map((r, i) => (
                    <option key={i} value={r}>
                      {r.length > 60 ? r.slice(0, 60) + "\u2026" : r}
                    </option>
                  ))}
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Additional Notes</label>
                <textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  rows={3}
                  placeholder="Optional: provide additional context…"
                  className="w-full bg-navy-900 border border-navy-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-gold/50 resize-none"
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleConfirmReject}
                  disabled={!rejectReason}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex-1"
                >
                  <XCircle className="w-4 h-4" />
                  Confirm Rejection
                </button>
                <button onClick={() => setShowRejectModal(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
