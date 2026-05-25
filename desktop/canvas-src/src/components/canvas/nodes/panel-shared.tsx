"use client";

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, X, MousePointer2, Maximize2, Minimize2 } from "lucide-react";

/* ── Hook: click-outside ─────────────────────────────── */
export function useClickOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [ref, open, onClose]);
}

/* ── Hook: auto-flip dropdown direction ─────────────── */
export function useAutoFlip(
  triggerRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
): [boolean, React.RefObject<HTMLDivElement | null>] {
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [flipUp, setFlipUp] = useState(false);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !dropRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const dropHeight = dropRef.current.scrollHeight;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    setFlipUp(spaceBelow < dropHeight + 16 && spaceAbove > spaceBelow);
  }, [isOpen]);

  return [flipUp, dropRef];
}

/* ── Credits icon (project logo) ─────────────────────── */
export function CreditsIcon() {
  return (
    <img
      src="/infinite_logo.svg"
      width="16"
      height="16"
      alt="Xins"
      className="opacity-80"
      style={{ filter: "invert(var(--credits-icon-invert))" }}
    />
  );
}

/* ── Shared: Panel positioning shell ────────────────── */
export function PanelShell({
  inverseZoom,
  children,
  expanded,
  onExpand,
  onCollapse,
}: {
  inverseZoom: number;
  children: React.ReactNode;
  expanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
}) {
  const toggleBtn = (icon: React.ReactNode, action?: () => void) => (
    <button
      type="button"
      className="absolute top-2.5 right-2.5 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/10 text-zinc-500 hover:text-zinc-800 dark:hover:text-white transition-colors z-10 nodrag"
      onPointerDownCapture={(e) => e.stopPropagation()}
      onMouseDown={(e) => { e.preventDefault(); action?.(); }}
    >
      {icon}
    </button>
  );

  if (expanded) {
    return createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
        onClick={onCollapse}
      >
        <div
          className="w-full max-w-[860px] mx-6 bg-white dark:bg-[#1e1e1e] rounded-[20px] border border-zinc-200 dark:border-zinc-700/60 shadow-2xl relative text-zinc-800 dark:text-white"
          onClick={(e) => e.stopPropagation()}
        >
          {toggleBtn(<Minimize2 size={14} />, onCollapse)}
          {children}
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <div
      className="absolute left-1/2 z-40 pointer-events-auto nowheel"
      style={{
        bottom: "-8px",
        transform: `translateX(-50%) translateY(100%) scale(${inverseZoom})`,
        transformOrigin: "center top",
        minWidth: 720,
        maxWidth: 730,
      }}
    >
      <div className="bg-white dark:bg-[#1e1e1e] rounded-[20px] border border-zinc-200 dark:border-zinc-700/60 shadow-lg mt-2 w-full relative text-zinc-800 dark:text-white">
        {onExpand && toggleBtn(<Maximize2 size={14} />, onExpand)}
        {children}
      </div>
    </div>
  );
}

/* ── Shared: Credits pill + send button ────────────── */
export function CreditsPill({ credits = "1", originalCredits, onSend, disabled, loading }: { credits?: string; originalCredits?: string; onSend?: () => void; disabled?: boolean; loading?: boolean }) {
  const hasDiscount = originalCredits && originalCredits !== credits;
  return (
    <div
      className="nodrag flex items-center gap-1 rounded-full p-1 border"
      style={{
        backdropFilter: "blur(10px)",
        background: "var(--credits-pill-bg)",
        borderColor: "var(--credits-pill-border)",
      }}
    >
      <div className="flex items-center text-sm font-medium pl-2.5 pr-1" style={{ color: "var(--credits-pill-text)" }}>
        {hasDiscount ? (
          <span className="relative inline-flex items-center gap-1 px-0.5">
            <span className="font-medium tabular-nums text-sm" style={{ color: "var(--credits-pill-text)" }}>{credits}</span>
            <span className="relative text-zinc-500 tabular-nums text-[11px]">
              {originalCredits}
              <span className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
                <span className="block w-[120%] h-[1.5px] bg-zinc-500 -rotate-12 rounded-full" />
              </span>
            </span>
          </span>
        ) : (
          <span className="relative inline-flex min-w-[24px] justify-center tabular-nums text-xs" style={{ color: "var(--credits-pill-text)" }}>{credits}</span>
        )}
      </div>
      <button
        type="button"
        disabled={disabled}
        className="nodrag w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all hover:opacity-90 hover:scale-105 active:scale-95"
        style={{
          background: "var(--credits-pill-btn-bg)",
          color: "var(--credits-pill-btn-text)",
        }}
        onPointerDownCapture={(e) => e.stopPropagation()}
        onMouseDown={(e) => { e.preventDefault(); onSend?.(); }}
      >
        {loading ? (
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="50 20" />
          </svg>
        ) : (
          <ArrowUp size={14} />
        )}
      </button>
    </div>
  );
}

/* ── Audio preview popup: auto-play with waveform ── */
function AudioPreviewPopup({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = 0.5;
    el.play().then(() => setPlaying(true)).catch(() => {});
    return () => { el.pause(); el.currentTime = 0; };
  }, []);

  const bars = [0.3, 0.6, 0.9, 0.5, 0.8, 0.4, 0.7, 0.55, 0.85, 0.45, 0.75, 0.65, 0.5, 0.9, 0.35];

  return (
    <div className="w-[220px] px-3 py-3">
      <audio ref={audioRef} src={src} preload="auto" />
      <div className="flex items-end justify-center gap-[3px] h-[40px]">
        {bars.map((h, i) => (
          <div
            key={i}
            className="w-[6px] rounded-full"
            style={{
              height: `${h * 40}px`,
              background: playing
                ? `linear-gradient(to top, #ec4899, #f472b6)`
                : "#4a4a4a",
              animation: playing
                ? `audioBarPreview 0.8s ease-in-out ${i * 0.06}s infinite alternate`
                : "none",
              transformOrigin: "bottom",
            }}
          />
        ))}
      </div>
      <style>{`@keyframes audioBarPreview { 0% { transform: scaleY(0.3); } 100% { transform: scaleY(1); } }`}</style>
    </div>
  );
}

/* ── Shared: Reference thumbnail with hover preview ── */
export function RefThumb({
  src,
  isVideo,
  isAudio,
  label,
  onRemove,
  className,
  children,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onClick,
}: {
  src: string;
  isVideo?: boolean;
  isAudio?: boolean;
  label?: string;
  onRemove?: () => void;
  className?: string;
  children?: React.ReactNode;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const handleEnter = useCallback(() => {
    if (!thumbRef.current) return;
    const r = thumbRef.current.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
    setHover(true);
  }, []);

  return (
    <>
      <div
        ref={thumbRef}
        className={`relative nodrag group/ref ${onClick ? "cursor-pointer" : ""} ${className ?? ""}`}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setHover(false)}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        onClick={onClick}
      >
        {isAudio ? (
          <div className="size-[38px] rounded-[10px] border border-pink-500/30 bg-gradient-to-b from-pink-500/15 to-pink-500/5 flex items-end justify-center gap-[2px] pb-[7px] pt-[7px]">
            {[0.55, 0.85, 0.45, 0.95, 0.6, 0.75, 0.5].map((h, i) => (
              <div
                key={i}
                className="w-[2.5px] rounded-full bg-pink-400/80"
                style={{
                  height: `${h * 24}px`,
                  animation: `audioBar 1.2s ease-in-out ${i * 0.1}s infinite alternate`,
                }}
              />
            ))}
            <style>{`@keyframes audioBar { 0% { transform: scaleY(0.4); } 100% { transform: scaleY(1); } }`}</style>
          </div>
        ) : isVideo ? (
          <video src={src} className="size-[38px] object-cover rounded-[10px] border border-green-500/30" muted preload="metadata" />
        ) : (
          <img src={src} alt={label ?? ""} className="size-[38px] object-cover rounded-[10px] border border-white/10" draggable={false} loading="lazy" decoding="async" />
        )}
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-3 h-3 bg-green-500/80 rounded-full flex items-center justify-center">
              <div className="w-0 h-0 border-l-[5px] border-l-white border-y-[3px] border-y-transparent ml-0.5" />
            </div>
          </div>
        )}
        {children}
        {onRemove && (
          <button
            type="button"
            className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-black/80 border border-white/15 flex items-center justify-center opacity-0 group-hover/ref:opacity-100 transition-opacity nodrag"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
          >
            <X size={8} className="text-white/80" />
          </button>
        )}
      </div>
      {hover && pos && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -100%)" }}
        >
          <div className="mb-2 rounded-xl bg-[#1a1a1a] border border-white/10 overflow-hidden shadow-2xl">
            {label && <div className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-white/[0.04]">{label}</div>}
            {isAudio ? (
              <AudioPreviewPopup src={src} />
            ) : isVideo ? (
              <video src={src} className="w-[200px] h-auto" muted autoPlay loop playsInline draggable={false} />
            ) : (
              <img src={src} alt={label ?? ""} className="w-[200px] h-auto" draggable={false} loading="lazy" decoding="async" />
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ── Shared: Reference image button ────────────────── */
export function RefImageButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      className="nodrag size-[38px] flex items-center justify-center rounded-[10px] border border-white/10 cursor-pointer shrink-0 focus:outline-none bg-white/[0.06] hover:bg-white/[0.12] transition-all"
      onPointerDownCapture={(e) => e.stopPropagation()}
      onClick={onClick}
    >
      <MousePointer2 size={16} className="text-zinc-400" />
    </button>
  );
}

/* ── Gemini SVG icon ────────────────────────────────── */
export function GeminiIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" className={className}>
      <path
        d="M8.998 2.385c.54 1.521 1.412 2.908 2.558 4.057l.002.001a9.06 9.06 0 003.444 2.323c.2.086.404.163.609.236a9.108 9.108 0 00-4.054 2.56l-.001.001a9.108 9.108 0 00-2.558 4.054 9.108 9.108 0 00-2.559-4.055l-.001-.001-.264-.254a9.11 9.11 0 00-4.057-2.305 9.108 9.108 0 004.057-2.559l.001-.001A9.108 9.108 0 008.998 2.385z"
        stroke="#A3A3A3"
        strokeWidth="1.33"
      />
    </svg>
  );
}

/* ── SeeDream (Doubao) SVG icon ──────────────────────── */
export function SeedreamIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="17" viewBox="0 0 24 25" fill="none" className={className}>
      <path d="M22 4.628l-3.458-.87v17.484L22 20.328V4.628z" fill="#A3A3A3" />
      <path d="M2 20.194l3.43-.887.016-13.737L2 4.699v15.495z" fill="#A3A3A3" />
      <path d="M16.121 9.266c-.87.168-1.821.49-2.696.706-.12.032-.329-.036-.373.096l-.012 7.527 3.459.866V9.278c0-.1-.31-.024-.378-.012z" fill="#A3A3A3" />
      <path d="M7.496 11.582v9.152l.104.032 3.326-.835.02-7.538-3.138-.734-.312-.076z" fill="#A3A3A3" />
    </svg>
  );
}

export function OpenAIIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" fill="#A3A3A3" />
    </svg>
  );
}

export function ImageModelIcon({ modelId, className }: { modelId: string; className?: string }) {
  if (modelId === "gpt-image-2" || modelId === "gpt-image-2-lite") return <OpenAIIcon className={className} />;
  if (modelId === "grok-imagine") return <GrokIcon className={className} />;
  if (modelId === "z-image-turbo") return <ZImageIcon className={className} />;
  if (modelId === "wan-2.7") return <WanIcon className={className} />;
  if (modelId.startsWith("doubao-seedream")) return <SeedreamIcon className={className} />;
  return <GeminiIcon className={className} />;
}

/* ── Aspect ratio visual indicator ──────────────────── */
export function AspectRatioIcon({ w, h }: { w: number; h: number }) {
  const maxSize = 16;
  const ratio = w / h;
  const iconW = ratio >= 1 ? maxSize : Math.round(maxSize * ratio);
  const iconH = ratio >= 1 ? Math.round(maxSize / ratio) : maxSize;
  return (
    <div className="flex items-center justify-center flex-none" style={{ width: 16, height: 16 }}>
      <div className="border-[1.5px] border-current rounded-[2px]" style={{ width: iconW, height: iconH }} />
    </div>
  );
}

/* ── Wan 2.7 (Qwen / Alibaba) SVG icon ─────────────── */
export function WanIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="25 15 155 155" fill="none" className={className}>
      <path d="M174.82 108.75L155.38 75L165.64 57.75C166.46 56.31 166.46 54.53 165.64 53.09L155.38 35.84C154.86 34.91 153.87 34.33 152.78 34.33H114.88L106.14 19.03C105.62 18.1 104.63 17.52 103.54 17.52H83.3C82.21 17.52 81.22 18.1 80.7 19.03L61.26 52.77H41.02C39.93 52.77 38.94 53.35 38.42 54.28L28.16 71.53C27.34 72.97 27.34 74.75 28.16 76.19L45.52 107.5L36.78 122.8C35.96 124.24 35.96 126.02 36.78 127.46L47.04 144.71C47.56 145.64 48.55 146.22 49.64 146.22H87.54L96.28 161.52C96.8 162.45 97.79 163.03 98.88 163.03H119.12C120.21 163.03 121.2 162.45 121.72 161.52L141.16 127.78H158.52C159.61 127.78 160.6 127.2 161.12 126.27L171.38 109.02C172.2 107.58 172.2 105.8 171.38 104.36L174.82 108.75Z" fill="#A3A3A3"/>
      <path d="M119.12 163.03H98.88L87.54 144.71H49.64L61.26 126.39H80.7L38.42 55.29H61.26L83.3 19.03L93.56 37.35L83.3 55.29H161.58L151.32 72.54L170.76 106.28H151.32L141.16 88.34L101.18 163.03H119.12Z" fill="#1a1a2e"/>
      <path d="M127.86 79.83H76.14L101.18 122.11L127.86 79.83Z" fill="#A3A3A3"/>
    </svg>
  );
}

/* ── Z-Image (Tongyi-MAI) SVG icon ────────────────────── */
export function ZImageIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M3.5 3.5h9L5 12.5h8" stroke="#A3A3A3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── DeepSeek SVG icon (official logo) ────────────────── */
export function DeepSeekIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z" fill="#A3A3A3" />
    </svg>
  );
}

/* ── Grok (xAI) SVG icon ─────────────────────────────── */
export function GrokIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill="#A3A3A3" />
    </svg>
  );
}

/* ── Kling model icon (custom SVG) ─────────────────── */
export function KlingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 25" fill="none">
      <path d="M10.72 1.69c2.95-.3 5.99.54 8.22 2.59 2.63 2.42.89 5.53-.44 8.15l3.85 4.1c-2.86 6.65-11.82 9.23-17.29 4.2C2.43 18.31 4.17 15.2 5.5 12.58L1.65 8.48c1.5-3.55 5.3-6.42 9.07-6.79z" fill="#A3A3A3" />
    </svg>
  );
}

/* ── LTX (Lightricks) SVG icon ─────────────────────── */
export function LtxIcon({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 75 32" fill="none" className={className}>
      <path d="M0 30.0087V7.50057C0 7.09765 0.154254 6.69973 0.460162 6.43869C0.708822 6.22729 0.987356 6.12029 1.29316 6.12029H8.2339C8.63671 6.12029 9.03463 6.26205 9.31316 6.55308C9.53944 6.79174 9.65133 7.07777 9.65133 7.41345V23.198C9.65133 23.6108 9.98462 23.944 10.3974 23.944H21.4638C21.8666 23.944 22.267 24.0858 22.5431 24.3767C22.7668 24.6155 22.8812 24.9015 22.8812 25.2372V30.5856C22.8812 31.0457 22.6823 31.4982 22.3018 31.7569C22.078 31.9086 21.8244 31.9832 21.5383 31.9832L1.99199 31.9956C0.890348 31.9981 0 31.1078 0 30.0087Z" fill="#A3A3A3" />
      <path d="M36.5888 31.9926C34.4062 31.9876 32.492 31.6543 30.8413 30.9878C29.1906 30.3214 27.9104 29.2346 26.9981 27.7227C26.0856 26.2132 25.6333 24.2137 25.6382 21.7269L25.6532 13.7194L21.7016 13.7119C21.3486 13.7119 21.0528 13.5876 20.8116 13.3365C20.5705 13.0853 20.4512 12.7819 20.4537 12.4164L20.4636 7.39299C20.4636 7.02744 20.5854 6.72154 20.8265 6.47288C21.0677 6.22422 21.3635 6.09983 21.7165 6.10233L25.6681 6.10983L25.6779 1.29066C25.6779 0.925114 25.7998 0.619208 26.041 0.370548C26.2821 0.121887 26.5779 0 26.9309 0L33.9065 0.0124913C34.2595 0.0124913 34.5554 0.136772 34.7965 0.387931C35.0376 0.639089 35.1569 0.944995 35.1545 1.30805L35.1445 6.12721L41.2078 6.13959C41.5608 6.13959 41.8566 6.26398 42.0977 6.51514C42.3389 6.76629 42.4582 7.0722 42.4557 7.43525L42.4458 12.4586C42.4458 12.8242 42.3239 13.1301 42.0829 13.3787C41.8417 13.6274 41.5434 13.7518 41.1928 13.7493L35.1296 13.7368L35.1171 20.8988C35.1171 21.8613 35.3061 22.6148 35.6914 23.1618C36.0767 23.7089 36.6833 23.985 37.5186 23.985L41.5608 23.9925C41.9138 23.9925 42.2096 24.1168 42.4507 24.368C42.6919 24.6192 42.8113 24.9251 42.8088 25.2881L42.7988 30.7093C42.7988 31.075 42.677 31.3808 42.4358 31.6294C42.1947 31.8782 41.8963 32.0025 41.5459 32L36.5913 31.9901L36.5888 31.9926Z" fill="#A3A3A3" />
      <path d="M47.5486 31.9851C47.2282 31.9851 46.965 31.8682 46.7589 31.6369C46.5503 31.4056 46.4485 31.1395 46.4485 30.841C46.4485 30.7416 46.4634 30.6248 46.4957 30.4929C46.5279 30.3611 46.5926 30.2268 46.6869 30.0951L54.3506 18.9342C54.4648 18.7675 54.4673 18.5463 54.3556 18.3771L47.4543 8.01457C47.3896 7.91517 47.335 7.79827 47.2854 7.6664C47.2382 7.53463 47.2133 7.40036 47.2133 7.26859C47.2133 6.97017 47.3251 6.70403 47.5486 6.47275C47.7722 6.24147 48.0279 6.12458 48.316 6.12458H55.6444C56.0914 6.12458 56.4267 6.23158 56.6501 6.44787C56.8737 6.66426 57.0327 6.85328 57.1295 7.01993L60.3082 11.8169C60.5043 12.1128 60.939 12.1128 61.1352 11.8169L64.3139 7.01993C64.4405 6.85328 64.6094 6.66426 64.8156 6.44787C65.0216 6.23158 65.3494 6.12458 65.7964 6.12458H72.7896C73.0778 6.12458 73.331 6.24147 73.557 6.47275C73.7805 6.70403 73.8922 6.95268 73.8922 7.21883C73.8922 7.38547 73.8748 7.53463 73.8451 7.6664C73.8128 7.79827 73.7482 7.91517 73.6539 8.01457L66.6159 18.3747C66.4992 18.5463 66.5017 18.77 66.6209 18.9392L74.4212 30.0975C74.5181 30.2293 74.5801 30.3636 74.6124 30.4954C74.6448 30.6273 74.6596 30.744 74.6596 30.8435C74.6596 31.142 74.5479 31.4081 74.3244 31.6394C74.1008 31.8707 73.8451 31.9874 73.557 31.9874H65.8934C65.4786 31.9874 65.1756 31.888 64.9844 31.689C64.7932 31.4901 64.6317 31.3086 64.5051 31.142L60.9886 25.9544C60.7924 25.671 60.3753 25.6685 60.1766 25.9471L56.4118 31.1395C56.3149 31.3061 56.1634 31.4876 55.9573 31.6865C55.7488 31.8855 55.4383 31.9851 55.0236 31.9851H47.5486Z" fill="#A3A3A3" />
    </svg>
  );
}

/* ── Volume icon ────────────────────────────────────── */
export function VideoVolumeIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 select-none">
      <path d="M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5" />
      {!muted && <><path d="M15 8a5 5 0 0 1 0 8" /><path d="M17.7 5a9 9 0 0 1 0 14" /></>}
      {muted && <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  );
}

/* ── Segment control (shared by VideoSettingsPanel) ── */
export function SegmentControl({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  const idx = options.findIndex((o) => o.value === value);
  const count = options.length;
  const w = `calc((100% - 4px) / ${count})`;
  const left = `calc(2px + ${idx >= 0 ? idx : 0} * (100% - 4px) / ${count})`;
  return (
    <div className="relative flex rounded-lg p-0.5" style={{ background: "rgba(255,255,255,0.06)" }}>
      <div className="absolute top-0.5 bottom-0.5 rounded-md transition-all duration-200 ease-out" style={{ left, width: w, background: "rgba(255,255,255,0.08)" }} />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`nodrag relative z-10 flex-1 px-2 py-1.5 rounded-md text-sm transition-colors duration-200 ${
            value === o.value ? "text-white font-medium" : "text-zinc-400 hover:text-white"
          }`}
          onPointerDownCapture={(e) => e.stopPropagation()}
          onMouseDown={(e) => { e.preventDefault(); onChange(o.value); }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Image model constants ─────────────────────────── */
export const IMAGE_MODEL_MAP: Record<string, string> = {
  "nano-banana-2": "Nano Banana 2",
  "nano-banana-pro": "Nano Banana Pro",
  "nano-banana-pro-ultra": "Nano Banana Pro Ultra",
  "grok-imagine": "Grok Imagine",
  "z-image-turbo": "Z-Image Turbo",
  "gpt-image-2": "GPT Image 2",
  "gpt-image-2-lite": "GPT Image 2 Lite",
  "wan-2.7": "Wan 2.7",
  "doubao-seedream-4-5-251128": "SeeDream 4.5",
  "doubao-seedream-5-0-260128": "SeeDream 5.0 Lite",
};

export const IMAGE_MODELS = [
  { id: "nano-banana-2", name: "Nano Banana 2", descKey: "nanoBanana2Desc" },
  { id: "nano-banana-pro", name: "Nano Banana Pro", descKey: "nanoBananaProDesc" },
  { id: "nano-banana-pro-ultra", name: "Nano Banana Pro Ultra", descKey: "nanoBananaProUltraDesc" },
  { id: "gpt-image-2", name: "GPT Image 2", descKey: "gptImage2Desc" },
  { id: "gpt-image-2-lite", name: "GPT Image 2 Lite", descKey: "gptImage2LiteDesc" },
  { id: "grok-imagine", name: "Grok Imagine", descKey: "grokImagineDesc" },
  { id: "z-image-turbo", name: "Z-Image Turbo", descKey: "zImageTurboDesc" },
  { id: "wan-2.7", name: "Wan 2.7", descKey: "wan27Desc" },
  { id: "doubao-seedream-4-5-251128", name: "SeeDream 4.5", descKey: "seedream45Desc" },
  { id: "doubao-seedream-5-0-260128", name: "SeeDream 5.0 Lite", descKey: "seedream50Desc" },
];

export const IMAGE_MODEL_MAX_REFS: Record<string, number> = {
  "nano-banana-2": 14,
  "nano-banana-pro": 14,
  "nano-banana-pro-ultra": 10,
  "grok-imagine": 3,
  "z-image-turbo": 1,
  "gpt-image-2": 16,
  "gpt-image-2-lite": 16,
  "wan-2.7": 4,
  "doubao-seedream-4-5-251128": 14,
  "doubao-seedream-5-0-260128": 14,
};
export const DEFAULT_MAX_REFS = 1;

export const ASPECT_RATIOS = [
  { value: "1:1", label: "1:1", w: 1, h: 1 },
  { value: "9:16", label: "9:16", w: 9, h: 16 },
  { value: "16:9", label: "16:9", w: 16, h: 9 },
  { value: "3:4", label: "3:4", w: 3, h: 4 },
  { value: "4:3", label: "4:3", w: 4, h: 3 },
  { value: "3:2", label: "3:2", w: 3, h: 2 },
  { value: "2:3", label: "2:3", w: 2, h: 3 },
  { value: "5:4", label: "5:4", w: 5, h: 4 },
  { value: "4:5", label: "4:5", w: 4, h: 5 },
  { value: "21:9", label: "21:9", w: 21, h: 9 },
  { value: "2:1", label: "2:1", w: 2, h: 1 },
  { value: "1:2", label: "1:2", w: 1, h: 2 },
  { value: "20:9", label: "20:9", w: 20, h: 9 },
  { value: "9:20", label: "9:20", w: 9, h: 20 },
  { value: "19.5:9", label: "19.5:9", w: 19.5, h: 9 },
  { value: "9:19.5", label: "9:19.5", w: 9, h: 19.5 },
];

export const GROK_ONLY_RATIOS = new Set(["2:1", "1:2", "20:9", "9:20", "19.5:9", "9:19.5"]);

export const QUALITY_OPTIONS = ["512", "1K", "2K", "3K", "4K", "8K"];
export const OUTPUT_QUALITY_OPTIONS = ["low", "medium", "high"] as const;
export const OUTPUT_QUALITY_MODELS = new Set(["gpt-image-2"]);
export const THINKING_LEVEL_OPTIONS = ["minimal", "high"] as const;
export const THINKING_LEVEL_MODELS = new Set(["nano-banana-2"]);
export const WEB_SEARCH_MODELS = new Set(["nano-banana-2", "nano-banana-pro"]);
export const IMAGE_SEARCH_MODELS = new Set(["nano-banana-2"]);
export const MODEL_QUALITY_PRICE: Record<string, Record<string, number>> = {
  "nano-banana-2": { "1K": 9, "2K": 14, "4K": 20 },
  "nano-banana-pro": { "1K": 15, "2K": 15, "4K": 26 },
  "nano-banana-pro-ultra": { "4K": 20, "8K": 24 },
  "grok-imagine": { "1K": 3 },
  "z-image-turbo": { "1K": 2 },
  "gpt-image-2": { "1K": 7, "2K": 7, "4K": 13 },
  "gpt-image-2-lite": { "1K": 4, "2K": 6, "4K": 9 },
  "wan-2.7": { "1K": 4, "2K": 9 },
  "doubao-seedream-4-5-251128": { "2K": 6, "4K": 6 },
  "doubao-seedream-5-0-260128": { "2K": 6, "4K": 6 },
};

// 2D pricing for models with output_quality (精细度) dimension: model → size → outputQuality → xins
export const MODEL_OUTPUT_QUALITY_PRICE: Record<string, Record<string, Record<string, number>>> = {
  "gpt-image-2": {
    "1K":  { low: 1, medium: 7,  high: 27 },
    "2K":  { low: 1, medium: 7,  high: 28 },
    "4K":  { low: 2, medium: 13, high: 50 },
  },
};

export const MODEL_QUALITY_PRICE_I2I: Record<string, Record<string, number>> = {
  "grok-imagine": { "1K": 4 },
};

export const DEFAULT_MODEL: Record<string, string> = {
  text: "Gemini 2.5 Flash",
  "image-gen": "Nano Banana Pro",
  "video-gen": "Seedance 2.0",
};

export const TEXT_MODELS = [
  { id: "gemini-2.5-flash-preview-05-20", name: "Gemini 2.5 Flash", descKey: "gemini25flash", icon: "gemini" as const },
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", descKey: "deepseekV4flash", icon: "deepseek" as const },
  { id: "gpt-5.5", name: "ChatGPT 5.5", descKey: "gpt55", icon: "openai" as const },
];

export const VIDEO_VERSIONS = [
  { id: "3", name: "Kling 3.0", descKey: "kling3Desc", icon: "kling" as const },
  { id: "o3", name: "Kling O3", descKey: "klingO3Desc", icon: "kling" as const },
  { id: "grok-video", name: "Grok Video", descKey: "grokVideoDesc", icon: "grok" as const },
  { id: "seedance", name: "Seedance 1.5", descKey: "seedance15Desc", icon: "seedance" as const },
  { id: "seedance-2", name: "Seedance 2.0", descKey: "seedance20Desc", icon: "seedance" as const },
  { id: "seedance-2-fast", name: "Seedance 2.0 Fast", descKey: "seedance20FastDesc", icon: "seedance" as const },
  { id: "seedance-2-cli", name: "即梦 CLI Pro", descKey: "seedance20Desc", icon: "seedance" as const },
  { id: "seedance-2-fast-cli", name: "即梦 CLI Fast", descKey: "seedance20FastDesc", icon: "seedance" as const },
  { id: "wan-2.7-video", name: "Wan 2.7", descKey: "wan27VideoDesc", icon: "wan" as const },
  // { id: "ltx-2.3", name: "LTX 2.3", descKey: "ltx23Desc", icon: "ltx" as const }, // temporarily disabled – quality not stable
];

export const VIDEO_DURATIONS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
export const VIDEO_RATIOS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
];
export const GROK_VIDEO_RATIOS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "3:2", label: "3:2" },
  { value: "2:3", label: "2:3" },
];
export const GROK_VIDEO_DURATIONS = [5, 10, 15] as const;
export const GROK_VIDEO_RESOLUTIONS = [
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
];
export const LTX_RATIOS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
];
export const SEEDANCE_RATIOS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "21:9", label: "21:9" },
];
export const SEEDANCE_DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const SEEDANCE2_DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
export const SEEDANCE_RESOLUTIONS = [
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
];
export const SEEDANCE2_RESOLUTIONS = [
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
];
export const SEEDANCE2_FAST_RESOLUTIONS = [
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p" },
];
export const WAN_VIDEO_RATIOS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
];
export const WAN_VIDEO_DURATIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
export const WAN_VIDEO_DURATIONS_SHORT = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const WAN_VIDEO_RESOLUTIONS = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
];
export const LTX_DURATIONS_PRO = [6, 8, 10] as const;
export const LTX_DURATIONS_FAST = [6, 8, 10, 12, 14, 16, 18, 20] as const;
export const LTX_RESOLUTIONS = [
  { value: "1080p", label: "1080p" },
  { value: "1440p", label: "1440p" },
  { value: "2160p", label: "2160p (4K)" },
];
export const LTX_FPS_OPTIONS = [
  { value: "24", label: "24" },
  { value: "25", label: "25" },
  { value: "48", label: "48" },
  { value: "50", label: "50" },
];
export const KLING_RESOLUTIONS = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "4k", label: "4K" },
];
export const KLING_O3_RESOLUTIONS = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "4k", label: "4K" },
];
export const VIDEO_PRICE_PER_SEC: Record<string, { noAudio: number; audio: number }> = {
  "3-standard":  { noAudio: 10, audio: 15 },
  "3-pro":       { noAudio: 13, audio: 20 },
  "3-4k":        { noAudio: 49, audio: 49 },
  "o3-standard": { noAudio: 10, audio: 13 },
  "o3-pro":      { noAudio: 13, audio: 17 },
  "o3-4k":       { noAudio: 49, audio: 49 },
  "grok-video":  { noAudio: 7,  audio: 7 },
  "ltx-2.3-fast": { noAudio: 5, audio: 5 },
  "ltx-2.3-pro":  { noAudio: 8, audio: 8 },
  "seedance":         { noAudio: 8,  audio: 10 },
  "seedance-2":       { noAudio: 23.25, audio: 23.25 },
  "seedance-2-fast":  { noAudio: 20.25, audio: 20.25 },
  "wan-2.7-video":    { noAudio: 12, audio: 12 },
};
const LTX_RES_MULTIPLIER: Record<string, number> = { "1080p": 1, "1440p": 1.6, "2160p": 3 };
const SEEDANCE_RES_MULTIPLIER: Record<string, number> = { "480p": 0.6, "720p": 1, "1080p": 1.5 };
const SEEDANCE2_RES_MULTIPLIER: Record<string, number> = { "480p": 0.46, "720p": 1, "1080p": 2.5 };
const GROK_RES_MULTIPLIER: Record<string, number> = { "480p": 0.7, "720p": 1, "1080p": 1.5 };
const WAN_VIDEO_RES_MULTIPLIER: Record<string, number> = { "720p": 1, "1080p": 1.5 };

export function parseVideoModelId(modelId: string): { version: string; tier: string; key: string } {
  if (modelId === "grok-video") return { version: "grok-video", tier: "standard", key: "grok-video" };
  if (modelId === "wan-2.7-video") return { version: "wan-2.7-video", tier: "standard", key: "wan-2.7-video" };
  if (modelId === "seedance") return { version: "seedance", tier: "pro", key: "seedance" };
  if (modelId === "seedance-2") return { version: "seedance-2", tier: "pro", key: "seedance-2" };
  if (modelId === "seedance-2-fast") return { version: "seedance-2-fast", tier: "fast", key: "seedance-2-fast" };
  if (modelId === "seedance-2-cli") return { version: "seedance-2-cli", tier: "pro", key: "seedance-2" };
  if (modelId === "seedance-2-fast-cli") return { version: "seedance-2-fast-cli", tier: "fast", key: "seedance-2-fast" };
  if (modelId?.startsWith("ltx-")) {
    const tier = modelId.includes("pro") ? "pro" : "fast";
    return { version: "ltx-2.3", tier, key: `ltx-2.3-${tier}` };
  }
  if (modelId === "kling-3-4k") return { version: "3", tier: "4k", key: "3-4k" };
  if (modelId?.includes("o3")) {
    const tier = modelId.includes("4k") ? "4k" : modelId.includes("pro") ? "pro" : "standard";
    return { version: "o3", tier, key: `o3-${tier}` };
  }
  return { version: "3", tier: modelId?.includes("pro") ? "pro" : "standard", key: modelId?.includes("pro") ? "3-pro" : "3-standard" };
}

export function isGrokVideoModel(modelId: string): boolean {
  return modelId === "grok-video";
}

export function isLtxVideoModel(modelId: string): boolean {
  return modelId?.startsWith("ltx-") ?? false;
}

export function isWanVideoModel(modelId: string): boolean {
  return modelId === "wan-2.7-video";
}

export function isSeedanceVideoModel(modelId: string): boolean {
  return modelId === "seedance" || modelId === "seedance-2" || modelId === "seedance-2-fast" || modelId === "seedance-2-cli" || modelId === "seedance-2-fast-cli";
}

export function isSeedance2VideoModel(modelId: string): boolean {
  return modelId === "seedance-2" || modelId === "seedance-2-fast" || modelId === "seedance-2-cli" || modelId === "seedance-2-fast-cli";
}

export function calcVideoCredits(modelId: string, duration: number, audio: boolean, resolution?: string, hasVideoRef?: boolean, refVideoDuration?: number): number {
  const { key } = parseVideoModelId(modelId);
  const p = VIDEO_PRICE_PER_SEC[key] ?? VIDEO_PRICE_PER_SEC["3-standard"];
  const rate = audio ? p.audio : p.noAudio;
  let resMult = 1;
  if (key.startsWith("ltx-") && resolution) resMult = LTX_RES_MULTIPLIER[resolution] ?? 1;
  else if (key === "seedance" && resolution) resMult = SEEDANCE_RES_MULTIPLIER[resolution] ?? 1;
  else if ((key === "seedance-2" || key === "seedance-2-fast") && resolution) resMult = SEEDANCE2_RES_MULTIPLIER[resolution] ?? 1;
  else if (key === "grok-video" && resolution) resMult = GROK_RES_MULTIPLIER[resolution] ?? 1;
  else if (key === "wan-2.7-video" && resolution) resMult = WAN_VIDEO_RES_MULTIPLIER[resolution] ?? 1;
  const videoMult = (key === "seedance-2" || key === "seedance-2-fast") && hasVideoRef
    ? (refVideoDuration && refVideoDuration > 0 ? (refVideoDuration + duration) / duration : 2)
    : 1;
  return Math.ceil(rate * duration * resMult * videoMult);
}

/** Video-edit backend pricing (matches video-edit/route.ts) */
const VIDEO_EDIT_PRICE_PER_SEC: Record<string, number> = {
  "kling-o3-standard": 10,
  "kling-o3-pro":      20,
};

export function calcVideoEditCredits(modelId: string, duration: number): number {
  const editModelId = modelId.includes("o3") ? modelId : modelId.replace("kling-3", "kling-o3").replace("-4k", "-pro");
  const rate = VIDEO_EDIT_PRICE_PER_SEC[editModelId] ?? 10;
  return Math.ceil(rate * duration);
}
