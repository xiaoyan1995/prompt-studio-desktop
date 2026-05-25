"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X, Play, Pause, SkipBack, SkipForward, Loader2, ZoomIn, ZoomOut } from "lucide-react";

interface Props {
  videoUrl: string;
  onClose: () => void;
  onCapture: (blob: Blob, width: number, height: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = s.toFixed(2).padStart(5, "0");
  return `${mm}:${ss}`;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
function clampZoom(v: number) { return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v * 100) / 100)); }

export function FrameCaptureModal({ videoUrl, onClose, onCapture }: Props) {
  const t = useTranslations("frameCapture");

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);

  // Append cache-buster to avoid CORS vs non-CORS cache conflict
  const corsVideoUrl = useMemo(() => {
    const sep = videoUrl.includes("?") ? "&" : "?";
    return `${videoUrl}${sep}_cors=1`;
  }, [videoUrl]);

  // Sync currentTime with the video element via rAF while playing
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tick = () => { setCurrentTime(video.currentTime); rafRef.current = requestAnimationFrame(tick); };
    if (isPlaying) { rafRef.current = requestAnimationFrame(tick); }
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onReady = () => { setDuration(video.duration); setVideoReady(true); video.pause(); setIsPlaying(false); };
    if (video.readyState >= 1) { onReady(); return; }
    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("error", () => { console.error("[FrameCapture] video load error", video.error); });
    return () => { video.removeEventListener("loadedmetadata", onReady); };
  }, [corsVideoUrl]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play(); setIsPlaying(true); } else { video.pause(); setIsPlaying(false); }
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const time = parseFloat(e.target.value);
    video.currentTime = time;
    setCurrentTime(time);
  }, []);

  const stepFrame = useCallback((direction: -1 | 1) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setIsPlaying(false);
    const step = 1 / 30;
    const newTime = Math.max(0, Math.min(video.duration, video.currentTime + direction * step));
    video.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  const captureCurrentFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setIsPlaying(false);
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context unavailable");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.95));
      if (!blob) throw new Error("Failed to capture frame");
      onCapture(blob, video.videoWidth, video.videoHeight);
    } catch (err) {
      console.error("[FrameCapture] capture failed:", err);
    } finally {
      setCapturing(false);
    }
  }, [onCapture]);

  const captureAtTime = useCallback(async (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setIsPlaying(false);
    video.currentTime = time;
    setCurrentTime(time);
    await new Promise<void>((resolve) => {
      const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
      video.addEventListener("seeked", onSeeked);
    });
    await captureCurrentFrame();
  }, [captureCurrentFrame]);

  // Double-click to toggle zoom
  const handleDoubleClick = useCallback(() => {
    if (zoom > 1) {
      setZoom(1);
      setPanOffset({ x: 0, y: 0 });
    } else {
      setZoom(2);
    }
  }, [zoom]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((z) => {
      const next = clampZoom(z + delta);
      if (next <= 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Pan when zoomed
  const handlePanPointerDown = useCallback((e: React.PointerEvent) => {
    if (zoom <= 1) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...panOffset };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [zoom, panOffset]);

  const handlePanPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanOffset({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy });
  }, []);

  const handlePanPointerUp = useCallback(() => { isDraggingRef.current = false; }, []);

  const resetZoom = useCallback(() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === " " || e.key === "k") { e.preventDefault(); togglePlay(); return; }
      if (e.key === "ArrowLeft") { e.preventDefault(); stepFrame(-1); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); stepFrame(1); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, togglePlay, stepFrame]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-start gap-4 px-6 py-5"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onPointerDown={onClose}
    >
      <div
        className="relative flex min-h-0 flex-1 min-w-0 overflow-hidden h-[calc(100vh-40px)] rounded-2xl bg-[#1c1c1c]/80 border border-white/10"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Left: video area */}
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden flex flex-col">
          <div
            ref={containerRef}
            className="absolute inset-0 flex items-center justify-center overflow-hidden"
            style={{ cursor: zoom > 1 ? "grab" : undefined }}
            onWheel={handleWheel}
            onPointerDown={handlePanPointerDown}
            onPointerMove={handlePanPointerMove}
            onPointerUp={handlePanPointerUp}
            onDoubleClick={handleDoubleClick}
          >
            {!videoReady && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Loader2 size={36} className="text-zinc-500 animate-spin" />
              </div>
            )}
            <video
              ref={videoRef}
              src={corsVideoUrl}
              className="w-full h-full object-contain select-none"
              crossOrigin="anonymous"
              preload="auto"
              draggable={false}
              style={{
                transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
                transformOrigin: "center center",
                transition: isDraggingRef.current ? "none" : "transform 0.15s ease-out",
                willChange: "transform",
              }}
              onEnded={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
          </div>

          {/* Bottom bar: timeline + playback + zoom */}
          <div
            className="absolute bottom-0 inset-x-0 z-10 flex flex-col gap-1 pb-3 pt-6"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)" }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Timeline */}
            <div className="px-5 flex items-center gap-3">
              <span className="text-xs text-zinc-400 font-mono w-16 text-right shrink-0">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                className="flex-1 h-1 accent-white cursor-pointer appearance-none bg-white/20 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
                min={0}
                max={duration || 0}
                step={0.001}
                value={currentTime}
                onChange={handleSeek}
                disabled={!videoReady}
              />
              <span className="text-xs text-zinc-400 font-mono w-16 shrink-0">
                {formatTime(duration)}
              </span>
            </div>

            {/* Playback controls + zoom */}
            <div className="px-5 flex items-center">
              <div className="flex items-center gap-1">
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                  onClick={() => stepFrame(-1)}
                  disabled={!videoReady}
                  title={t("prevFrame")}
                >
                  <SkipBack size={15} />
                </button>
                <button
                  className="w-9 h-9 flex items-center justify-center rounded-full text-white bg-white/10 hover:bg-white/20 transition-colors"
                  onClick={togglePlay}
                  disabled={!videoReady}
                >
                  {isPlaying ? <Pause size={17} /> : <Play size={17} className="ml-0.5" />}
                </button>
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                  onClick={() => stepFrame(1)}
                  disabled={!videoReady}
                  title={t("nextFrame")}
                >
                  <SkipForward size={15} />
                </button>
              </div>

              <div className="flex-1" />

              {/* Zoom controls */}
              <div className="flex items-center gap-1.5">
                <button
                  className="p-1 rounded text-zinc-400 hover:text-white transition-colors disabled:opacity-30"
                  onClick={() => setZoom((z) => { const n = clampZoom(z - ZOOM_STEP); if (n <= 1) setPanOffset({ x: 0, y: 0 }); return n; })}
                  disabled={zoom <= ZOOM_MIN}
                >
                  <ZoomOut size={15} />
                </button>
                <button
                  className={`px-1.5 py-0.5 rounded text-[11px] tabular-nums font-medium transition-colors ${
                    zoom > 1 ? "text-white bg-white/10 hover:bg-white/20 cursor-pointer" : "text-zinc-500"
                  }`}
                  onClick={resetZoom}
                  disabled={zoom <= 1}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  className="p-1 rounded text-zinc-400 hover:text-white transition-colors disabled:opacity-30"
                  onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
                  disabled={zoom >= ZOOM_MAX}
                >
                  <ZoomIn size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: control sidebar */}
        <div className="shrink-0">
          <div className="relative w-[260px] h-full shrink-0 flex flex-col items-start px-4 pb-4 gap-4 z-20 bg-[#1c1c1c]">
            {/* Close button */}
            <div className="flex w-full justify-between items-center pt-3 pb-0 shrink-0">
              <h3 className="text-sm font-medium text-white">{t("title")}</h3>
              <button
                className="flex w-8 h-8 justify-center items-center rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                onClick={onClose}
              >
                <X size={18} className="text-zinc-400" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 min-h-0 overflow-y-auto w-full space-y-4">
              {/* Resolution info */}
              {videoReady && videoRef.current && (
                <section className="flex flex-col gap-2 py-2 px-2.5 rounded-xl bg-white/5">
                  <div className="flex items-start text-sm gap-3">
                    <span className="text-zinc-500 shrink-0">{t("resolution")}:</span>
                    <span className="text-zinc-200">{videoRef.current.videoWidth} × {videoRef.current.videoHeight}</span>
                  </div>
                  <div className="flex items-start text-sm gap-3">
                    <span className="text-zinc-500 shrink-0">{t("duration")}:</span>
                    <span className="text-zinc-200">{formatTime(duration)}</span>
                  </div>
                </section>
              )}

              {/* Tips */}
              <section className="space-y-2">
                <span className="text-xs text-zinc-500 leading-relaxed block">
                  {t("tips")}
                </span>
              </section>
            </div>

            {/* Capture buttons — pinned to bottom */}
            <div className="w-full space-y-2 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  className="flex-1 h-8 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700 transition-colors disabled:opacity-50"
                  onClick={() => captureAtTime(0)}
                  disabled={!videoReady || capturing}
                >
                  {t("captureFirst")}
                </button>
                <button
                  className="flex-1 h-8 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700 transition-colors disabled:opacity-50"
                  onClick={() => captureAtTime(Math.max(0, duration - 0.01))}
                  disabled={!videoReady || capturing}
                >
                  {t("captureLast")}
                </button>
              </div>
              <button
                className="w-full h-9 rounded-lg text-sm font-medium border border-[#CCFF00] text-[#CCFF00] hover:bg-[#CCFF00]/10 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                onClick={captureCurrentFrame}
                disabled={!videoReady || capturing}
              >
                {capturing ? <Loader2 size={14} className="animate-spin" /> : null}
                <span>{t("capture")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
