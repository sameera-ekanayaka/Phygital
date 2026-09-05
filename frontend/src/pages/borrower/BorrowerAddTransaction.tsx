import { useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Plus,
  ArrowLeft,
  Loader2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Camera,
  AlertCircle,
} from "lucide-react";
import {
  createTransaction,
  type TransactionCreateRequest,
} from "../../services/api";

type TxType = "business_revenue" | "business_expense" | "personal_expense";

const CATEGORIES: Record<TxType, { value: string; label: string }[]> = {
  business_revenue: [
    { value: "sales", label: "Sales" },
    { value: "services", label: "Services" },
    { value: "rent_income", label: "Rent Income" },
    { value: "commission", label: "Commission" },
    { value: "other", label: "Other" },
  ],
  business_expense: [
    { value: "inventory", label: "Inventory" },
    { value: "transport", label: "Transport" },
    { value: "utilities", label: "Utilities" },
    { value: "wages", label: "Wages" },
    { value: "rent", label: "Rent" },
    { value: "maintenance", label: "Maintenance" },
    { value: "other", label: "Other" },
  ],
  personal_expense: [
    { value: "food", label: "Food" },
    { value: "household", label: "Household" },
    { value: "education", label: "Education" },
    { value: "medical", label: "Medical" },
    { value: "clothing", label: "Clothing" },
    { value: "other", label: "Other" },
  ],
};

const TYPE_OPTIONS: {
  value: TxType;
  label: string;
  icon: typeof TrendingUp;
  activeClass: string;
  inactiveClass: string;
}[] = [
  {
    value: "business_revenue",
    label: "Revenue",
    icon: TrendingUp,
    activeClass:
      "border-green-600 bg-green-50 text-green-700 shadow-green-100",
    inactiveClass:
      "border-cream-300 bg-cream-50 text-warm-600 hover:border-green-300 hover:bg-green-50/40",
  },
  {
    value: "business_expense",
    label: "Business Expense",
    icon: TrendingDown,
    activeClass:
      "border-orange-500 bg-orange-50 text-orange-700 shadow-orange-100",
    inactiveClass:
      "border-cream-300 bg-cream-50 text-warm-600 hover:border-orange-300 hover:bg-orange-50/40",
  },
  {
    value: "personal_expense",
    label: "Personal Expense",
    icon: DollarSign,
    activeClass: "border-blue-600 bg-blue-50 text-blue-700 shadow-blue-100",
    inactiveClass:
      "border-cream-300 bg-cream-50 text-warm-600 hover:border-blue-300 hover:bg-blue-50/40",
  },
];

export default function BorrowerAddTransaction() {
  const navigate = useNavigate();

  const [txType, setTxType] = useState<TxType>("business_revenue");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTypeChange = useCallback((type: TxType) => {
    setTxType(type);
    setCategory(""); // reset category when type changes
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!amount || !category || submitting) return;

      setSubmitting(true);
      setError(null);

      const payload: TransactionCreateRequest = {
        amount: parseFloat(amount),
        transaction_type: txType,
        category,
        description: description.trim(),
      };

      try {
        await createTransaction(payload);
        navigate("/borrower/dashboard");
      } catch {
        setError(
          "Failed to save transaction. Please check your connection and try again.",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [amount, category, txType, description, submitting, navigate],
  );

  const canSubmit =
    amount.trim().length > 0 &&
    !isNaN(parseFloat(amount)) &&
    parseFloat(amount) > 0 &&
    category.length > 0 &&
    !submitting;

  const categories = CATEGORIES[txType];

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-6">
      {/* Back button + header */}
      <div className="b-fade-in-up">
        <button
          onClick={() => navigate("/borrower/dashboard")}
          className="inline-flex items-center gap-1.5 text-sm text-warm-600 hover:text-warm-900 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <h1 className="text-2xl md:text-3xl font-bold text-warm-900 font-display">
          Add Transaction
        </h1>
        <p className="mt-1 text-warm-600 text-sm md:text-base leading-relaxed">
          Record a new financial transaction
        </p>
      </div>

      {/* Error alert */}
      {error && (
        <div className="b-card p-4 border-red-200 bg-red-50 flex items-start gap-3 b-fade-in-up">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Form card */}
      <form onSubmit={handleSubmit}>
        <section
          className="b-card p-5 md:p-6 b-fade-in-up"
          style={{ animationDelay: "0.05s" }}
        >
          {/* Transaction type selector */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-warm-900 mb-3">
              Transaction Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = txType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleTypeChange(opt.value)}
                    disabled={submitting}
                    className={`relative flex flex-col items-center gap-2 p-2 sm:p-3 md:p-4 rounded-xl border-2 transition-all duration-200 ${
                      active ? opt.activeClass : opt.inactiveClass
                    } ${submitting ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs md:text-sm font-semibold text-center leading-tight break-words">
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-cream-300/60 my-6" />

          {/* Amount input */}
          <div className="mb-6">
            <label
              htmlFor="amount"
              className="block text-sm font-semibold text-warm-900 mb-2"
            >
              Amount
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-warm-500 pointer-events-none">
                LKR
              </span>
              <input
                id="amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={submitting}
                className="b-input pl-14 text-lg font-semibold tabular-nums disabled:opacity-50"
              />
            </div>
          </div>

          {/* Category dropdown */}
          <div className="mb-6">
            <label
              htmlFor="category"
              className="block text-sm font-semibold text-warm-900 mb-2"
            >
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={submitting}
              className="b-input appearance-none disabled:opacity-50"
            >
              <option value="" disabled>
                Select a category
              </option>
              {categories.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description textarea */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="description"
                className="text-sm font-semibold text-warm-900"
              >
                Description
              </label>
              <span className="text-[11px] text-warm-600/70">
                {description.length}/500
              </span>
            </div>
            <textarea
              id="description"
              value={description}
              onChange={(e) => {
                if (e.target.value.length <= 500)
                  setDescription(e.target.value);
              }}
              disabled={submitting}
              placeholder="Brief note about this transaction…"
              rows={3}
              className="b-input resize-none disabled:opacity-50"
            />
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="b-btn-primary w-full justify-center text-base px-6 py-3.5"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Transaction
              </>
            )}
          </button>
        </section>
      </form>

      {/* Link to upload page */}
      <div
        className="text-center b-fade-in-up"
        style={{ animationDelay: "0.1s" }}
      >
        <Link
          to="/borrower/upload"
          className="inline-flex items-center gap-2 text-sm font-medium text-teal hover:text-teal/80 transition-colors"
        >
          <Camera className="w-4 h-4" />
          Or upload photos/voice instead →
        </Link>
      </div>

      {/* Privacy note */}
      <p
        className="text-center text-[11px] text-warm-600/50 leading-relaxed max-w-md mx-auto pb-2 b-fade-in-up"
        style={{ animationDelay: "0.15s" }}
      >
        Your data is encrypted (AES-256) and automatically purged after 30 days
        in compliance with PDPA regulations.
      </p>
    </div>
  );
}
