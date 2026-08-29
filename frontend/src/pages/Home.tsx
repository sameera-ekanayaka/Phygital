import { Link } from "react-router-dom";
import {
  ScanLine,
  ArrowRight,
  FileText,
  TrendingUp,
  Clock,
  Shield,
  Upload,
} from "lucide-react";
import { recentAssessments } from "../data/mockData";

const showMockData = import.meta.env.DEV;

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Welcome */}
      <section className="fade-in-up">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white">
              Welcome back, Officer Perera
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Phygital Credit Assessment — AI-powered SME loan appraisal
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-navy-800 px-3 py-1.5 rounded-lg border border-navy-700/50">
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            <span>All sessions encrypted</span>
          </div>
        </div>
      </section>

      {/* Action cards */}
      <section
        className="grid grid-cols-1 md:grid-cols-3 gap-4 fade-in-up"
        style={{ animationDelay: "0.1s" }}
      >
        <Link
          to="/scan"
          className="card p-6 group hover:border-gold/40 transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center">
              <ScanLine className="w-5 h-5 text-gold" />
            </div>
            <ArrowRight className="w-5 h-5 text-slate-600 group-hover:text-gold group-hover:translate-x-1 transition-all" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-white">
            Start New Assessment
          </h2>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Enter the merchant's verification code to retrieve the AI-generated
            credit dossier and appraisal cheat sheet.
          </p>
        </Link>

        <Link
          to="/dossier"
          className="card p-6 group hover:border-gold/40 transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-lg bg-teal/15 border border-teal/30 flex items-center justify-center">
              <FileText className="w-5 h-5 text-teal" />
            </div>
            <ArrowRight className="w-5 h-5 text-slate-600 group-hover:text-gold group-hover:translate-x-1 transition-all" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-white">
            View Latest Dossier
          </h2>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Review the most recent AI credit assessment report for Somchai's
            Noodle Shop.
          </p>
        </Link>

        <Link
          to="/upload"
          className="card p-6 group hover:border-gold/40 transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Upload className="w-5 h-5 text-emerald-400" />
            </div>
            <ArrowRight className="w-5 h-5 text-slate-600 group-hover:text-gold group-hover:translate-x-1 transition-all" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-white">
            Capture Merchant Data
          </h2>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Upload ledger photos, record voice notes, or type transaction details
            for AI-powered cash-flow analysis.
          </p>
        </Link>
      </section>

      {/* Stats strip */}
      <section
        className="grid grid-cols-3 gap-4 fade-in-up"
        style={{ animationDelay: "0.2s" }}
      >
        {[
          { label: "Assessments This Month", value: "14", icon: FileText, color: "text-teal" },
          { label: "Avg. Score", value: "68.3", icon: TrendingUp, color: "text-gold" },
          { label: "Avg. Processing Time", value: "4.2 min", icon: Clock, color: "text-emerald-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card px-4 py-4 flex items-center gap-3">
            <div className="shrink-0">
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <div className="text-xl font-bold text-white">{value}</div>
              <div className="text-[11px] text-slate-500">{label}</div>
            </div>
          </div>
        ))}
      </section>

      {/* Recent assessments */}
      {showMockData && (
      <section
        className="fade-in-up"
        style={{ animationDelay: "0.3s" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">
            Recent Assessments
          </h2>
          <button className="text-xs text-gold hover:text-gold-light transition-colors font-medium">
            View all
          </button>
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-700/50 text-left text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">Dossier ID</th>
                <th className="px-5 py-3 font-medium">Merchant</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium text-center">Score</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentAssessments.map((a, i) => (
                <tr
                  key={a.id}
                  className={`hover:bg-navy-700/20 transition-colors ${
                    i < recentAssessments.length - 1
                      ? "border-b border-navy-700/30"
                      : ""
                  }`}
                >
                  <td className="px-5 py-3.5 font-mono text-xs text-slate-400">
                    {a.id}
                  </td>
                  <td className="px-5 py-3.5 text-white font-medium">
                    {a.merchant}
                  </td>
                  <td className="px-5 py-3.5 text-slate-400">{a.date}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span
                      className={`font-semibold ${
                        a.score >= 70
                          ? "text-emerald-400"
                          : a.score >= 40
                          ? "text-amber-400"
                          : "text-red-400"
                      }`}
                    >
                      {a.score}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    {a.status === "Complete" ? (
                      <span className="badge-green">Complete</span>
                    ) : (
                      <span className="badge-gold">Under Review</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </div>
  );
}
