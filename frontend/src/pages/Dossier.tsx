import {
  FileText,
  Calendar,
  Store,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Minus,
  Lock,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
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
import { merchantData } from "../data/mockData";

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

export default function Dossier() {
  const { name, businessType, assessmentDate, status, score, dscrValues, avgDscr, interpretation, prompts } =
    merchantData;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-4 fade-in-up">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center">
            <FileText className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">AI Credit Dossier</h1>
            <p className="text-xs text-slate-400">
              Dossier ID: PHA-2026-0451
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge-green">
            <ShieldCheck className="w-3 h-3" />
            {status}
          </span>
        </div>
      </div>

      {/* Header summary card */}
      <section
        className="card p-5 fade-in-up"
        style={{ animationDelay: "0.05s" }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-navy-700 border border-navy-600 flex items-center justify-center shrink-0">
              <Store className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                Merchant
              </div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {name}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-navy-700 border border-navy-600 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                Business Type
              </div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {businessType}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-navy-700 border border-navy-600 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                Assessment Date
              </div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {assessmentDate}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Score + DSCR Chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Gauge */}
        <section
          className="card p-6 flex flex-col items-center justify-center lg:col-span-2 fade-in-up"
          style={{ animationDelay: "0.1s" }}
        >
          <CircularGauge score={score} />
          <p className="mt-5 text-xs text-slate-400 text-center leading-relaxed max-w-xs">
            {interpretation}
          </p>
        </section>

        {/* DSCR Chart */}
        <section
          className="card p-6 lg:col-span-3 fade-in-up"
          style={{ animationDelay: "0.15s" }}
        >
          <div className="flex items-start justify-between mb-1">
            <div>
              <h2 className="text-sm font-semibold text-white">
                Debt Service Coverage Ratio — 6 Month Trend
              </h2>
              <p className="text-[11px] text-slate-500 mt-1">
                Average DSCR:{" "}
                <span className="text-gold font-semibold">
                  {avgDscr.toFixed(2)}
                </span>{" "}
                — Indicates adequate debt servicing capacity
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
              <ArrowUpRight className="w-3 h-3" />
              <span className="font-semibold">+8.3%</span>
            </div>
          </div>

          <div className="mt-4" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dscrValues}
                barCategoryGap="30%"
              >
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
                  domain={[0.6, 2.0]}
                  ticks={[0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0]}
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
                  {dscrValues.map((entry, index) => (
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

      {/* AI Appraisal Cheat Sheet */}
      <section
        className="card fade-in-up"
        style={{ animationDelay: "0.2s" }}
      >
        <div className="px-6 py-5 border-b border-navy-700/40">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-gold" />
                AI Appraisal Cheat Sheet
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Recommended Interview Prompts — Generated by Phygital AI Engine
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-navy-700/50 px-2.5 py-1 rounded">
              <Lock className="w-3 h-3 text-emerald-500" />
              White-box explainability report
            </div>
          </div>
        </div>
        <div className="p-5 space-y-3">
          {prompts.map((prompt, i) => {
            const pCfg = priorityConfig[prompt.priority];
            const PIcon = pCfg.icon;
            return (
              <div
                key={prompt.id}
                className={`flex items-start gap-4 p-4 rounded-lg border transition-all duration-150 hover:bg-navy-700/20 ${pCfg.bg} ${pCfg.border}`}
              >
                {/* Number */}
                <div className="shrink-0 w-7 h-7 rounded-full bg-navy-800 border border-navy-600 flex items-center justify-center text-xs font-bold text-slate-400">
                  {i + 1}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white leading-relaxed">
                    {prompt.text}
                  </p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className={categoryColors[prompt.category] ?? "badge-gold"}>
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

      {/* Disclaimer */}
      <div
        className="text-center text-[11px] text-slate-600 leading-relaxed max-w-lg mx-auto pb-2 fade-in-up"
        style={{ animationDelay: "0.25s" }}
      >
        This dossier is AI-generated and must be reviewed by a qualified loan
        officer. All data is encrypted (AES-256) and processed in compliance
        with PDPA regulations. Raw inputs are purged after 72 hours.
      </div>
    </div>
  );
}
