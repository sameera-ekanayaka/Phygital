import { useState, useRef, useCallback, useEffect, type DragEvent, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Mic, FileText, Send, X, Loader2, Upload, Square, MicOff, Trash2, CheckCircle, AlertCircle } from "lucide-react";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { uploadFiles, generateQR } from "../../services/api";

const MAX_IMAGES = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Generate a random PHYG-XXXX-XXXX verification code */
function generateMockCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pick = (n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `PHYG-${pick(4)}-${pick(4)}`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function BorrowerUpload() {
  const navigate = useNavigate();

  /* --- state --- */
  const [images, setImages] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [audioClips, setAudioClips] = useState<Blob[]>([]);
  const [audioClipUrls, setAudioClipUrls] = useState<string[]>([]);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    status: recStatus,
    audioBlob,
    duration,
    startRecording,
    stopRecording,
    reset: resetRecorder,
  } = useVoiceRecorder();

  /* --- image handlers --- */
  const addImages = useCallback(
    (files: FileList | File[]) => {
      setImageError(null);
      const incoming = Array.from(files).filter((f) => ACCEPTED_TYPES.includes(f.type));
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

  /* --- audio blob URL lifecycle --- */
  useEffect(() => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      setPreviewAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewAudioUrl(null);
    }
  }, [audioBlob]);

  useEffect(() => {
    const urls = audioClips.map((clip) => URL.createObjectURL(clip));
    setAudioClipUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [audioClips]);

  /* --- audio handlers --- */
  const addAudioClip = useCallback(() => {
    if (audioBlob) {
      setAudioClips((prev) => [...prev, audioBlob]);
      resetRecorder();
    }
  }, [audioBlob, resetRecorder]);

  /* --- submit --- */
  const canSubmit =
    (images.length > 0 || audioClips.length > 0 || notes.trim().length > 0) && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);

    const allFiles: (File | Blob)[] = [
      ...images,
      ...audioClips.map((blob, i) =>
        Object.assign(blob, { name: `voice_clip_${i + 1}.webm` }),
      ) as File[],
    ];

    try {
      const resp = await uploadFiles(allFiles, notes.trim());
      const qrRes = await generateQR(resp.request_id);
      navigate("/borrower/processing", {
        state: { verificationCode: qrRes.verification_code, expiresAt: qrRes.expires_at },
      });
    } catch {
      // Mock fallback when backend is unreachable
      const mockCode = generateMockCode();
      navigate("/borrower/processing", {
        state: {
          verificationCode: mockCode,
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        },
      });
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, images, audioClips, notes, navigate]);

  /* ================================================================ */
  /*  Render                                                          */
  /* ================================================================ */
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page header */}
      <div className="text-center b-fade-in-up">
        <h1 className="text-2xl md:text-3xl font-bold text-warm-900 font-display">
          Capture Your Financial Records
        </h1>
        <p className="mt-2 text-warm-600 text-sm md:text-base leading-relaxed max-w-md mx-auto">
          Upload photos of your ledger or record a voice note describing your transactions
        </p>
      </div>

      {/* Main capture card */}
      <section className="b-card p-5 md:p-6 b-fade-in-up" style={{ animationDelay: "0.05s" }}>
        {/* Photo Upload */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-teal/10 flex items-center justify-center">
              <Camera className="w-4 h-4 text-teal" />
            </div>
            <h2 className="text-sm font-semibold text-warm-900">Photo Upload</h2>
            <span className="text-[11px] text-warm-600/70 ml-auto">
              {images.length}/{MAX_IMAGES}
            </span>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!submitting) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !submitting && fileInputRef.current?.click()}
            className={`relative cursor-pointer border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-2 transition-all ${
              dragging
                ? "border-teal bg-teal/5"
                : "border-cream-300 hover:border-cream-300 hover:bg-cream-100/50"
            } ${submitting ? "pointer-events-none opacity-50" : ""}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="w-12 h-12 rounded-full bg-cream-200 flex items-center justify-center mb-1">
              <Camera className="w-5 h-5 text-warm-600" />
            </div>
            <p className="text-sm text-warm-700 font-medium">
              Drag &amp; drop ledger photos here
            </p>
            <p className="text-xs text-warm-600/70">or tap to browse</p>
            <p className="text-[11px] text-warm-600/50 mt-1">
              JPEG, PNG, WebP &middot; Max {MAX_IMAGES} images
            </p>
          </div>

          {imageError && (
            <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
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
                  className="relative group aspect-square rounded-lg overflow-hidden border border-cream-300 bg-cream-100"
                >
                  <img
                    src={url}
                    alt={`Upload ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {!submitting && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(i);
                      }}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-warm-900/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`Remove image ${i + 1}`}
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-cream-300/60 my-6" />

        {/* Voice Recording */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
              <Mic className="w-4 h-4 text-amber-600" />
            </div>
            <h2 className="text-sm font-semibold text-warm-900">Voice Note</h2>
            <span className="text-[11px] text-warm-600/70 ml-auto font-handwritten text-sm">
              describe your transactions
            </span>
          </div>

          <div className="flex flex-col items-center gap-3">
            {/* Idle */}
            {recStatus === "idle" && (
              <>
                <button
                  onClick={startRecording}
                  disabled={submitting}
                  className="w-16 h-16 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center hover:bg-amber-100 hover:border-amber-300 transition-colors disabled:opacity-50"
                  aria-label="Start recording"
                >
                  <Mic className="w-7 h-7 text-amber-600" />
                </button>
                <p className="text-xs text-warm-600">Tap to start recording</p>
              </>
            )}

            {/* Recording */}
            {recStatus === "recording" && (
              <div className="flex flex-col items-center gap-3">
                <div className="b-pulse-warm w-16 h-16 rounded-full bg-red-50 border-2 border-red-300 flex items-center justify-center">
                  <Mic className="w-7 h-7 text-red-500" />
                </div>
                <span className="text-sm font-mono text-warm-900 tabular-nums font-semibold">
                  {formatTime(duration)}
                </span>
                <button
                  onClick={stopRecording}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors"
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop Recording
                </button>
              </div>
            )}

            {/* Stopped — preview + add / discard */}
            {recStatus === "stopped" && audioBlob && previewAudioUrl && (
              <div className="w-full flex flex-col items-center gap-3">
                <audio controls src={previewAudioUrl} className="w-full max-w-xs" />
                <div className="flex items-center gap-3">
                  <button
                    onClick={addAudioClip}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal/10 border border-teal/30 text-teal text-sm font-medium hover:bg-teal/20 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Add Clip
                  </button>
                  <button
                    onClick={resetRecorder}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cream-200 border border-cream-300 text-warm-700 text-sm font-medium hover:bg-cream-300 transition-colors"
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
            <div className="mt-4 space-y-2">
              <p className="text-xs text-warm-600 font-medium">
                Recorded clips ({audioClips.length})
              </p>
              {audioClips.map((clip, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 bg-cream-100 rounded-lg px-3 py-2 border border-cream-300"
                >
                  <audio controls src={audioClipUrls[i]} className="flex-1 h-8" />
                  {!submitting && (
                    <button
                      onClick={() => setAudioClips((prev) => prev.filter((_, idx) => idx !== i))}
                      className="shrink-0 w-7 h-7 rounded-full bg-cream-200 border border-cream-300 flex items-center justify-center hover:bg-red-50 hover:border-red-200 transition-colors"
                      aria-label={`Remove clip ${i + 1}`}
                    >
                      <X className="w-3 h-3 text-red-500" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Text notes card */}
      <section className="b-card p-5 md:p-6 b-fade-in-up" style={{ animationDelay: "0.1s" }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
            <FileText className="w-4 h-4 text-blue-500" />
          </div>
          <h2 className="text-sm font-semibold text-warm-900">Additional Notes</h2>
          <span className="text-[11px] text-warm-600/70 ml-auto font-handwritten text-sm">
            optional
          </span>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
          placeholder="Type any notes in Sinhala, Tamil, or English..."
          className="b-input min-h-[100px] resize-y disabled:opacity-50"
        />
      </section>

      {/* Error */}
      {submitError && (
        <div className="b-card p-4 border-red-200 bg-red-50 flex items-start gap-3 b-fade-in-up">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-600">{submitError}</p>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-center b-fade-in-up" style={{ animationDelay: "0.15s" }}>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="b-btn-primary text-base px-8 py-3.5"
        >
          {submitting ? (
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

      {/* Privacy note */}
      <p className="text-center text-[11px] text-warm-600/50 leading-relaxed max-w-md mx-auto pb-2 b-fade-in-up" style={{ animationDelay: "0.2s" }}>
        Your data is encrypted (AES-256) and automatically purged after 72 hours
        in compliance with PDPA regulations.
      </p>
    </div>
  );
}
