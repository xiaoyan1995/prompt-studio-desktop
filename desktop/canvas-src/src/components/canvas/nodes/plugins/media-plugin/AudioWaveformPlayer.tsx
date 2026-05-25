"use client";

import { memo, useState, useRef, useEffect, useCallback, useMemo } from "react";

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

async function decodeWaveform(url: string, barCount: number): Promise<Float32Array> {
  const peaks = new Float32Array(barCount);
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const decoded = await ctx.decodeAudioData(buf);
    const raw = decoded.getChannelData(0);
    const samplesPerBar = Math.floor(raw.length / barCount);
    let max = 0;
    for (let i = 0; i < barCount; i++) {
      let peak = 0;
      const start = i * samplesPerBar;
      for (let j = start; j < start + samplesPerBar && j < raw.length; j++) {
        const v = Math.abs(raw[j]);
        if (v > peak) peak = v;
      }
      peaks[i] = peak;
      if (peak > max) max = peak;
    }
    if (max > 0) for (let i = 0; i < barCount; i++) peaks[i] /= max;
  } catch {
    for (let i = 0; i < barCount; i++) {
      const seed = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
      peaks[i] = 0.15 + (seed - Math.floor(seed)) * 0.85;
    }
  }
  return peaks;
}

const MIN_BAR_COUNT = 64;
const BARS_PER_SEC = 6;
const SCROLL_THRESHOLD_S = 10;
const BAR_SPACING_PX = 5;
const PLAYED_COLOR = "#d4d4d8";
const UNPLAYED_COLOR = "#3f3f46";
const HEAD_COLOR = "#38bdf8";

interface Props {
  audioUrl: string;
  audioDuration?: number;
}

export const AudioWaveformPlayer = memo(function AudioWaveformPlayer({ audioUrl, audioDuration }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<Float32Array | null>(null);
  const rafRef = useRef(0);
  const dragRef = useRef<{ active: boolean; startX: number; scrollLeft: number }>({ active: false, startX: 0, scrollLeft: 0 });
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(audioDuration || 0);
  const [hoveringWave, setHoveringWave] = useState(false);

  const isScrollable = duration > SCROLL_THRESHOLD_S;
  const barCount = useMemo(() => isScrollable ? Math.max(MIN_BAR_COUNT, Math.ceil(duration * BARS_PER_SEC)) : MIN_BAR_COUNT, [duration, isScrollable]);
  const canvasLogicalW = isScrollable ? barCount * BAR_SPACING_PX : undefined;

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audio.preload = "metadata";
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;
    const onMeta = () => { if (Number.isFinite(audio.duration)) setDuration(audio.duration); };
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnd = () => { setPlaying(false); setCurrentTime(0); };
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.pause(); audio.src = "";
      audioRef.current = null;
    };
  }, [audioUrl]);

  useEffect(() => {
    let cancelled = false;
    decodeWaveform(audioUrl, barCount).then((p) => { if (!cancelled) { waveformRef.current = p; drawWaveform(); } });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, barCount]);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const peaks = waveformRef.current;
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = 2;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const bc = peaks.length;
    const progress = duration > 0 ? currentTime / duration : 0;
    const gap = w / bc;
    const barW = Math.max(2, gap * 0.55);
    const minH = 3;
    const maxH = h * 0.8;
    const cy = h / 2;

    for (let i = 0; i < bc; i++) {
      const amp = peaks[i];
      const barH = Math.max(minH, amp * maxH);
      const x = i * gap + (gap - barW) / 2;
      const barProgress = (i + 0.5) / bc;
      ctx.fillStyle = barProgress <= progress ? PLAYED_COLOR : UNPLAYED_COLOR;
      ctx.beginPath();
      ctx.roundRect(x, cy - barH / 2, barW, barH, 1.5);
      ctx.fill();
    }

    if (duration > 0) {
      const hx = progress * w;
      ctx.fillStyle = HEAD_COLOR;
      ctx.beginPath();
      ctx.moveTo(hx - 4, 4);
      ctx.lineTo(hx + 4, 4);
      ctx.lineTo(hx, 10);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = HEAD_COLOR;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hx, 10);
      ctx.lineTo(hx, h - 4);
      ctx.stroke();
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [currentTime, duration]);

  useEffect(() => {
    if (!playing) { drawWaveform(); return; }
    const tick = () => { drawWaveform(); rafRef.current = requestAnimationFrame(tick); };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, drawWaveform]);

  useEffect(() => { drawWaveform(); }, [drawWaveform, currentTime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = isScrollable ? scrollRef.current : canvas.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      if (isScrollable && canvasLogicalW) {
        canvas.width = canvasLogicalW * 2;
        canvas.height = rect.height * 2;
      } else {
        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
      }
      drawWaveform();
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, [drawWaveform, isScrollable, canvasLogicalW]);

  /* ── Auto-scroll to playhead during playback ── */
  useEffect(() => {
    if (!isScrollable || !playing) return;
    const el = scrollRef.current;
    if (!el || !canvasLogicalW) return;
    const progress = duration > 0 ? currentTime / duration : 0;
    const headX = progress * canvasLogicalW;
    const viewW = el.clientWidth;
    const target = headX - viewW / 2;
    el.scrollLeft = Math.max(0, Math.min(target, el.scrollWidth - viewW));
  }, [isScrollable, playing, currentTime, duration, canvasLogicalW]);

  /* ── Drag-to-scroll handlers ── */
  const onDragStart = useCallback((e: React.PointerEvent) => {
    if (!isScrollable) return;
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { active: true, startX: e.clientX, scrollLeft: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
  }, [isScrollable]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - dragRef.current.startX;
    el.scrollLeft = dragRef.current.scrollLeft - dx;
  }, []);

  const onDragEnd = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    scrollRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play().then(() => setPlaying(true)).catch(() => {}); }
  }, [playing]);

  const skip = useCallback((delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + delta));
    setCurrentTime(audio.currentTime);
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    audio.currentTime = Math.max(0, Math.min(duration, (x / rect.width) * duration));
    setCurrentTime(audio.currentTime);
  }, [duration]);

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden rounded-[12px] border border-white/10 bg-[#1f1f1f] flex flex-col">
      {/* Waveform area */}
      <div className="relative flex-1 w-full min-h-0 flex items-center justify-center nodrag mt-4">
        <div className="absolute inset-0 pointer-events-none z-20" style={{
          background: "linear-gradient(to right, #1f1f1f 0%, transparent 12%, transparent 88%, #1f1f1f 100%)"
        }} />
        {isScrollable ? (
          <div
            ref={scrollRef}
            className="w-full h-full px-4 relative z-10 overflow-x-hidden"
            style={{ cursor: "grab" }}
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
          >
            <canvas
              ref={canvasRef}
              className="block h-full"
              style={{ width: canvasLogicalW }}
              onClick={handleSeek}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseEnter={() => setHoveringWave(true)}
              onMouseLeave={() => setHoveringWave(false)}
            />
          </div>
        ) : (
          <div className="w-full h-full px-4 relative z-10">
            <canvas
              ref={canvasRef}
              className="block w-full h-full cursor-pointer"
              onClick={handleSeek}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseEnter={() => setHoveringWave(true)}
              onMouseLeave={() => setHoveringWave(false)}
            />
          </div>
        )}
        {duration > 0 && (
          <div
            className={`absolute z-30 flex flex-col items-center pointer-events-none transition-opacity duration-150 ${hoveringWave || playing ? "opacity-100" : "opacity-0"}`}
            style={{ left: `calc(${((currentTime / duration) * 100)}% * 0.76 + 12%)`, bottom: 8 }}
          >
            <svg width="8" height="4" viewBox="0 0 8 4" className="-mb-px"><path d="M0 4L4 0l4 4z" fill={HEAD_COLOR} /></svg>
            <span className="text-white text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap" style={{ backgroundColor: HEAD_COLOR }}>
              {fmt(currentTime)}/{fmt(duration)}
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center justify-end pb-4 pt-2 shrink-0 gap-2">
        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            className="nodrag flex items-center justify-center w-6 h-6 text-[#808080] hover:text-white/90 transition-colors cursor-pointer"
            onClick={skip(-10)}
            onPointerDownCapture={(e) => e.stopPropagation()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M11.5 6.375c0-.371-.067-.734-.194-1.042a1.09 1.09 0 00-.514-.691.68.68 0 00-.663.106c-.222.172-.427.35-.587.613L6.1 10.674c-.215.352-.336.829-.336 1.326s.121.974.336 1.326l3.441 5.625c.16.262.365.441.587.613a.68.68 0 00.663.107c.21-.072.39-.251.514-.691.127-.308.194-.67.194-1.042V6.375z" fill="#a3a3a3"/><path d="M17.235 6.375c0-.371-.067-.734-.193-1.042a1.09 1.09 0 00-.515-.691.68.68 0 00-.663.106c-.222.172-.426.35-.587.613l-3.441 5.313c-.215.352-.336.829-.336 1.326s.121.974.336 1.326l3.441 5.625c.161.262.365.441.587.613a.68.68 0 00.663.107c.21-.072.39-.251.515-.691.126-.308.193-.67.193-1.042V6.375z" fill="#a3a3a3"/></svg>
          </button>

          <button
            type="button"
            className="nodrag relative flex items-center justify-center w-9 h-9 rounded-full bg-[#e5e5e5] hover:bg-white transition-colors cursor-pointer"
            onClick={togglePlay}
            onPointerDownCapture={(e) => e.stopPropagation()}
          >
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#1a1a1a" stroke="none">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#1a1a1a" stroke="none" className="ml-0.5">
                <path d="M6 4v16a1 1 0 001.524.852l13-8a1 1 0 000-1.704l-13-8A1 1 0 006 4z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="nodrag flex items-center justify-center w-6 h-6 text-[#808080] hover:text-white/90 transition-colors cursor-pointer"
            onClick={skip(10)}
            onPointerDownCapture={(e) => e.stopPropagation()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12.5 6.375c0-.371.068-.734.194-1.042.126-.308.306-.534.514-.691a.68.68 0 01.663.106c.222.172.427.35.587.613l3.442 5.313c.215.352.335.829.335 1.326s-.12.974-.335 1.326l-3.442 5.625c-.16.262-.365.441-.587.613a.68.68 0 01-.663.107c-.208-.072-.388-.251-.514-.691A2.94 2.94 0 0112.5 17.625V6.375z" fill="#a3a3a3"/><path d="M6.765 6.375c0-.371.067-.734.193-1.042.127-.308.307-.534.515-.691a.68.68 0 01.663.106c.222.172.426.35.587.613L12.164 10.674c.215.352.336.829.336 1.326s-.121.974-.336 1.326l-3.441 5.625c-.161.262-.365.441-.587.613a.68.68 0 01-.663.107c-.208-.072-.388-.251-.515-.691A2.94 2.94 0 016.765 17.625V6.375z" fill="#a3a3a3"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
});
