/**
 * VoiceRecorder — Microphone recording component with playback and delete.
 * Uses the useVoiceRecorder hook. Shows pulsing animation while recording,
 * duration as MM:SS, audio playback when stopped, and a delete/reset button.
 */
import { Mic, Square, Trash2 } from "lucide-react";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function VoiceRecorder() {
  const { status, audioBlob, duration, startRecording, stopRecording, reset } =
    useVoiceRecorder();

  const audioUrl = audioBlob ? URL.createObjectURL(audioBlob) : null;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Idle — show mic button */}
      {status === "idle" && (
        <button
          onClick={startRecording}
          className="w-16 h-16 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center hover:bg-gold/25 transition-colors"
          aria-label="Start recording"
        >
          <Mic className="w-7 h-7 text-gold" />
        </button>
      )}

      {/* Recording — pulsing mic + duration + stop */}
      {status === "recording" && (
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

      {/* Stopped — playback + delete */}
      {status === "stopped" && audioUrl && (
        <div className="w-full flex flex-col items-center gap-3">
          <audio controls src={audioUrl} className="w-full max-w-xs" />
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-navy-700 border border-navy-600 text-slate-400 text-sm font-medium hover:bg-navy-600 hover:text-white transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      )}

      {/* Hint text */}
      {status === "idle" && (
        <p className="text-xs text-slate-500">Tap to record a voice note</p>
      )}
      {status === "recording" && (
        <p className="text-xs text-slate-500">Max 3 minutes per clip</p>
      )}
    </div>
  );
}
