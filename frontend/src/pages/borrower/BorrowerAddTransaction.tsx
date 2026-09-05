import { useState, useRef, useCallback, useEffect, type DragEvent, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  ArrowLeft,
  Loader2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Camera,
  Mic,
  FileText,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Upload,
  X,
  Square,
} from "lucide-react";
import {
  createTransaction,
  uploadFiles,
  type TransactionCreateRequest,
  type IngestResponse,
} from "../../services/api";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { validateAmount, validateDescription } from "../../utils/validation";

type Mode = "ai_capture" | "manual";
type TxType = "business_revenue" | "business_expense" | "personal_expense";

const MAX_IMAGES = 10;
const MAX_FILE_SIZE_MB = 10;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const CATEGORIES: Record<TxType, { value: string; label: string }[]> = {
  business_revenue: [
    { value: "sales", label: "Sales / Retail" },
    { value: "wholesale", label: "Wholesale" },
    { value: "services", label: "Services" },
    { value: "agricultural_sale", label: "Agricultural / Harvest" },
    { value: "rent_income", label: "Rent Income" },
    { value: "commission", label: "Commission" },
    { value: "other", label: "Other Revenue" },
  ],
  business_expense: [
    { value: "inventory", label: "Inventory / Stock" },
    { value: "transport", label: "Transport / Lorry Hire" },
    { value: "utilities", label: "Electricity / Water / Telco" },
    { value: "wages", label: "Wages / Labor" },
    { value: "rent", label: "Shop / Premises Rent" },
    { value: "maintenance", label: "Maintenance" },
    { value: "other", label: "Other Expense" },
  ],
  personal_expense: [
    { value: "household", label: "Household / Groceries" },
    { value: "education", label: "Education / School" },
    { value: "medical", label: "Medical / Healthcare" },
    { value: "clothing", label: "Clothing" },
    { value: "welfare", label: "Samurdhi / Welfare Deposit" },
    { value: "other", label: "Other Personal" },
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
    activeClass: "border-emerald-600 bg-emerald-50/90 text-emerald-800 shadow-sm ring-1 ring-emerald-600/30",
    inactiveClass: "border-cream-300 bg-cream-50/80 text-warm-700 hover:border-emerald-400 hover:bg-emerald-50/40",
  },
  {
    value: "business_expense",
    label: "Business Expense",
    icon: TrendingDown,
    activeClass: "border-amber-600 bg-amber-50/90 text-amber-900 shadow-sm ring-1 ring-amber-600/30",
    inactiveClass: "border-cream-300 bg-cream-50/80 text-warm-700 hover:border-amber-400 hover:bg-amber-50/40",
  },
  {
    value: "personal_expense",
    label: "Personal Expense",
    icon: DollarSign,
    activeClass: "border-warm-700 bg-cream-200/90 text-warm-900 shadow-sm ring-1 ring-warm-700/30",
    inactiveClass: "border-cream-300 bg-cream-50/80 text-warm-700 hover:border-warm-400 hover:bg-cream-100",
  },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function BorrowerAddTransaction() {
  const navigate = useNavigate();

  // Mode: AI Multimodal Capture vs Manual Entry
  const [mode, setMode] = useState<Mode>("ai_capture");

  // Manual Form State
  const [txType, setTxType] = useState<TxType>("business_revenue");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");

  // AI Multimodal State
  const [images, setImages] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [audioClips, setAudioClips] = useState<Blob[]>([]);
  const [notes, setNotes] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Common UI State
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ amount?: string; category?: string; description?: string }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const {
    status: recStatus,
    audioBlob,
    duration,
    startRecording,
    stopRecording,
    reset: resetRecorder,
  } = useVoiceRecorder();

  // Handle Voice Recording Completion
  useEffect(() => {
    if (audioBlob && recStatus === "stopped") {
      setAudioClips((prev) => [...prev, audioBlob]);
      resetRecorder();
    }
  }, [audioBlob, recStatus, resetRecorder]);

  // Image Upload Handlers
  const addImages = useCallback(
    (files: FileList | File[]) => {
      setError(null);
      const maxSize = MAX_FILE_SIZE_MB * 1024 * 1024;
      const accepted = Array.from(files).filter((f) => ACCEPTED_TYPES.includes(f.type));
      const valid: File[] = [];
      const oversized: string[] = [];

      for (const f of accepted) {
        if (f.size > maxSize) {
          oversized.push(f.name);
        } else {
          valid.push(f);
        }
      }

      if (oversized.length > 0) {
        setError(`File '${oversized[0]}' exceeds ${MAX_FILE_SIZE_MB} MB limit.`);
      }

      const remaining = MAX_IMAGES - images.length;
      if (valid.length > remaining) {
        setError(`Maximum ${MAX_IMAGES} images allowed.`);
        if (remaining <= 0) return;
        valid.splice(remaining);
      }

      if (valid.length === 0) return;
      const urls = valid.map((f) => URL.createObjectURL(f));
      setImages((prev) => [...prev, ...valid]);
      setImageUrls((prev) => [...prev, ...urls]);
    },
    [images.length],
  );

  const removeImage = useCallback((index: number) => {
    setImageUrls((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      if (submitting) return;
      if (e.dataTransfer.files.length) addImages(e.dataTransfer.files);
    },
    [addImages, submitting],
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) addImages(e.target.files);
      e.target.value = "";
    },
    [addImages],
  );

  const handleTypeChange = useCallback((type: TxType) => {
    setTxType(type);
    setCategory("");
  }, []);

  /* ── Multimodal AI Submit Handler ────────────────────────────────── */
  const handleAiSubmit = useCallback(async () => {
    if (images.length === 0 && audioClips.length === 0 && notes.trim().length === 0) {
      setError("Please record audio, upload a ledger photo, or enter notes.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setStatusMessage("Transcribing & analyzing with AI engine…");

    const allFiles: (File | Blob)[] = [
      ...images,
      ...audioClips.map((blob, i) =>
        Object.assign(blob, { name: `voice_clip_${i + 1}.webm` }),
      ) as File[],
    ];

    try {
      const response: IngestResponse = await uploadFiles(
        allFiles,
        notes.trim(),
        (percent) => setUploadProgress(percent),
      );

      setStatusMessage("Saving extracted cash-flow line items…");

      // Extract and ensure all individual transactions are saved
      const extractedList = response.ai_extraction?.transactions || [];
      const structured = response.structured_data;

      // If explicit transactions are present from Day-2 pipeline
      if (extractedList && extractedList.length > 0) {
        for (const item of extractedList) {
          try {
            await createTransaction({
              amount: item.amount,
              transaction_type: item.transaction_type,
              category: item.category || "sales",
              description: item.description || "AI Extracted Transaction",
            });
          } catch {
            // Already appended on backend hook; continue gracefully
          }
        }
      } else if (structured) {
        // Or extract from structured_data
        const itemsToSave: TransactionCreateRequest[] = [];
        structured.business_revenue?.forEach((r) =>
          itemsToSave.push({
            amount: r.amount,
            transaction_type: "business_revenue",
            category: r.category || "sales",
            description: r.description || "Revenue item",
          }),
        );
        structured.business_expense?.forEach((e) =>
          itemsToSave.push({
            amount: e.amount,
            transaction_type: "business_expense",
            category: e.category || "inventory",
            description: e.description || "Expense item",
          }),
        );
        structured.personal_expense?.forEach((p) =>
          itemsToSave.push({
            amount: p.amount,
            transaction_type: "personal_expense",
            category: p.category || "household",
            description: p.description || "Personal item",
          }),
        );

        for (const item of itemsToSave) {
          try {
            await createTransaction(item);
          } catch {
            // Already appended on backend hook; continue gracefully
          }
        }
      }

      setStatusMessage("Transactions recorded! Redirecting to dashboard…");
      setTimeout(() => {
        navigate("/borrower/dashboard");
      }, 600);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Failed to process and save transactions. Please try again.",
      );
      setSubmitting(false);
      setStatusMessage(null);
    }
  }, [images, audioClips, notes, navigate]);

  /* ── Manual Submit Handler ───────────────────────────────────────── */
  const handleManualSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;

      const amtVal = validateAmount(amount);
      const descVal = validateDescription(description);
      const errors: { amount?: string; category?: string; description?: string } = {};

      if (!amtVal.isValid) {
        errors.amount = amtVal.error;
      }
      if (!category) {
        errors.category = "Please select a category.";
      }
      if (!descVal.isValid) {
        errors.description = descVal.error;
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setError("Please correct the highlighted fields before saving.");
        return;
      }

      setSubmitting(true);
      setError(null);
      setFieldErrors({});
      setStatusMessage("Saving transaction…");

      const payload: TransactionCreateRequest = {
        amount: amtVal.data ?? parseFloat(amount),
        transaction_type: txType,
        category,
        description: description.trim(),
      };

      try {
        await createTransaction(payload);
        setStatusMessage("Transaction added! Redirecting…");
        setTimeout(() => {
          navigate("/borrower/dashboard");
        }, 500);
      } catch (err: any) {
        setError(
          err?.response?.data?.detail ||
            "Failed to save transaction. Please check your connection and try again.",
        );
        setSubmitting(false);
        setStatusMessage(null);
      }
    },
    [amount, category, txType, description, submitting, navigate],
  );

  const canManualSubmit =
    amount.trim().length > 0 &&
    validateAmount(amount).isValid &&
    category.length > 0 &&
    validateDescription(description).isValid &&
    !submitting;

  const canAiSubmit =
    (images.length > 0 || audioClips.length > 0 || notes.trim().length > 0) && !submitting;

  const categories = CATEGORIES[txType];

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      {/* Back button + Header */}
      <div className="b-fade-in-up">
        <button
          onClick={() => navigate("/borrower/dashboard")}
          className="inline-flex items-center gap-1.5 text-sm text-warm-600 hover:text-warm-900 transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <h1 className="text-2xl md:text-3xl font-bold text-warm-900 font-display">
          Add Financial Record
        </h1>
        <p className="mt-1 text-warm-600 text-sm leading-relaxed">
          Record cash flows using AI multimodal capture or manual line-item entry
        </p>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="grid grid-cols-2 gap-2 p-1.5 bg-cream-200/70 rounded-xl border border-cream-300 b-fade-in-up" style={{ animationDelay: "0.05s" }}>
        <button
          type="button"
          onClick={() => setMode("ai_capture")}
          className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
            mode === "ai_capture"
              ? "bg-teal text-white shadow-md shadow-teal/15"
              : "text-warm-700 hover:bg-cream-100"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          AI Smart Capture
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
            mode === "manual"
              ? "bg-teal text-white shadow-md shadow-teal/15"
              : "text-warm-700 hover:bg-cream-100"
          }`}
        >
          <Plus className="w-4 h-4" />
          Manual Entry
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="b-card p-4 border-red-200 bg-red-50 flex items-start gap-3 b-fade-in-up">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Status / Success Banner */}
      {statusMessage && (
        <div className="b-card p-4 border-teal/30 bg-teal/10 flex items-center gap-3 b-fade-in-up">
          <CheckCircle2 className="w-5 h-5 text-teal shrink-0 animate-pulse" />
          <p className="text-sm font-medium text-warm-900">{statusMessage}</p>
        </div>
      )}

      {/* ── Mode 1: AI Multimodal Capture ─────────────────────────────── */}
      {mode === "ai_capture" ? (
        <section className="b-card p-5 md:p-6 space-y-6 b-fade-in-up" style={{ animationDelay: "0.1s" }}>
          {/* 1. Voice Note Recording */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gold/15 flex items-center justify-center">
                  <Mic className="w-4 h-4 text-gold" />
                </div>
                <h2 className="text-sm font-semibold text-warm-900">Voice Note (Sinhala / Tamil / English)</h2>
              </div>
              {audioClips.length > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal/15 text-teal">
                  {audioClips.length} clip{audioClips.length > 1 ? "s" : ""} recorded
                </span>
              )}
            </div>

            <div className="p-4 rounded-xl border border-cream-300 bg-cream-50 flex flex-col items-center text-center gap-3">
              {recStatus === "recording" ? (
                <div className="flex flex-col items-center gap-3 w-full py-2">
                  <div className="flex items-center gap-2 text-red-600 font-semibold animate-pulse text-sm">
                    <span className="w-3 h-3 rounded-full bg-red-600" />
                    Recording in progress… ({formatTime(duration)})
                  </div>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors shadow-md shadow-red-200"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    Stop & Save Voice Note
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 w-full">
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold/20 text-warm-900 border border-gold/40 hover:bg-gold/30 font-medium transition-colors"
                  >
                    <Mic className="w-4 h-4 text-gold" />
                    {audioClips.length > 0 ? "Record Another Voice Note" : "Hold or Tap to Record Voice"}
                  </button>
                  <p className="text-[11px] text-warm-600/70">
                    Speak your daily earnings, transport fares, or inventory purchases naturally.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-cream-300/60" />

          {/* 2. Photo / Ledger Upload */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-teal/10 flex items-center justify-center">
                  <Camera className="w-4 h-4 text-teal" />
                </div>
                <h2 className="text-sm font-semibold text-warm-900">Ledger Photos & Receipts</h2>
              </div>
              <span className="text-[11px] text-warm-600/70">{images.length}/{MAX_IMAGES}</span>
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                dragging
                  ? "border-teal bg-teal/5"
                  : "border-cream-300 hover:border-teal/50 bg-cream-50/50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_TYPES.join(",")}
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="w-6 h-6 text-warm-500 mx-auto mb-2" />
              <p className="text-xs font-semibold text-warm-800">
                Drop ledger photos here or <span className="text-teal underline">browse</span>
              </p>
              <p className="text-[11px] text-warm-500 mt-1">
                Supports handwritten *Potha* ledgers, paper invoices, receipts (JPEG, PNG, WebP)
              </p>
            </div>

            {/* Camera Quick Button for Mobile */}
            <div className="mt-2 text-right">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal hover:underline"
              >
                <Camera className="w-3.5 h-3.5" />
                Take photo directly with camera
              </button>
            </div>

            {/* Image Thumbnails */}
            {images.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3">
                {imageUrls.map((url, idx) => (
                  <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border border-cream-300 bg-cream-100">
                    <img src={url} alt={`Ledger ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-navy-900/80 text-white flex items-center justify-center opacity-90 hover:opacity-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-cream-300/60" />

          {/* 3. Text Notes */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-warm-200 flex items-center justify-center">
                <FileText className="w-4 h-4 text-warm-700" />
              </div>
              <h2 className="text-sm font-semibold text-warm-900">Optional Text Notes / Breakdown</h2>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Rice sales Rs. 45,000, Lorry hire Rs. 3,500, Electricity bill Rs. 2,100..."
              rows={2}
              className="b-input text-sm resize-none"
            />
          </div>

          {/* AI Submit Button */}
          <button
            type="button"
            onClick={handleAiSubmit}
            disabled={!canAiSubmit}
            className="w-full b-btn-primary justify-center text-base px-6 py-3.5"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {uploadProgress > 0 && uploadProgress < 100
                  ? `Uploading (${uploadProgress}%)…`
                  : "AI Processing & Saving…"}
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 shrink-0" />
                Scan & Save with AI
              </>
            )}
          </button>
        </section>
      ) : (
        /* ── Mode 2: Quick Manual Entry Form ────────────────────────────── */
        <form onSubmit={handleManualSubmit}>
          <section className="b-card p-5 md:p-6 space-y-6 b-fade-in-up" style={{ animationDelay: "0.1s" }}>
            {/* Transaction Type */}
            <div>
              <label className="block text-sm font-semibold text-warm-900 mb-3">
                Transaction Type
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {TYPE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = txType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleTypeChange(opt.value)}
                      disabled={submitting}
                      className={`relative flex sm:flex-col items-center justify-center gap-2.5 p-3 sm:p-4 rounded-xl border-2 transition-all duration-200 ${
                        active ? opt.activeClass : opt.inactiveClass
                      } ${submitting ? "opacity-50 pointer-events-none" : ""}`}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="text-xs sm:text-sm font-semibold text-center leading-tight">
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-cream-300/60" />

            {/* Amount */}
            <div>
              <label htmlFor="amount" className="block text-sm font-semibold text-warm-900 mb-2">
                Amount
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none select-none">
                  <span className="text-xs font-bold text-warm-700 bg-cream-200/90 px-2 py-1 rounded-md border border-cream-300/80 tracking-wider shadow-sm">
                    LKR
                  </span>
                </div>
                <input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    if (fieldErrors.amount) setFieldErrors((prev) => ({ ...prev, amount: undefined }));
                  }}
                  disabled={submitting}
                  className={`b-input b-input--currency !pl-20 text-lg font-bold tabular-nums text-warm-900 placeholder-warm-400 disabled:opacity-50 ${
                    fieldErrors.amount ? "border-red-500 ring-1 ring-red-500/20" : ""
                  }`}
                  required
                />
              </div>
              {fieldErrors.amount && (
                <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {fieldErrors.amount}
                </p>
              )}
            </div>

            {/* Category */}
            <div>
              <label htmlFor="category" className="block text-sm font-semibold text-warm-900 mb-2">
                Category
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  if (fieldErrors.category) setFieldErrors((prev) => ({ ...prev, category: undefined }));
                }}
                disabled={submitting}
                className={`b-input appearance-none disabled:opacity-50 ${
                  fieldErrors.category ? "border-red-500 ring-1 ring-red-500/20" : ""
                }`}
                required
              >
                <option value="" disabled>
                  Select category…
                </option>
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
              {fieldErrors.category && (
                <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {fieldErrors.category}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="description" className="text-sm font-semibold text-warm-900">
                  Description / Item Detail
                </label>
                <span className="text-[11px] text-warm-600/70">{description.length}/500</span>
              </div>
              <textarea
                id="description"
                value={description}
                onChange={(e) => {
                  if (e.target.value.length <= 500) {
                    setDescription(e.target.value);
                    if (fieldErrors.description) setFieldErrors((prev) => ({ ...prev, description: undefined }));
                  }
                }}
                disabled={submitting}
                placeholder="e.g. Sales of dry goods to local retail shop"
                rows={3}
                className={`b-input resize-none disabled:opacity-50 ${
                  fieldErrors.description ? "border-red-500 ring-1 ring-red-500/20" : ""
                }`}
              />
              {fieldErrors.description && (
                <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {fieldErrors.description}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!canManualSubmit}
              className="w-full b-btn-primary justify-center text-base px-6 py-3.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5 shrink-0" />
                  Save Transaction
                </>
              )}
            </button>
          </section>
        </form>
      )}

      {/* Privacy Note */}
      <p className="text-center text-[11px] text-warm-600/50 leading-relaxed max-w-md mx-auto b-fade-in-up" style={{ animationDelay: "0.2s" }}>
        Protected under Sri Lanka Personal Data Protection Act No. 9 of 2022. All financial records are encrypted with AES-256 and auto-purged per data minimization policies.
      </p>
    </div>
  );
}
