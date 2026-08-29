import { useState } from "react";
import { ShieldCheck, ShieldOff, Info } from "lucide-react";

interface NCGIBadgeProps {
  eligible: boolean;
  coveragePercent: number; // 0, 75, or 80
  className?: string;
}

export default function NCGIBadge({ eligible, coveragePercent, className = "" }: NCGIBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const coverage = eligible ? coveragePercent || 75 : 0;
  const bankRisk = 100 - coverage;

  return (
    <section
      className={`card p-5 fade-in-up ${
        eligible ? "border-emerald-500/25" : "border-amber-500/25"
      } ${className}`}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            eligible
              ? "bg-emerald-500/10 border border-emerald-500/25"
              : "bg-amber-500/10 border border-amber-500/25"
          }`}
        >
          {eligible ? (
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          ) : (
            <ShieldOff className="w-6 h-6 text-amber-400" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">
              {eligible ? "NCGI Risk Guarantee Active" : "NCGI Guarantee: Not Eligible"}
            </h2>
            {/* Info tooltip */}
            <div className="relative">
              <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onFocus={() => setShowTooltip(true)}
                onBlur={() => setShowTooltip(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                aria-label="NCGI information"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
              {showTooltip && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-3 py-2 bg-navy-900 border border-navy-600 rounded-lg shadow-xl z-50">
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    National Credit Guarantee Institution covers{" "}
                    <span className="text-emerald-400 font-semibold">{coverage}%</span> of
                    default risk for qualifying informal MSMEs.
                  </p>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-navy-900 border-r border-b border-navy-600 rotate-45 -mt-1" />
                </div>
              )}
            </div>
          </div>

          {eligible ? (
            <>
              <p className="text-xs text-emerald-400/80 mt-1">
                {coverage}% Bank Risk Mitigated — Government Backed
              </p>

              {/* Progress bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                  <span>NCGI Coverage</span>
                  <span>Bank Risk: {bankRisk}%</span>
                </div>
                <div className="h-2.5 bg-navy-900/60 rounded-full overflow-hidden border border-navy-700/40">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
                    style={{ width: `${coverage}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] mt-1">
                  <span className="text-emerald-400 font-semibold">{coverage}% covered</span>
                  <span className="text-slate-500">{bankRisk}% retained</span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-amber-400/80 mt-1">
              DSCR below 1.25 threshold — does not qualify for government guarantee
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
