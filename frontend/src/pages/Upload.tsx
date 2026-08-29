/**
 * Upload page — Merchant data capture interface.
 * Allows merchants to upload ledger photos, record voice notes,
 * and type transaction details for AI processing.
 * Fully wired to the Phygital backend via Axios.
 */
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type DragEvent,
  type ChangeEvent,
} from "react";
import {
  Camera,
  Mic,
  FileText,
  Send,
  X,
  CheckCircle,
  AlertCircle,
  Upload as UploadIcon,
  Loader2,
  Square,
  Trash2,
  QrCode,
  Timer,
  Edit3,
  Save,
  RefreshCw,
  Info,
} from "lucide-react";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import {
  uploadFiles,
  generateQR,
  type IngestResponse,
  type QrGenerateResponse,
  type TransactionItem,
} from "../services/api";
import axios from "axios";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type PageStatus = "idle" | "loading" | "success" | "error";

interface EditableTransaction {
  id: string;
  description: string;
  category: string;
  amount: number;
  confidence: number;
  group: "business_revenue" | "business_expense" | "personal_expense";
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

interface ProcessingStep {
  en: string;
  ta: string;
  si: string;
}

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */
const MAX_IMAGES = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const PROCESSING_STEPS: Record<string, ProcessingStep> = {
  ocr: {
    en: "Analyzing ledger with OCR...",
    ta: "OCR மூலம் பேரேடு பகுப்பாய்வு...",
    si: "OCR සමඟ ලෙජරය විශ්ලේෂණය...",
  },
  voice: {
    en: "Transcribing voice note...",
    ta: "குரல் குறிப்பை படியெடுத்தல்...",
    si: "හඬ සටහන පිටපත් කිරීම...",
  },
  calculate: {
    en: "Calculating cash-flow statement...",
    ta: "பணப்புழக்க அறிக்கை கணக்கிடுதல்...",
    si: "මුදල් ප්‍රවාහ ප්‍රකාශය ගණනය...",
  },
};

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00:00";
  const h = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const m = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (err.code === "ECONNABORTED") return "Request timed out. Server may be unreachable.";
    if (!err.response) return "Backend is unreachable. Please check your connection.";
    return `Server error ${err.response.status}`;
  }
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

let toastIdCounter = 0;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function Upload() {
  /* --- core state --- */
  const [images, setImages] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [audioClips, setAudioClips] = useState<Blob[]>([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<PageStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  /* --- API integration state --- */
  const [processingStep, setProcessingStep] = useState<ProcessingStep | null>(null);
  const [editableTransactions, setEditableTransactions] = useState<EditableTransaction[]>([]);
  const [ingestResponse, setIngestResponse] = useState<IngestResponse | null>(null);
  const [qrData, setQrData] = useState<QrGenerateResponse | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(0);
  const [qrLoading, setQrLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  /* voice recorder hook */
  const {
    status: recStatus,
    audioBlob,
    duration,
    startRecording,
    stopRecording,
    reset: resetRecorder,
  } = useVoiceRecorder();

  /* drag state */
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDisabled = status === "loading";

  /* --- toast helpers --- */
  const addToast = useCallback((message: string, type: Toast["type"]) => {
    const id = `toast-${++toastIdCounter}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /* --- image handlers --- */
  const addImages = useCallback(
    (files: FileList | File[]) => {
      setImageError(null);
      const incoming = Array.from(files).filter((f) =>
        ACCEPTED_TYPES.includes(f.type),
      );
      const remaining = MAX_IMAGES - images.length;
      if (incoming.length > remaining) {
        setImageError(`Maximum ${MAX_IMAGES} images allowed.`);
        addToast(`Maximum ${MAX_IMAGES} images allowed.`, "error");
        return;
      }
      const urls = incoming.map((f) => URL.createObjectURL(f));
      setImages((prev) => [...prev, ...incoming]);
      setImageUrls((prev) => [...prev, ...urls]);
    },
    [images.length, addToast],
  );

  const removeImage = useCallback((index: number) => {
    setImageUrls((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImageError(null);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      if (isDisabled) return;
      if (e.dataTransfer.files.length) addImages(e.dataTransfer.files);
    },
    [addImages, isDisabled],
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) addImages(e.target.files);
      e.target.value = "";
    },
    [addImages],
  );

  /* --- audio handlers --- */
  const addAudioClip = useCallback(() => {
    if (audioBlob) {
      setAudioClips((prev) => [...prev, audioBlob]);
      resetRecorder();
    }
  }, [audioBlob, resetRecorder]);

  const removeAudioClip = useCallback((index: number) => {
    setAudioClips((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /* --- build editable transactions from response --- */
  const buildEditableTransactions = useCallback(
    (resp: IngestResponse): EditableTransaction[] => {
      const sd = resp.structured_data;
      if (!sd) return [];
      const txs: EditableTransaction[] = [];
      let idx = 0;

      const mapGroup = (
        items: TransactionItem[],
        group: EditableTransaction["group"],
      ) => {
        items.forEach((item) => {
          txs.push({
            id: `tx-${idx++}`,
            description: item.description,
            category: item.category,
            amount: item.amount,
            confidence: item.source_confidence,
            group,
          });
        });
      };

      mapGroup(sd.business_revenue, "business_revenue");
      mapGroup(sd.business_expense, "business_expense");
      mapGroup(sd.personal_expense, "personal_expense");
      return txs;
    },
    [],
  );

  /* --- editable transaction handlers --- */
  const updateTransaction = useCallback(
    (id: string, field: keyof EditableTransaction, value: string | number) => {
      setEditableTransactions((prev) =>
        prev.map((tx) => (tx.id === id ? { ...tx, [field]: value } : tx)),
      );
    },
    [],
  );

  /* --- submit --- */
  const canSubmit =
    (images.length > 0 || audioClips.length > 0 || notes.trim().length > 0) &&
    status !== "loading";

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setStatus("loading");
    setErrorMessage("");

    // Determine processing step based on content
    if (images.length > 0) {
      setProcessingStep(PROCESSING_STEPS.ocr);
    } else if (audioClips.length > 0) {
      setProcessingStep(PROCESSING_STEPS.voice);
    } else {
      setProcessingStep(PROCESSING_STEPS.calculate);
    }

    // Build files array
    const allFiles: (File | Blob)[] = [
      ...images,
      ...audioClips.map((blob, i) =>
        Object.assign(blob, { name: `voice_clip_${i + 1}.webm` }),
      ) as File[],
    ];

    try {
      // Step 1: Upload/ingest
      const resp = await uploadFiles(allFiles, notes.trim());

      // Transition to calculation step
      setProcessingStep(PROCESSING_STEPS.calculate);

      setIngestResponse(resp);
      setEditableTransactions(buildEditableTransactions(resp));
      setStatus("success");
      addToast("Processing complete! Review your transactions below.", "success");
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      setErrorMessage(msg);
      setStatus("error");
      addToast(`Upload failed: ${msg}`, "error");
    } finally {
      setProcessingStep(null);
    }
  }, [canSubmit, images, audioClips, notes, addToast, buildEditableTransactions]);

  /* --- QR generation --- */
  const handleGenerateQR = useCallback(async () => {
    if (!ingestResponse?.request_id) return;
    setQrLoading(true);

    try {
      const qr = await generateQR(ingestResponse.request_id, 4320);
      setQrData(qr);
      setShowQrModal(true);

      // Calculate countdown
      const expiryMs = new Date(qr.expires_at).getTime();
      const nowMs = Date.now();
      setQrCountdown(Math.max(0, Math.floor((expiryMs - nowMs) / 1000)));

      addToast("Cryptographic QR code generated successfully!", "success");
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      addToast(`QR generation failed: ${msg}`, "error");
    } finally {
      setQrLoading(false);
    }
  }, [ingestResponse, addToast]);

  /* --- QR countdown timer --- */
  useEffect(() => {
    if (!showQrModal || qrCountdown <= 0) return;
    const interval = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [showQrModal, qrCountdown]);

  /* --- reset --- */
  const handleReset = useCallback(() => {
    imageUrls.forEach((u) => URL.revokeObjectURL(u));
    setImages([]);
    setImageUrls([]);
    setImageError(null);
    setAudioClips([]);
    setNotes("");
    setIngestResponse(null);
    setEditableTransactions([]);
    setQrData(null);
    setShowQrModal(false);
    setQrCountdown(0);
    setErrorMessage("");
    setStatus("idle");
    setIsEditing(false);
    resetRecorder();
  }, [imageUrls, resetRecorder]);

  /* ================================================================ */
  /*  Render — Toast Container                                         */
  /* ================================================================ */
  const renderToasts = () => (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const colors =
          toast.type === "success"
            ? "bg-emerald-900/90 border-emerald-500/40 text-emerald-300"
            : toast.type === "error"
              ? "bg-red-900/90 border-red-500/40 text-red-300"
              : "bg-navy-800/90 border-gold/40 text-gold";
        const Icon =
          toast.type === "success"
            ? CheckCircle
            : toast.type === "error"
              ? AlertCircle
              : Info;
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-2 px-4 py-3 rounded-lg border backdrop-blur-sm ${colors} fade-in-up`}
          >
            <Icon className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="text-xs font-medium flex-1">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );

  /* ================================================================ */
  /*  Render — QR Modal                                                */
  /* ================================================================ */
  const renderQrModal = () => {
    if (!showQrModal || !qrData) return null;
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-navy-900/80 backdrop-blur-sm">
        <div className="card max-w-md w-full mx-4 p-6 space-y-5 fade-in-up">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-gold" />
              <h2 className="text-base font-bold text-white">
                Cryptographic QR Code
              </h2>
            </div>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-8 h-8 rounded-lg bg-navy-700 border border-navy-600 flex items-center justify-center hover:bg-navy-600 transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* QR Image */}
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-xl">
              <img
                src={`data:image/png;base64,${qrData.qr_code_base64}`}
                alt="QR Code"
                className="w-48 h-48"
              />
            </div>
          </div>

          {/* Verify URL */}
          <div className="space-y-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
              Verify URL
            </p>
            <p className="text-xs text-slate-300 bg-navy-700 rounded-lg px-3 py-2 break-all font-mono">
              {qrData.verify_url}
            </p>
          </div>

          {/* Countdown */}
          <div className="flex items-center gap-3 bg-navy-700/60 rounded-lg px-4 py-3 border border-navy-600/40">
            <Timer className="w-5 h-5 text-gold shrink-0" />
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                Expires in
              </p>
              <p className="text-lg font-mono font-bold text-gold tabular-nums">
                {formatCountdown(qrCountdown)}
              </p>
            </div>
          </div>

          {/* Token */}
          <div className="space-y-1">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
              Verification Token
            </p>
            <p className="text-[10px] text-slate-400 bg-navy-700 rounded-lg px-3 py-2 break-all font-mono">
              {qrData.token}
            </p>
          </div>

          <button
            onClick={() => setShowQrModal(false)}
            className="btn-primary w-full justify-center"
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  Render — Success View (Editable Table)                           */
  /* ================================================================ */
  if (status === "success" && ingestResponse) {
    const sd = ingestResponse.structured_data;

    /* Group transactions for display */
    const grouped = {
      business_revenue: editableTransactions.filter(
        (t) => t.group === "business_revenue",
      ),
      business_expense: editableTransactions.filter(
        (t) => t.group === "business_expense",
      ),
      personal_expense: editableTransactions.filter(
        (t) => t.group === "personal_expense",
      ),
    };

    const sectionConfig = [
      {
        key: "business_revenue" as const,
        title: "Business Revenue",
        badge: "badge-green",
        color: "emerald",
      },
      {
        key: "business_expense" as const,
        title: "Business Expenses",
        badge: "badge-red",
        color: "red",
      },
      {
        key: "personal_expense" as const,
        title: "Personal Expenses",
        badge: "badge-gold",
        color: "amber",
      },
    ];

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {renderToasts()}
        {renderQrModal()}

        {/* Header */}
        <div className="flex items-center justify-between fade-in-up">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">
                Processing Complete
              </h1>
              <p className="text-xs text-slate-400">
                Review and edit extracted transactions below
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              isEditing
                ? "bg-gold/15 border-gold/30 text-gold hover:bg-gold/25"
                : "bg-navy-700 border-navy-600 text-slate-400 hover:bg-navy-600 hover:text-white"
            }`}
          >
            {isEditing ? (
              <>
                <Save className="w-4 h-4" />
                Done Editing
              </>
            ) : (
              <>
                <Edit3 className="w-4 h-4" />
                Edit
              </>
            )}
          </button>
        </div>

        {/* Summary card */}
        <section
          className="card p-5 fade-in-up"
          style={{ animationDelay: "0.05s" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { label: "Business Name", value: sd?.business_name || "N/A" },
              { label: "Period", value: sd?.period || "N/A" },
              { label: "Currency", value: sd?.currency || "LKR" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-navy-700 border border-navy-600 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-slate-400" />
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                    {item.label}
                  </div>
                  <div className="text-sm font-semibold text-white mt-0.5">
                    {item.value}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Overall confidence */}
          {sd && (
            <div className="mt-4 pt-4 border-t border-navy-700/40">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                  Overall Extraction Confidence
                </span>
                <span className="text-sm font-bold text-gold">
                  {Math.round(sd.overall_confidence * 100)}%
                </span>
              </div>
              <div className="mt-2 h-2 bg-navy-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gold/60 to-gold rounded-full transition-all duration-700"
                  style={{ width: `${sd.overall_confidence * 100}%` }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Transaction sections */}
        {sectionConfig.map(({ key, title, badge }) => {
          const items = grouped[key];
          return (
            <section
              key={key}
              className="card fade-in-up"
              style={{ animationDelay: "0.1s" }}
            >
              <div className="px-5 py-4 border-b border-navy-700/40 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">{title}</h2>
                <span className={badge}>{items.length} items</span>
              </div>
              {items.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">
                  No transactions detected.
                </p>
              ) : (
                <ul className="divide-y divide-navy-700/40">
                  {items.map((tx) => (
                    <li
                      key={tx.id}
                      className="px-5 py-3 flex items-center gap-4"
                    >
                      {/* Confidence meter */}
                      <div className="shrink-0 w-10 flex flex-col items-center gap-1">
                        <div className="w-8 h-1.5 bg-navy-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              tx.confidence >= 0.7
                                ? "bg-emerald-400"
                                : tx.confidence >= 0.4
                                  ? "bg-amber-400"
                                  : "bg-red-400"
                            }`}
                            style={{ width: `${tx.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-slate-500">
                          {Math.round(tx.confidence * 100)}%
                        </span>
                      </div>

                      {/* Description + category */}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            type="text"
                            value={tx.description}
                            onChange={(e) =>
                              updateTransaction(tx.id, "description", e.target.value)
                            }
                            className="w-full text-sm text-white bg-navy-700 border border-navy-600 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gold/40"
                          />
                        ) : (
                          <p className="text-sm text-white truncate">
                            {tx.description}
                          </p>
                        )}
                        {isEditing ? (
                          <input
                            type="text"
                            value={tx.category}
                            onChange={(e) =>
                              updateTransaction(tx.id, "category", e.target.value)
                            }
                            className="mt-1 text-[11px] text-slate-400 bg-navy-700 border border-navy-600 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-gold/40"
                          />
                        ) : (
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {tx.category}
                          </p>
                        )}
                      </div>

                      {/* Amount */}
                      <div className="shrink-0 text-right">
                        {isEditing ? (
                          <input
                            type="number"
                            value={tx.amount}
                            step="0.01"
                            onChange={(e) =>
                              updateTransaction(
                                tx.id,
                                "amount",
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="w-28 text-sm text-gold bg-navy-700 border border-navy-600 rounded px-2 py-1 text-right font-semibold focus:outline-none focus:ring-1 focus:ring-gold/40"
                          />
                        ) : (
                          <span className="text-sm font-semibold text-gold whitespace-nowrap">
                            {formatCurrency(tx.amount, sd?.currency || "LKR")}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 fade-in-up" style={{ animationDelay: "0.15s" }}>
          <button
            onClick={handleGenerateQR}
            disabled={qrLoading}
            className="btn-primary w-full sm:w-auto justify-center"
          >
            {qrLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating QR…
              </>
            ) : (
              <>
                <QrCode className="w-4 h-4" />
                Generate Cryptographic QR
              </>
            )}
          </button>
          <button
            onClick={handleReset}
            className="btn-secondary w-full sm:w-auto justify-center"
          >
            <UploadIcon className="w-4 h-4" />
            Upload More
          </button>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  Render — Form View (idle / loading / error)                      */
  /* ================================================================ */
  return (
    <div className="max-w-3xl mx-auto space-y-6 relative">
      {renderToasts()}

      {/* Loading overlay with trilingual processing step */}
      {isDisabled && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-navy-900/60 backdrop-blur-sm rounded-xl">
          <div className="flex flex-col items-center gap-4 px-6 text-center">
            <Loader2 className="w-8 h-8 text-gold animate-spin" />
            {processingStep && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-white">
                  {processingStep.en}
                </p>
                <p className="text-xs text-slate-400">
                  {processingStep.ta}
                </p>
                <p className="text-xs text-slate-400">
                  {processingStep.si}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center gap-3 fade-in-up">
        <div className="w-10 h-10 rounded-lg bg-gold/15 border border-gold/30 flex items-center justify-center">
          <UploadIcon className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Data Capture</h1>
          <p className="text-xs text-slate-400">
            Upload ledger photos, record voice notes, or type transaction
            details
          </p>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  Card 1 — Photo Upload                                       */}
      {/* ============================================================ */}
      <section
        className="card p-5 fade-in-up"
        style={{ animationDelay: "0.05s" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Camera className="w-4 h-4 text-gold" />
          <h2 className="text-sm font-semibold text-white">Photo Upload</h2>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!isDisabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !isDisabled && fileInputRef.current?.click()}
          className={`relative cursor-pointer border-dashed border-2 rounded-xl p-8 flex flex-col items-center justify-center gap-2 transition-colors ${
            dragging
              ? "border-gold bg-gold/5"
              : "border-navy-600 hover:border-navy-500 hover:bg-navy-700/30"
          } ${isDisabled ? "pointer-events-none opacity-50" : ""}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <Camera className="w-8 h-8 text-slate-500" />
          <p className="text-sm text-slate-400 font-medium">
            Drag &amp; drop ledger photos here
          </p>
          <p className="text-xs text-slate-500">or click to browse</p>
          <p className="text-[11px] text-slate-600 mt-1">
            JPEG, PNG, WebP &middot; Max {MAX_IMAGES} images
          </p>
        </div>

        {/* Validation message */}
        {imageError && (
          <p className="mt-3 text-xs text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {imageError}
          </p>
        )}

        {/* Thumbnails */}
        {imageUrls.length > 0 && (
          <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-3">
            {imageUrls.map((url, i) => (
              <div
                key={url}
                className="relative group aspect-square rounded-lg overflow-hidden border border-navy-600/60 bg-navy-700"
              >
                <img
                  src={url}
                  alt={`Upload ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                {!isDisabled && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(i);
                    }}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-navy-900/80 border border-navy-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={`Remove image ${i + 1}`}
                  >
                    <X className="w-3 h-3 text-red-400" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/*  Card 2 — Voice Notes                                        */}
      {/* ============================================================ */}
      <section
        className="card p-5 fade-in-up"
        style={{ animationDelay: "0.1s" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Mic className="w-4 h-4 text-gold" />
          <h2 className="text-sm font-semibold text-white">Voice Notes</h2>
        </div>

        {/* Recorder */}
        <div className="flex flex-col items-center gap-4">
          {/* Idle */}
          {recStatus === "idle" && (
            <>
              <button
                onClick={startRecording}
                disabled={isDisabled}
                className="w-16 h-16 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center hover:bg-gold/25 transition-colors disabled:opacity-50"
                aria-label="Start recording"
              >
                <Mic className="w-7 h-7 text-gold" />
              </button>
              <p className="text-xs text-slate-500">
                Tap to record a voice note
              </p>
            </>
          )}

          {/* Recording */}
          {recStatus === "recording" && (
            <div className="flex flex-col items-center gap-3">
              <div className="animate-pulse-recording w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                <Mic className="w-7 h-7 text-red-400" />
              </div>
              <span className="text-sm font-mono text-white tabular-nums">
                {formatTime(duration)}
              </span>
              <button
                onClick={stopRecording}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            </div>
          )}

          {/* Stopped — preview + add / discard */}
          {recStatus === "stopped" && audioBlob && (
            <div className="w-full flex flex-col items-center gap-3">
              <audio
                controls
                src={URL.createObjectURL(audioBlob)}
                className="w-full max-w-xs"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={addAudioClip}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/15 border border-gold/30 text-gold text-sm font-medium hover:bg-gold/25 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  Add
                </button>
                <button
                  onClick={resetRecorder}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-700 border border-navy-600 text-slate-400 text-sm font-medium hover:bg-navy-600 hover:text-white transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Saved clips */}
        {audioClips.length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="text-xs text-slate-500 font-medium">
              Recorded clips ({audioClips.length})
            </p>
            {audioClips.map((clip, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-navy-700/50 rounded-lg px-3 py-2 border border-navy-600/40"
              >
                <audio
                  controls
                  src={URL.createObjectURL(clip)}
                  className="flex-1 h-8"
                />
                {!isDisabled && (
                  <button
                    onClick={() => removeAudioClip(i)}
                    className="shrink-0 w-7 h-7 rounded-full bg-navy-800 border border-navy-600 flex items-center justify-center hover:bg-red-500/20 hover:border-red-500/40 transition-colors"
                    aria-label={`Remove clip ${i + 1}`}
                  >
                    <X className="w-3 h-3 text-red-400" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/*  Card 3 — Text Notes                                         */}
      {/* ============================================================ */}
      <section
        className="card p-5 fade-in-up"
        style={{ animationDelay: "0.15s" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-gold" />
          <h2 className="text-sm font-semibold text-white">Text Notes</h2>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isDisabled}
          placeholder="Type your notes in Sinhala, Tamil, or English..."
          className="w-full min-h-[120px] rounded-lg bg-navy-700 border border-navy-600 text-white placeholder-slate-500 text-sm p-4 resize-y focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/40 transition-all disabled:opacity-50"
        />
      </section>

      {/* ============================================================ */}
      {/*  Error message                                                */}
      {/* ============================================================ */}
      {status === "error" && (
        <div className="card p-4 border-red-500/30 bg-red-500/5 flex items-start gap-3 fade-in-up">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-400 font-medium">Upload failed</p>
            <p className="text-xs text-slate-400 mt-1">{errorMessage}</p>
          </div>
          <button
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-colors shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/*  Submit                                                       */}
      {/* ============================================================ */}
      <div
        className="flex justify-center fade-in-up"
        style={{ animationDelay: "0.2s" }}
      >
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="btn-primary w-full sm:w-auto"
        >
          {isDisabled ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing…
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Submit for Processing
            </>
          )}
        </button>
      </div>

      {/* Disclaimer */}
      <p
        className="text-center text-[11px] text-slate-600 leading-relaxed max-w-lg mx-auto pb-2 fade-in-up"
        style={{ animationDelay: "0.25s" }}
      >
        All uploads are encrypted (AES-256) in transit and at rest. Raw files
        are purged after 72 hours in compliance with PDPA regulations.
      </p>
    </div>
  );
}
