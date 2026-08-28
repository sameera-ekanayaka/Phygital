/**
 * useVoiceRecorder — Custom hook wrapping the browser MediaRecorder API.
 * Records audio as audio/webm with a 180-second max duration cap.
 * Returns status, audioBlob, elapsed duration, and control functions.
 */
import { useState, useRef, useEffect, useCallback } from "react";

export type RecorderStatus = "idle" | "recording" | "stopped";

const MAX_DURATION = 180; // seconds

export function useVoiceRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  /* ---- cleanup helpers ---- */
  const clearTimers = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /* ---- stop recording ---- */
  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    clearTimers();
    stopStream();
    setStatus("stopped");
  }, [clearTimers, stopStream]);

  /* ---- start recording ---- */
  const startRecording = useCallback(async () => {
    // Reset previous state
    setAudioBlob(null);
    setDuration(0);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setStatus("stopped");
      };

      recorder.start();
      setStatus("recording");

      // Tick every second
      intervalRef.current = window.setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);

      // Auto-stop at MAX_DURATION
      timeoutRef.current = window.setTimeout(() => {
        stopRecording();
      }, MAX_DURATION * 1000);
    } catch {
      // Microphone permission denied or unavailable
      setStatus("idle");
    }
  }, [stopRecording]);

  /* ---- reset ---- */
  const reset = useCallback(() => {
    clearTimers();
    stopStream();
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    setAudioBlob(null);
    setDuration(0);
    setStatus("idle");
    chunksRef.current = [];
  }, [clearTimers, stopStream]);

  /* ---- cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      clearTimers();
      stopStream();
    };
  }, [clearTimers, stopStream]);

  return {
    status,
    audioBlob,
    duration,
    startRecording,
    stopRecording,
    reset,
  };
}
