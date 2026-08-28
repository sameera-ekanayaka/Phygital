/**
 * Upload page — Merchant data capture interface.
 * Allows merchants to upload ledger photos, record voice notes,
 * and type transaction details for AI processing.
 */
import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from "react";
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
} from "lucide-react";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type PageStatus = "idle" | "loading" | "success" | "error";

interface Transaction {
  description: string;
  category: string;
  amount: number;
  confidence: number;
}

interface UploadResult {
  business_name: string;
  period: string;
  currency: string;
  revenue: Transaction[];
  expenses: Transaction[];
  personal_expenses: Transaction[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
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

const MAX_IMAGES = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function Upload() {
  /* --- state --- */
  const [images, setImages] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [audioClips, setAudioClips] = useState<Blob[]>([]);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<PageStatus>("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

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
        return;
      }
      const urls = incoming.map((f) => URL.createObjectURL(f));
      setImages((prev) => [...prev, ...incoming]);
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

  /* --- submit --- */
  const canSubmit =
    (images.length > 0 || audioClips.length > 0 || notes.trim().length > 0) &&
    status !== "loading";

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setStatus("loading");
    setErrorMessage("");

    const fd = new FormData();
    images.forEach((f) => fd.append("files", f));
    audioClips.forEach((blob, i) =>
      fd.append("files", blob, `voice_clip_${i + 1}.webm`),
    );
    if (notes.trim()) fd.append("notes", notes.trim());

    try {
      const res = await fetch("/api/v1/ingest/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: UploadResult = await res.json();
      setResult(data);
      setStatus("success");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMessage(msg);
      setStatus("error");
    }
  }, [canSubmit, images, audioClips, notes]);

  /* --- reset --- */
  const handleReset = useCallback(() => {
    imageUrls.forEach((u) => URL.revokeObjectURL(u));
    setImages([]);
    setImageUrls([]);
    setImageError(null);
    setAudioClips([]);
    setNotes("");
    setResult(null);
    setErrorMessage("");
    setStatus("idle");
    resetRecorder();
  }, [imageUrls, resetRecorder]);

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  /* --- success view --- */
  if (status === "success" && result) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 fade-in-up">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">
              Processing Complete
            </h1>
            <p className="text-xs text-slate-400">
              Your data has been analysed successfully
            </p>
          </div>
        </div>

        {/* Summary card */}
        <section className="card p-5 fade-in-up" style={{ animationDelay: "0.05s" }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { label: "Business Name", value: result.business_name },
              { label: "Period", value: result.period },
              { label: "Currency", value: result.currency },
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
        </section>

        {/* Transaction sections */}
        {(
          [
            {
              title: "Business Revenue",
              items: result.revenue,
              badge: "badge-green",
            },
            {
              title: "Business Expenses",
              items: result.expenses,
              badge: "badge-red",
            },
            {
              title: "Personal Expenses",
              items: result.personal_expenses,
              badge: "badge-gold",
            },
          ] as const
        ).map(({ title, items, badge }) => (
          <section
            key={title}
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
                {items.map((tx, i) => (
                  <li
                    key={i}
                    className="px-5 py-3 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">
                        {tx.description}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {tx.category} &middot;{" "}
                        {Math.round(tx.confidence * 100)}% confidence
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-gold whitespace-nowrap">
                      {formatCurrency(tx.amount, result.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {/* Upload more */}
        <div className="flex justify-center fade-in-up" style={{ animationDelay: "0.15s" }}>
          <button className="btn-primary" onClick={handleReset}>
            <UploadIcon className="w-4 h-4" />
            Upload More
          </button>
        </div>
      </div>
    );
  }

  /* --- form view (idle / loading / error) --- */
  return (
    <div className="max-w-3xl mx-auto space-y-6 relative">
      {/* Loading overlay */}
      {isDisabled && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-navy-900/60 backdrop-blur-sm rounded-xl">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-gold animate-spin" />
            <p className="text-sm font-medium text-white">
              Processing your data…
            </p>
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
      <section className="card p-5 fade-in-up" style={{ animationDelay: "0.05s" }}>
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
      <section className="card p-5 fade-in-up" style={{ animationDelay: "0.1s" }}>
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
      <section className="card p-5 fade-in-up" style={{ animationDelay: "0.15s" }}>
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
            <p className="text-sm text-red-400 font-medium">
              Upload failed
            </p>
            <p className="text-xs text-slate-400 mt-1">{errorMessage}</p>
          </div>
          <button
            onClick={handleSubmit}
            className="btn-secondary shrink-0 text-xs px-4 py-2"
          >
            Retry
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/*  Submit                                                       */}
      {/* ============================================================ */}
      <div className="flex justify-center fade-in-up" style={{ animationDelay: "0.2s" }}>
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
      <p className="text-center text-[11px] text-slate-600 leading-relaxed max-w-lg mx-auto pb-2 fade-in-up" style={{ animationDelay: "0.25s" }}>
        All uploads are encrypted (AES-256) in transit and at rest. Raw files
        are purged after 72 hours in compliance with PDPA regulations.
      </p>
    </div>
  );
}
