interface CircularGaugeProps {
  score: number;
  maxScore?: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

export default function CircularGauge({
  score,
  maxScore = 100,
  size = 180,
  strokeWidth = 14,
  label = "Cash-Flow Health Score",
}: CircularGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = score / maxScore;
  const offset = circumference * (1 - progress);

  const color =
    score >= 70
      ? { stroke: "#10b981", text: "text-emerald-400", bg: "bg-emerald-500/10" }
      : score >= 40
      ? { stroke: "#f59e0b", text: "text-amber-400", bg: "bg-amber-500/10" }
      : { stroke: "#ef4444", text: "text-red-400", bg: "bg-red-500/10" };

  const statusLabel =
    score >= 70 ? "Good" : score >= 40 ? "Moderate" : "At Risk";

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
          aria-label={`${label}: ${score} out of ${maxScore}`}
        >
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(51,65,85,0.5)"
            strokeWidth={strokeWidth}
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color.stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="gauge-animate"
            style={{ filter: `drop-shadow(0 0 6px ${color.stroke}80)` }}
          />
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold ${color.text}`}>{score}</span>
          <span className="text-xs text-slate-500 font-medium">/ {maxScore}</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div
          className={`mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${color.bg} ${color.text} border`}
          style={{ borderColor: `${color.stroke}40` }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: color.stroke }}
          />
          {statusLabel}
        </div>
      </div>
    </div>
  );
}
