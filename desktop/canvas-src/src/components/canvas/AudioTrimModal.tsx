"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X, Check, Loader2 } from "lucide-react";

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00.0";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms}`;
}

/** Encode an AudioBuffer region [startSample..endSample) as a WAV Blob. */
function encodeWav(buf: AudioBuffer, startSample: number, endSample: number): Blob {
  const numChannels = buf.numberOfChannels;
  const sampleRate = buf.sampleRate;
  const length = endSample - startSample;
  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = length * numChannels * 2;
  const headerSize = 44;
  const ab = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(ab);

  function writeStr(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) channels.push(buf.getChannelData(ch));

  let offset = headerSize;
  for (let i = startSample; i < endSample; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

const BAR_COUNT = 200;
const WAVEFORM_H = 120;
const PLAYED_COLOR = "#a1a1aa";
const UNPLAYED_COLOR = "#3f3f46";
const SELECTED_COLOR = "#38bdf8";
const HANDLE_COLOR = "#38bdf8";

interface Props {
  audioUrl: string;
  onClose: () => void;
  onTrim: (blob: Blob, duration: number) => void;
}

export function AudioTrimModal({ audioUrl, onClose, onTrim }: Props) {
  const t = useTranslations("audioTrim");

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [trimming, setTrimming] = useState(false);
  const [playing, setPlaying] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playStartRef = useRef(0);
  const rafRef = useRef(0);
  const [playhead, setPlayhead] = useState(-1);

  const draggingRef = useRef<"start" | "end" | "region" | null>(null);
  const dragOriginRef = useRef({ x: 0, startTime: 0, endTime: 0 });

  // Decode audio
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(audioUrl, { credentials: "same-origin" });
        const arrayBuf = await res.arrayBuffer();
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const decoded = await ctx.decodeAudioData(arrayBuf);
        if (cancelled) return;
        setAudioBuffer(decoded);
        setDuration(decoded.duration);
        setEndTime(decoded.duration);

        // Compute peaks
        const raw = decoded.getChannelData(0);
        const p = new Float32Array(BAR_COUNT);
        const samplesPerBar = Math.floor(raw.length / BAR_COUNT);
        let max = 0;
        for (let i = 0; i < BAR_COUNT; i++) {
          let peak = 0;
          const start = i * samplesPerBar;
          for (let j = start; j < start + samplesPerBar && j < raw.length; j++) {
            const v = Math.abs(raw[j]);
            if (v > peak) peak = v;
          }
          p[i] = peak;
          if (peak > max) max = peak;
        }
        if (max > 0) for (let i = 0; i < BAR_COUNT; i++) p[i] /= max;
        setPeaks(p);
      } catch (err) {
        console.error("[AudioTrim] decode failed:", err);
      }
    })();
    return () => {
      cancelled = true;
      audioCtxRef.current?.close();
    };
  }, [audioUrl]);

  // Draw waveform
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || !duration) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = 2;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const gap = w / BAR_COUNT;
    const barW = Math.max(1.5, gap * 0.6);
    const minH = 2;
    const maxH = h * 0.85;
    const cy = h / 2;

    const selStartX = (startTime / duration) * w;
    const selEndX = (endTime / duration) * w;

    // Dim outside selection
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, selStartX, h);
    ctx.fillRect(selEndX, 0, w - selEndX, h);

    for (let i = 0; i < BAR_COUNT; i++) {
      const amp = peaks[i];
      const barH = Math.max(minH, amp * maxH);
      const x = i * gap + (gap - barW) / 2;
      const barCenter = x + barW / 2;
      const inSelection = barCenter >= selStartX && barCenter <= selEndX;
      ctx.fillStyle = inSelection ? SELECTED_COLOR : UNPLAYED_COLOR;
      ctx.beginPath();
      ctx.roundRect(x, cy - barH / 2, barW, barH, 1);
      ctx.fill();
    }

    // Selection handles
    ctx.fillStyle = HANDLE_COLOR;
    // Left handle
    ctx.fillRect(selStartX - 1.5, 0, 3, h);
    ctx.beginPath();
    ctx.roundRect(selStartX - 5, cy - 12, 10, 24, 3);
    ctx.fill();
    // Right handle
    ctx.fillRect(selEndX - 1.5, 0, 3, h);
    ctx.beginPath();
    ctx.roundRect(selEndX - 5, cy - 12, 10, 24, 3);
    ctx.fill();

    // Playhead
    if (playhead >= 0 && playhead <= duration) {
      const px = (playhead / duration) * w;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [peaks, duration, startTime, endTime, playhead]);

  useEffect(() => { draw(); }, [draw]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      draw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  // Drag handlers
  const getTimeFromX = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !duration) return 0;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    const startX = (startTime / duration) * w;
    const endX = (endTime / duration) * w;
    const HIT = 12;

    if (Math.abs(x - startX) < HIT) {
      draggingRef.current = "start";
    } else if (Math.abs(x - endX) < HIT) {
      draggingRef.current = "end";
    } else if (x > startX && x < endX) {
      draggingRef.current = "region";
    } else {
      return;
    }
    dragOriginRef.current = { x: e.clientX, startTime, endTime };
    canvas.setPointerCapture(e.pointerId);
  }, [duration, startTime, endTime]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current || !duration) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dx = e.clientX - dragOriginRef.current.x;
    const dtSec = (dx / rect.width) * duration;
    const MIN_SPAN = 0.1;

    if (draggingRef.current === "start") {
      const ns = Math.max(0, Math.min(endTime - MIN_SPAN, dragOriginRef.current.startTime + dtSec));
      setStartTime(ns);
    } else if (draggingRef.current === "end") {
      const ne = Math.min(duration, Math.max(startTime + MIN_SPAN, dragOriginRef.current.endTime + dtSec));
      setEndTime(ne);
    } else if (draggingRef.current === "region") {
      const span = dragOriginRef.current.endTime - dragOriginRef.current.startTime;
      let ns = dragOriginRef.current.startTime + dtSec;
      if (ns < 0) ns = 0;
      if (ns + span > duration) ns = duration - span;
      setStartTime(ns);
      setEndTime(ns + span);
    }
  }, [duration, startTime, endTime]);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  // Playback
  const stopPlayback = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    setPlaying(false);
    setPlayhead(-1);
    cancelAnimationFrame(rafRef.current);
  }, []);

  const togglePlay = useCallback(() => {
    if (playing) { stopPlayback(); return; }
    const ctx = audioCtxRef.current;
    const buf = audioBuffer;
    if (!ctx || !buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const selDuration = endTime - startTime;
    src.start(0, startTime, selDuration);
    sourceRef.current = src;
    playStartRef.current = ctx.currentTime;
    setPlaying(true);

    const tick = () => {
      const elapsed = (audioCtxRef.current?.currentTime ?? 0) - playStartRef.current;
      if (elapsed >= selDuration) { stopPlayback(); return; }
      setPlayhead(startTime + elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    src.onended = () => stopPlayback();
  }, [playing, audioBuffer, startTime, endTime, stopPlayback]);

  // Confirm trim
  const handleConfirm = useCallback(async () => {
    if (!audioBuffer) return;
    setTrimming(true);
    try {
      const sr = audioBuffer.sampleRate;
      const startSample = Math.round(startTime * sr);
      const endSample = Math.round(endTime * sr);
      const blob = encodeWav(audioBuffer, startSample, endSample);
      const trimDuration = endTime - startTime;
      onTrim(blob, trimDuration);
    } catch (err) {
      console.error("[AudioTrim] encode failed:", err);
    } finally {
      setTrimming(false);
    }
  }, [audioBuffer, startTime, endTime, onTrim]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  if (typeof document === "undefined") return null;

  const selDuration = endTime - startTime;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/70 flex items-center justify-center"
      onMouseDown={onClose}
    >
      <div
        className="relative w-[640px] max-w-[90vw] bg-[#1c1c1c] rounded-2xl border border-white/10 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-sm font-medium text-zinc-200">{t("title")}</span>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-zinc-400 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Waveform area */}
        <div className="px-5 pb-2">
          {!peaks ? (
            <div className="flex items-center justify-center" style={{ height: WAVEFORM_H }}>
              <Loader2 size={24} className="text-zinc-500 animate-spin" />
            </div>
          ) : (
            <div ref={containerRef} className="relative" style={{ height: WAVEFORM_H }}>
              <canvas
                ref={canvasRef}
                className="block w-full cursor-col-resize"
                style={{ height: WAVEFORM_H }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />
            </div>
          )}
        </div>

        {/* Time info + play button */}
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <span>{t("start")}: <span className="text-zinc-200 font-mono">{fmt(startTime)}</span></span>
            <span>{t("end")}: <span className="text-zinc-200 font-mono">{fmt(endTime)}</span></span>
            <span>{t("duration")}: <span className="text-zinc-200 font-mono">{fmt(selDuration)}</span></span>
          </div>

          {/* Mini play button */}
          <button
            onClick={togglePlay}
            disabled={!audioBuffer}
            className="w-8 h-8 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center text-white transition-colors cursor-pointer disabled:opacity-40"
          >
            {playing ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="ml-0.5">
                <path d="M6 4v16a1 1 0 001.524.852l13-8a1 1 0 000-1.704l-13-8A1 1 0 006 4z" />
              </svg>
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pb-4">
          <button
            onClick={onClose}
            className="h-8 px-4 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X size={14} className="inline mr-1" />
          </button>
          <button
            onClick={handleConfirm}
            disabled={trimming || !audioBuffer || selDuration < 0.1}
            className="h-8 px-4 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 flex items-center gap-1.5 disabled:opacity-40 cursor-pointer transition-colors"
          >
            {trimming ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            {trimming ? t("trimming") : t("confirm")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
