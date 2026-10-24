"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Pause, Play, Upload } from "lucide-react";
import { toast } from '@/lib/toast-store';

interface MeetingRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
}

type RecordingState = "idle" | "recording" | "paused" | "done";

export default function MeetingRecorder({ onRecordingComplete }: MeetingRecorderProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [volumeLevel, setVolumeLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const startVolumeMonitor = useCallback((stream: MediaStream) => {
    try {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setVolumeLevel(Math.min(avg / 128, 1));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // AudioContext may not be available
    }
  }, []);

  const stopVolumeMonitor = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setVolumeLevel(0);
  }, []);

  const handleStartRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(url);
        onRecordingComplete(blob, elapsed);
        stream.getTracks().forEach((t) => t.stop());
        stopVolumeMonitor();
      };

      recorder.start(1000); // collect data every second
      setState("recording");
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);

      startVolumeMonitor(stream);
    } catch (err) {
      console.error("[recorder] Failed to start:", err);
      toast("无法访问麦克风，请检查浏览器权限设置", 'error');
    }
  }, [audioUrl, elapsed, onRecordingComplete, startVolumeMonitor, stopVolumeMonitor]);

  const handlePause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (state === "recording") {
      recorder.pause();
      setState("paused");
      if (timerRef.current) clearInterval(timerRef.current);
      stopVolumeMonitor();
    } else if (state === "paused") {
      recorder.resume();
      setState("recording");
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
      if (streamRef.current) startVolumeMonitor(streamRef.current);
    }
  }, [state, startVolumeMonitor, stopVolumeMonitor]);

  const handleStop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    recorder.stop();
    setState("done");
  }, []);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Get duration from audio file
      const tempUrl = URL.createObjectURL(file);
      const audio = new Audio(tempUrl);
      audio.onloadedmetadata = () => {
        const duration = Math.round(audio.duration);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(tempUrl);
        setElapsed(duration);
        setState("done");
        onRecordingComplete(file, duration);
      };
      audio.onerror = () => {
        // Fallback if metadata can't be read
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(tempUrl);
        setElapsed(0);
        setState("done");
        onRecordingComplete(file, 0);
      };

      e.target.value = "";
    },
    [audioUrl, onRecordingComplete]
  );

  const handleReset = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setElapsed(0);
    setState("idle");
    chunksRef.current = [];
    mediaRecorderRef.current = null;
  }, [audioUrl]);

  // Volume bars (5 bars)
  const volumeBars = Array.from({ length: 5 }, (_, i) => {
    const threshold = (i + 1) / 5;
    return volumeLevel >= threshold;
  });

  return (
    <div className="rounded-xl border border-border bg-sidebar p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          🎙️ 录音
        </span>
        {state !== "idle" && state !== "done" && (
          <div className="flex items-center gap-2">
            {/* Red pulse dot */}
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  state === "recording" ? "animate-ping bg-red-500" : "bg-yellow-500"
                }`}
              />
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  state === "recording" ? "bg-red-500" : "bg-yellow-500"
                }`}
              />
            </span>
            {/* Timer */}
            <span className="font-mono text-sm font-medium text-foreground">
              {formatTime(elapsed)}
            </span>
            {/* Volume bars */}
            <div className="flex items-end gap-0.5 h-4">
              {volumeBars.map((active, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-150 ${
                    active ? "bg-red-500" : "bg-border"
                  }`}
                  style={{ height: `${(i + 1) * 20}%` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Idle state */}
      {state === "idle" && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleStartRecording}
            className="flex items-center gap-2 rounded-full bg-red-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-red-600 hover:shadow-md active:scale-95"
          >
            <Mic className="h-4 w-4" />
            开始录音
          </button>
          <span className="text-xs text-muted">或</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-secondary transition-colors hover:border-secondary hover:text-foreground"
          >
            <Upload className="h-3.5 w-3.5" />
            上传录音文件
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}

      {/* Recording / Paused state */}
      {(state === "recording" || state === "paused") && (
        <div className="flex items-center gap-3">
          <button
            onClick={handlePause}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              state === "paused"
                ? "border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
                : "border-border bg-card text-secondary hover:text-foreground"
            }`}
          >
            {state === "paused" ? (
              <>
                <Play className="h-3.5 w-3.5" />
                继续
              </>
            ) : (
              <>
                <Pause className="h-3.5 w-3.5" />
                暂停
              </>
            )}
          </button>
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-red-600"
          >
            <Square className="h-3.5 w-3.5" />
            结束录音
          </button>
        </div>
      )}

      {/* Done state — playback */}
      {state === "done" && audioUrl && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>录音时长: {formatTime(elapsed)}</span>
          </div>
          <audio controls src={audioUrl} className="w-full h-10 rounded-lg" />
          <button
            onClick={handleReset}
            className="text-xs text-muted hover:text-foreground transition-colors underline underline-offset-2"
          >
            重新录音
          </button>
        </div>
      )}
    </div>
  );
}
