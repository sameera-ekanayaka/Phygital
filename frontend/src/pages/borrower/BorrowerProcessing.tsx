import { useEffect, useState } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { Brain, CheckCircle2, Loader2, FileSearch, Receipt, Calculator } from "lucide-react";

interface ProcessingState {
  verificationCode: string;
  expiresAt: string;
}

interface Step {
  label: string;
  icon: typeof FileSearch;
  delay: number;
}

const STEPS: Step[] = [
  { label: "Extracting text from records...", icon: FileSearch, delay: 0 },
  { label: "Identifying transactions & categories...", icon: Receipt, delay: 1200 },
  { label: "Segregating expenses & calculating metrics...", icon: Calculator, delay: 2400 },
];

export default function BorrowerProcessing() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as ProcessingState | null;

  const [activeStep, setActiveStep] = useState(-1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Redirect if no state
  if (!state) return <Navigate to="/borrower/upload" replace />;

  useEffect(() => {
    const timers: number[] = [];

    // Activate each step sequentially
    STEPS.forEach((step, i) => {
      timers.push(
        window.setTimeout(() => {
          setActiveStep(i);
        }, step.delay),
      );

      // Mark as complete 800ms after activation (except last)
      if (i < STEPS.length - 1) {
        timers.push(
          window.setTimeout(() => {
            setCompletedSteps((prev) => new Set(prev).add(i));
          }, step.delay + 800),
        );
      }
    });

    // Mark last step complete and navigate to success
    const totalTime = 3500;
    timers.push(
      window.setTimeout(() => {
        setCompletedSteps((prev) => new Set(prev).add(STEPS.length - 1));
      }, totalTime - 400),
    );

    timers.push(
      window.setTimeout(() => {
        navigate("/borrower/success", { state });
      }, totalTime),
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh]">
      {/* Branding */}
      <div className="text-center mb-10 b-fade-in-up">
        <div className="w-16 h-16 rounded-2xl bg-teal/10 border border-teal/20 flex items-center justify-center mx-auto mb-4">
          <Brain className="w-8 h-8 text-teal" />
        </div>
        <h1 className="text-2xl font-bold text-warm-900 font-display">
          AI Processing Your Records
        </h1>
        <p className="mt-2 text-warm-600 text-sm">
          Please wait while we analyze your financial data
        </p>
      </div>

      {/* Steps */}
      <div className="w-full space-y-4 mb-10">
        {STEPS.map((step, i) => {
          const isComplete = completedSteps.has(i);
          const isActive = activeStep === i && !isComplete;
          const isPending = activeStep < i;
          const Icon = step.icon;

          return (
            <div
              key={i}
              className={`flex items-center gap-4 b-card px-5 py-4 transition-all duration-300 ${
                isPending ? "opacity-40" : "b-step-animate"
              }`}
              style={isPending ? {} : { animationDelay: `${i * 0.1}s` }}
            >
              {/* Icon */}
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300 ${
                  isComplete
                    ? "bg-teal/15 border border-teal/30"
                    : isActive
                      ? "bg-amber-50 border border-amber-200"
                      : "bg-cream-200 border border-cream-300"
                }`}
              >
                {isComplete ? (
                  <CheckCircle2 className="w-5 h-5 text-teal" />
                ) : isActive ? (
                  <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                ) : (
                  <Icon className="w-5 h-5 text-warm-600/50" />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-sm font-medium ${
                  isComplete
                    ? "text-teal"
                    : isActive
                      ? "text-warm-900"
                      : "text-warm-600/50"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mock AI insight */}
      <div className="b-card p-4 w-full b-fade-in-up" style={{ animationDelay: "0.3s" }}>
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <Brain className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div>
            <p className="text-[11px] text-warm-600/70 uppercase tracking-wider font-semibold mb-1">
              Processing Sample
            </p>
            <p className="text-sm text-warm-700 italic leading-relaxed font-handwritten text-base">
              "Ada harvest eken 50 kilos dunna Rs 15000. Lorry transport ekata Rs 2000 giya."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
