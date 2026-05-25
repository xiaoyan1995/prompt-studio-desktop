"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X, RotateCcw, ArrowUp } from "lucide-react";

const MAX_EXPAND = 700;
const HANDLE_SIZE = 12;
const CHECKERBOARD = "repeating-conic-gradient(rgba(255,255,255,0.06) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px";
const QUALITY_OPTIONS = ["1K", "2K", "4K"] as const;

type OutpaintModel = "outpaint-v2" | "nano-banana-pro";
const OUTPAINT_MODELS: { id: OutpaintModel; label: string }[] = [
  { id: "outpaint-v2", label: "Outpaint V2" },
  { id: "nano-banana-pro", label: "NanaBanana Pro" },
];
const MODEL_PRICE: Record<OutpaintModel, Record<string, number>> = {
  "outpaint-v2": { default: 4 },
  "nano-banana-pro": { "1K": 15, "2K": 15, "4K": 26 },
};

type Side = "top" | "right" | "bottom" | "left";

interface Expand {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Props {
  imageUrl: string;
  onClose: () => void;
  onGenerate: (expand: Expand, prompt: string, quality: string, model: OutpaintModel) => void;
  isGenerating?: boolean;
}

function CreditsSvg() {
  return (
    <svg width="16" height="16" viewBox="0 0 100 100" fill="none" style={{ stroke: "#ccc" }}>
      <path d="M50,5l43.3,25v40l-43.3,25L6.7,70V30L50,5Z" strokeWidth="7" strokeOpacity="0.8" />
      <line x1="49" y1="90" x2="49" y2="50" strokeWidth="9" strokeLinecap="square" />
      <path d="M50,50c-13.33-6.67-25-18.33-35-35" strokeWidth="7" strokeLinecap="round" />
      <path d="M50,50c13.33-6.67,25-18.33,35-35" strokeWidth="7" strokeLinecap="round" />
      <circle cx="50" cy="50" r="7" fill="#ccc" stroke="none" />
    </svg>
  );
}

export function OutpaintModal({ imageUrl, onClose, onGenerate, isGenerating }: Props) {
  const t = useTranslations("outpaint");

  const [expand, setExpand] = useState<Expand>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [prompt, setPrompt] = useState("");
  const [quality, setQuality] = useState("2K");
  const [model, setModel] = useState<OutpaintModel>("outpaint-v2");
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ side: Side; startPos: number; startVal: number } | null>(null);

  const [displayScale, setDisplayScale] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(imageUrl, { credentials: "same-origin" });
        const blob = await res.blob();
        const bmp = await createImageBitmap(blob);
        if (cancelled) { bmp.close(); return; }
        setImgSize({ w: bmp.width, h: bmp.height });
        setImgLoaded(true);
        bmp.close();
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [imageUrl]);

  const recalcScale = useCallback(() => {
    if (!imgSize.w || !containerRef.current) return;
    const container = containerRef.current;
    const padding = 80;
    const maxExpandDisplay = MAX_EXPAND;
    const totalW = imgSize.w + maxExpandDisplay * 2;
    const totalH = imgSize.h + maxExpandDisplay * 2;
    const cw = container.clientWidth - padding * 2;
    const ch = container.clientHeight - padding * 2;
    if (cw <= 0 || ch <= 0) return;
    setDisplayScale(Math.min(cw / totalW, ch / totalH, 0.6));
  }, [imgSize]);

  useEffect(() => {
    if (!imgLoaded) return;
    recalcScale();
  }, [imgLoaded, recalcScale]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => recalcScale());
    ro.observe(container);
    return () => ro.disconnect();
  }, [recalcScale]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const scaledW = Math.round(imgSize.w * displayScale);
  const scaledH = Math.round(imgSize.h * displayScale);

  const scaleExpand = (px: number) => Math.round(px * displayScale);

  const handlePointerDown = useCallback((side: Side, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const startPos = (side === "left" || side === "right") ? e.clientX : e.clientY;
    dragRef.current = { side, startPos, startVal: expand[side] };
  }, [expand]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { side, startPos, startVal } = dragRef.current;
    const isHoriz = side === "left" || side === "right";
    const currentPos = isHoriz ? e.clientX : e.clientY;
    const delta = currentPos - startPos;
    const direction = (side === "right" || side === "bottom") ? 1 : -1;
    const pixelDelta = Math.round((delta * direction) / displayScale);
    const newVal = Math.max(0, Math.min(MAX_EXPAND, startVal + pixelDelta));
    setExpand((prev) => ({ ...prev, [side]: newVal }));
  }, [displayScale]);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const totalExpand = expand.top + expand.right + expand.bottom + expand.left;
  const isNanaBanana = model === "nano-banana-pro";
  const credits = isNanaBanana
    ? (MODEL_PRICE["nano-banana-pro"][quality] ?? 15)
    : MODEL_PRICE["outpaint-v2"].default;

  const handleSubmit = () => {
    if (totalExpand === 0 || isGenerating) return;
    onGenerate(expand, prompt, quality, model);
  };

  const handleReset = () => setExpand({ top: 0, right: 0, bottom: 0, left: 0 });

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex flex-col w-[90vw] max-w-[1100px] h-[85vh] rounded-[20px] overflow-hidden border border-zinc-700/60 bg-[#1e1e1e] shadow-[0_30px_100px_rgba(0,0,0,0.8)]"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Top toolbar */}
        <div className="flex items-center gap-2 px-4 py-2.5">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>

          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-300">
            {t("title")}
          </span>

          <div className="w-px h-6 bg-zinc-700/60" />

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <RotateCcw size={14} />
            <span>{t("reset")}</span>
          </button>

          <div className="w-px h-6 bg-zinc-700/60" />

          <div className="relative flex bg-white/[0.06] rounded-lg p-0.5">
            {OUTPAINT_MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`relative z-10 px-3 py-1.5 rounded-md text-xs transition-colors duration-200 ${
                  model === m.id ? "text-white bg-white/[0.08]" : "text-zinc-500 hover:text-zinc-200"
                }`}
                onClick={() => setModel(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />
          <span className="text-xs text-zinc-500">{t("dragHint")}</span>
        </div>

        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center min-h-0 overflow-hidden p-4"
        >
          {imgLoaded && scaledW > 0 ? (
            <div
              className="relative"
              style={{
                width: scaledW + scaleExpand(expand.left) + scaleExpand(expand.right),
                height: scaledH + scaleExpand(expand.top) + scaleExpand(expand.bottom),
              }}
            >
              {/* Expand overlays */}
              {/* Top */}
              {expand.top > 0 && (
                <div
                  className="absolute left-0 right-0 top-0 border border-dashed border-zinc-500/40"
                  style={{
                    height: scaleExpand(expand.top),
                    background: CHECKERBOARD,
                  }}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400 font-mono">
                    {expand.top}{t("px")}
                  </span>
                </div>
              )}
              {/* Bottom */}
              {expand.bottom > 0 && (
                <div
                  className="absolute left-0 right-0 bottom-0 border border-dashed border-zinc-500/40"
                  style={{
                    height: scaleExpand(expand.bottom),
                    background: CHECKERBOARD,
                  }}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400 font-mono">
                    {expand.bottom}{t("px")}
                  </span>
                </div>
              )}
              {/* Left */}
              {expand.left > 0 && (
                <div
                  className="absolute left-0 border border-dashed border-zinc-500/40"
                  style={{
                    top: scaleExpand(expand.top),
                    width: scaleExpand(expand.left),
                    height: scaledH,
                    background: CHECKERBOARD,
                  }}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400 font-mono">
                    {expand.left}{t("px")}
                  </span>
                </div>
              )}
              {/* Right */}
              {expand.right > 0 && (
                <div
                  className="absolute right-0 border border-dashed border-zinc-500/40"
                  style={{
                    top: scaleExpand(expand.top),
                    width: scaleExpand(expand.right),
                    height: scaledH,
                    background: CHECKERBOARD,
                  }}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400 font-mono">
                    {expand.right}{t("px")}
                  </span>
                </div>
              )}

              {/* Image */}
              <img
                src={imageUrl}
                alt="source"
                className="absolute object-contain pointer-events-none select-none rounded-md"
                draggable={false}
                style={{
                  top: scaleExpand(expand.top),
                  left: scaleExpand(expand.left),
                  width: scaledW,
                  height: scaledH,
                }}
              />

              {/* Drag handles — positioned at the outer frame boundary */}
              {/* Top handle */}
              <div
                className="absolute left-0 right-0 flex justify-center cursor-n-resize z-10"
                style={{ top: -HANDLE_SIZE / 2, height: HANDLE_SIZE }}
                onPointerDown={(e) => handlePointerDown("top", e)}
              >
                <div className="w-12 h-1.5 rounded-full bg-zinc-400/60 hover:bg-white/80 transition-colors" />
              </div>
              {/* Bottom handle */}
              <div
                className="absolute left-0 right-0 flex justify-center cursor-s-resize z-10"
                style={{ bottom: -HANDLE_SIZE / 2, height: HANDLE_SIZE }}
                onPointerDown={(e) => handlePointerDown("bottom", e)}
              >
                <div className="w-12 h-1.5 rounded-full bg-zinc-400/60 hover:bg-white/80 transition-colors" />
              </div>
              {/* Left handle */}
              <div
                className="absolute top-0 bottom-0 flex items-center cursor-w-resize z-10"
                style={{ left: -HANDLE_SIZE / 2, width: HANDLE_SIZE }}
                onPointerDown={(e) => handlePointerDown("left", e)}
              >
                <div className="h-12 w-1.5 rounded-full bg-zinc-400/60 hover:bg-white/80 transition-colors" />
              </div>
              {/* Right handle */}
              <div
                className="absolute top-0 bottom-0 flex items-center cursor-e-resize z-10"
                style={{ right: -HANDLE_SIZE / 2, width: HANDLE_SIZE }}
                onPointerDown={(e) => handlePointerDown("right", e)}
              >
                <div className="h-12 w-1.5 rounded-full bg-zinc-400/60 hover:bg-white/80 transition-colors" />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center text-zinc-500 text-sm">
              {t("loadingImage")}
            </div>
          )}
        </div>

        {/* Bottom panel */}
        <div>
          {/* Prompt */}
          <div className="relative px-3 pt-3 pb-2">
            {!prompt && (
              <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-1 text-sm leading-7 text-zinc-500">
                <span>{t("promptPlaceholder")}</span>
              </div>
            )}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full resize-none border-0 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-0"
              style={{ minHeight: 44, maxHeight: 80 }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-between w-full p-2 h-14">
            {/* Left: expand summary */}
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 pl-1">
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <div key={side} className="flex items-center gap-0.5">
                  <span className="text-zinc-500">{t(side)}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={expand[side]}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      const val = Math.min(Number(raw) || 0, MAX_EXPAND);
                      setExpand((prev) => ({ ...prev, [side]: val }));
                    }}
                    className="w-9 bg-transparent text-center text-xs tabular-nums rounded px-0.5 py-0.5 border border-transparent hover:border-zinc-600 focus:border-zinc-500 focus:bg-zinc-800/50 focus:outline-none transition-colors text-zinc-200"
                  />
                </div>
              ))}
            </div>

            {/* Center: Quality selector (Nano Banana Pro only) */}
            {isNanaBanana && (
            <div className="relative flex bg-white/[0.06] rounded-lg p-0.5">
              {QUALITY_OPTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`relative z-10 px-3 py-1.5 rounded-md text-sm transition-colors duration-200 ${
                    quality === q ? "text-white bg-white/[0.08]" : "text-zinc-500 hover:text-zinc-200"
                  }`}
                  onClick={() => setQuality(q)}
                >
                  {q}
                </button>
              ))}
            </div>
            )}

            {/* Right: Credits pill + send */}
            <div className="flex items-center gap-1">
              <div
                className="flex items-center gap-1 rounded-full p-1 border border-white/10"
                style={{
                  backdropFilter: "blur(10px)",
                  background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)",
                }}
              >
                <div className="flex items-center text-sm text-zinc-200 font-medium pl-1">
                  <CreditsSvg />
                  <span className="relative inline-flex min-w-[24px] justify-center tabular-nums text-xs">{credits}</span>
                </div>
                <button
                  type="button"
                  disabled={totalExpand === 0 || isGenerating}
                  className="w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all"
                  onClick={handleSubmit}
                >
                  {isGenerating ? (
                    <span className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-black rounded-full animate-spin" />
                  ) : (
                    <ArrowUp size={14} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
