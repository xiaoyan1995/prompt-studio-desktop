"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type CSSProperties,
} from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  Loader2,
} from "lucide-react";

const BRAND = "#CCFF00";
const BRAND_DIM = "rgba(204,255,0,0.35)";

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface VideoPlayerProps {
  src: string;
  autoPlay?: boolean;
  loop?: boolean;
  className?: string;
  style?: CSSProperties;
  onError?: () => void;
  onLoadedData?: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
}

export function VideoPlayer({
  src,
  autoPlay = true,
  loop = true,
  className,
  style,
  onError,
  onLoadedData,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-hide controls
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 3000);
  }, [playing]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    if (!playing) {
      setShowControls(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      scheduleHide();
    }
  }, [playing, scheduleHide]);

  // Video event handlers
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v || isSeeking) return;
    setCurrentTime(v.currentTime);
    if (v.buffered.length > 0) {
      setBuffered(v.buffered.end(v.buffered.length - 1));
    }
  }, [isSeeking]);

  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (v) {
      setDuration(v.duration);
      setLoading(false);
    }
  }, []);

  const handleWaiting = useCallback(() => setLoading(true), []);
  const handleCanPlay = useCallback(() => setLoading(false), []);

  const handleEnded = useCallback(() => {
    if (!loop) setPlaying(false);
  }, [loop]);

  // Play / Pause
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  }, []);

  // Mute
  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  // Volume
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const val = Number(e.target.value);
    v.volume = val;
    setVolume(val);
    if (val === 0) { v.muted = true; setMuted(true); }
    else if (v.muted) { v.muted = false; setMuted(false); }
  }, []);

  // Seek via progress bar
  const seekFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const bar = progressBarRef.current;
      const v = videoRef.current;
      if (!bar || !v || !duration) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      v.currentTime = ratio * duration;
      setCurrentTime(v.currentTime);
    },
    [duration],
  );

  const handleProgressMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsSeeking(true);
      seekFromEvent(e);
      const onMove = (ev: MouseEvent) => seekFromEvent(ev);
      const onUp = () => {
        setIsSeeking(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [seekFromEvent],
  );

  const handleProgressHover = useCallback(
    (e: React.MouseEvent) => {
      const bar = progressBarRef.current;
      if (!bar || !duration) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setHoverProgress(ratio);
    },
    [duration],
  );

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Restart
  const restart = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => {});
    setPlaying(true);
  }, []);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " " || e.key === "k") { e.preventDefault(); togglePlay(); }
      else if (e.key === "m") toggleMute();
      else if (e.key === "f") toggleFullscreen();
      else if (e.key === "ArrowLeft") {
        const v = videoRef.current;
        if (v) { v.currentTime = Math.max(0, v.currentTime - 5); setCurrentTime(v.currentTime); }
      } else if (e.key === "ArrowRight") {
        const v = videoRef.current;
        if (v) { v.currentTime = Math.min(v.duration, v.currentTime + 5); setCurrentTime(v.currentTime); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, toggleMute, toggleFullscreen]);

  const progress = duration > 0 ? currentTime / duration : 0;
  const bufferedProgress = duration > 0 ? buffered / duration : 0;

  return (
    <div
      ref={containerRef}
      className={`relative group/vp select-none ${className ?? ""}`}
      style={{ background: "#000", ...style }}
      onMouseMove={revealControls}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-vp-controls]")) return;
        togglePlay();
      }}
    >
      <video
        ref={videoRef}
        src={src}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={onLoadedData}
        onWaiting={handleWaiting}
        onCanPlay={handleCanPlay}
        onEnded={handleEnded}
        onError={onError}
        playsInline
      />

      {/* Center play/loading overlay */}
      {(loading || !playing) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          {loading ? (
            <Loader2 size={40} className="animate-spin" style={{ color: BRAND }} />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center backdrop-blur-sm pointer-events-auto cursor-pointer"
              style={{ background: "rgba(0,0,0,0.5)", border: `2px solid ${BRAND_DIM}` }}
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            >
              <Play size={28} fill={BRAND} style={{ color: BRAND, marginLeft: 3 }} />
            </div>
          )}
        </div>
      )}

      {/* Bottom controls */}
      <div
        data-vp-controls
        className="absolute bottom-0 inset-x-0 z-20 transition-opacity duration-300"
        style={{
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? "auto" : "none",
          background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div
          ref={progressBarRef}
          className="relative w-full h-6 flex items-center px-3 cursor-pointer group/pb"
          onMouseDown={handleProgressMouseDown}
          onMouseMove={handleProgressHover}
          onMouseLeave={() => setHoverProgress(null)}
        >
          <div className="relative w-full h-[3px] group-hover/pb:h-[5px] rounded-full transition-all" style={{ background: "rgba(255,255,255,0.15)" }}>
            {/* Buffered */}
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${bufferedProgress * 100}%`, background: "rgba(255,255,255,0.2)" }}
            />
            {/* Played */}
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${progress * 100}%`, background: BRAND }}
            />
            {/* Hover preview line */}
            {hoverProgress !== null && (
              <div
                className="absolute inset-y-0 rounded-full"
                style={{ width: `${hoverProgress * 100}%`, background: "rgba(204,255,0,0.2)" }}
              />
            )}
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow-md opacity-0 group-hover/pb:opacity-100 transition-opacity"
              style={{
                left: `${progress * 100}%`,
                transform: `translate(-50%, -50%)`,
                background: BRAND,
                boxShadow: `0 0 6px ${BRAND_DIM}`,
              }}
            />
          </div>
          {/* Hover time tooltip */}
          {hoverProgress !== null && duration > 0 && (
            <div
              className="absolute -top-7 px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums"
              style={{
                left: `calc(${hoverProgress * 100}% + 12px)`,
                transform: "translateX(-50%)",
                background: "rgba(0,0,0,0.8)",
                color: "#fff",
              }}
            >
              {formatTime(hoverProgress * duration)}
            </div>
          )}
        </div>

        {/* Control buttons row */}
        <div className="flex items-center gap-1 px-3 pb-2.5">
          {/* Play/Pause */}
          <button
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            onClick={togglePlay}
          >
            {playing ? (
              <Pause size={18} fill="#fff" className="text-white" />
            ) : (
              <Play size={18} fill="#fff" className="text-white" style={{ marginLeft: 1 }} />
            )}
          </button>

          {/* Restart */}
          <button
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white"
            onClick={restart}
          >
            <RotateCcw size={15} />
          </button>

          {/* Volume */}
          <div className="flex items-center gap-1 group/vol ml-1">
            <button
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white"
              onClick={toggleMute}
            >
              {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <div className="w-0 overflow-hidden group-hover/vol:w-16 transition-all duration-200">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 appearance-none rounded-full cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#CCFF00] [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-[#CCFF00] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${BRAND} ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.4) ${(muted ? 0 : volume) * 100}%)`,
                }}
              />
            </div>
          </div>

          {/* Time */}
          <span className="text-[11px] text-white/60 tabular-nums ml-2 select-none">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          {/* Fullscreen */}
          <button
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white"
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
