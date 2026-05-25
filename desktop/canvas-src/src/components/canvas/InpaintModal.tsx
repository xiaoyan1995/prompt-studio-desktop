"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useAllPricing } from "@/hooks/use-pricing-promo";
import {
  X,
  Brush,
  Square,
  Eraser,
  Undo2,
  Redo2,
  ArrowUp,
} from "lucide-react";
import { compositeInWorker } from "@/lib/offthread-image";

/* ─── Types ─────────────────────────────────────────── */

export type InpaintMode = "redraw" | "erase";
type Tool = "brush" | "rect" | "eraser";

interface Stroke {
  tool: Tool;
  brushSize: number;
  points?: { x: number; y: number }[];
  rect?: { x: number; y: number; w: number; h: number };
}

interface Props {
  imageUrl: string;
  imageSize: string;
  mode?: InpaintMode;
  onClose: () => void;
  onGenerate: (prompt: string, compositeDataUrl: string, imageSize: string, mode: InpaintMode, modelId: string) => void;
  isGenerating?: boolean;
}

/* ─── Constants ─────────────────────────────────────── */

const MIN_BRUSH = 1;
const MAX_BRUSH = 100;
const DEFAULT_BRUSH = 30;
const PAINT_COLOR = "rgba(255, 80, 80, 0.45)";
const INPAINT_MODELS = [
  { id: "nano-banana-pro", label: "Nano Banana Pro" },
  { id: "nano-banana-2", label: "Nano Banana 2" },
] as const;

const MODEL_QUALITY_OPTIONS: Record<string, readonly string[]> = {
  "nano-banana-pro": ["1K", "2K", "4K"],
  "nano-banana-2": ["1K", "2K", "4K"],
};

const MODEL_QUALITY_PRICE: Record<string, Record<string, number>> = {
  "nano-banana-pro": { "1K": 15, "2K": 15, "4K": 26 },
  "nano-banana-2": { "1K": 9, "2K": 14, "4K": 20 },
};

/* ─── Component ─────────────────────────────────────── */

export function InpaintModal({ imageUrl, imageSize, mode = "redraw", onClose, onGenerate, isGenerating }: Props) {
  const t = useTranslations("inpaint");

  const [tool, setTool] = useState<Tool>("brush");
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH);
  const [modelId, setModelId] = useState("nano-banana-pro");
  const [quality, setQuality] = useState(imageSize || "2K");
  const [prompt, setPrompt] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);

  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const rectStartRef = useRef<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<ImageBitmap | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const qualityOptions = MODEL_QUALITY_OPTIONS[modelId] ?? ["1K", "2K", "4K"];
  const { getQualityPrices } = useAllPricing();
  const priceMap = getQualityPrices(modelId) ?? MODEL_QUALITY_PRICE[modelId] ?? MODEL_QUALITY_PRICE["nano-banana-pro"];
  const credits = priceMap[quality] ?? 0;
  const currentModelLabel = INPAINT_MODELS.find((m) => m.id === modelId)?.label ?? modelId;

  /* ─── Load source image (off main thread) ──────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(imageUrl, { credentials: "same-origin" });
        const blob = await res.blob();
        const bmp = await createImageBitmap(blob);
        if (cancelled) { bmp.close(); return; }
        imgRef.current = bmp;
        setImgDims({ w: bmp.width, h: bmp.height });
        setImgLoaded(true);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [imageUrl]);

  /* ─── Fit canvas to container ──────────────────────── */
  const recalcSize = useCallback(() => {
    if (!imgRef.current || !containerRef.current) return;
    const container = containerRef.current;
    const padding = 32;
    const cw = container.clientWidth - padding * 2;
    const ch = container.clientHeight - padding * 2;
    if (cw <= 0 || ch <= 0) return;
    const scale = Math.min(cw / imgDims.w, ch / imgDims.h);
    setCanvasSize({
      w: Math.round(imgDims.w * scale),
      h: Math.round(imgDims.h * scale),
    });
  }, [imgDims]);

  useEffect(() => {
    if (!imgLoaded) return;
    recalcSize();
  }, [imgLoaded, recalcSize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => recalcSize());
    ro.observe(container);
    return () => ro.disconnect();
  }, [recalcSize]);

  /* ─── Redraw mask overlay ──────────────────────────── */
  const redrawMask = useCallback(
    (extraStroke?: Stroke) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const all = extraStroke ? [...strokes, extraStroke] : strokes;

      for (const s of all) {
        if (!s) continue;
        ctx.save();
        if (s.tool === "eraser") {
          ctx.globalCompositeOperation = "destination-out";
        } else {
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = PAINT_COLOR;
          ctx.strokeStyle = PAINT_COLOR;
        }

        if (s.tool === "rect" && s.rect) {
          ctx.fillRect(s.rect.x, s.rect.y, s.rect.w, s.rect.h);
        } else if (s.points && s.points.length > 0) {
          ctx.lineWidth = s.brushSize;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.moveTo(s.points[0].x, s.points[0].y);
          for (let i = 1; i < s.points.length; i++) {
            ctx.lineTo(s.points[i].x, s.points[i].y);
          }
          ctx.stroke();
          if (s.points.length === 1) {
            ctx.beginPath();
            ctx.arc(s.points[0].x, s.points[0].y, s.brushSize / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    },
    [strokes],
  );

  useEffect(() => { redrawMask(); }, [redrawMask]);

  /* ─── Pointer helpers ────────────────────────────── */
  const getPos = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvasRef.current!.width,
      y: ((e.clientY - rect.top) / rect.height) * canvasRef.current!.height,
    };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    const pos = getPos(e);
    if (tool === "rect") {
      rectStartRef.current = pos;
      currentStrokeRef.current = { tool, brushSize, rect: { x: pos.x, y: pos.y, w: 0, h: 0 } };
    } else {
      currentStrokeRef.current = { tool, brushSize, points: [pos] };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    const pos = getPos(e);
    if (tool === "rect" && rectStartRef.current) {
      const sx = rectStartRef.current.x;
      const sy = rectStartRef.current.y;
      currentStrokeRef.current.rect = {
        x: Math.min(sx, pos.x), y: Math.min(sy, pos.y),
        w: Math.abs(pos.x - sx), h: Math.abs(pos.y - sy),
      };
    } else {
      currentStrokeRef.current.points?.push(pos);
    }
    redrawMask(currentStrokeRef.current);
  };

  const onPointerUp = () => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    isDrawingRef.current = false;
    const finished = currentStrokeRef.current;
    currentStrokeRef.current = null;
    rectStartRef.current = null;
    setStrokes((prev) => [...prev, finished]);
    setRedoStack([]);
  };

  /* ─── Undo / Redo ────────────────────────────────── */
  const undo = () => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [last, ...r]);
      return prev.slice(0, -1);
    });
  };

  const redo = () => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const first = prev[0];
      setStrokes((s) => [...s, first]);
      return prev.slice(1);
    });
  };

  /* ─── Export composite (off main thread via Worker) ── */
  const exportComposite = useCallback(async (): Promise<string> => {
    const bmp = imgRef.current;
    if (!bmp) return "";
    const copy = await createImageBitmap(bmp);
    return compositeInWorker(copy, strokes, imgDims.w, imgDims.h, canvasSize.w, canvasSize.h);
  }, [strokes, canvasSize, imgDims]);

  /* ─── Submit ───────────────────────────────────────── */
  const handleSubmit = async () => {
    if (!prompt.trim() || strokes.length === 0 || isGenerating) return;
    const composite = await exportComposite();
    onGenerate(prompt.trim(), composite, quality, mode, modelId);
  };

  /* ─── Keyboard shortcuts ───────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (e.key === "Z" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  /* ─── Cursor ───────────────────────────────────────── */
  const cursorStyle =
    tool === "eraser"
      ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${brushSize}' height='${brushSize}'%3E%3Ccircle cx='${brushSize / 2}' cy='${brushSize / 2}' r='${brushSize / 2 - 1}' fill='none' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E") ${brushSize / 2} ${brushSize / 2}, crosshair`
      : tool === "rect"
        ? "crosshair"
        : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${brushSize}' height='${brushSize}'%3E%3Ccircle cx='${brushSize / 2}' cy='${brushSize / 2}' r='${brushSize / 2 - 1}' fill='rgba(255,80,80,0.5)' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E") ${brushSize / 2} ${brushSize / 2}, crosshair`;

  const modeLabel = mode === "erase" ? t("eraseMode") : t("redrawMode");

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
      >
        {/* ── Top toolbar ─────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-2.5">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>

          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
            mode === "erase" ? "bg-white/10 text-zinc-300" : "bg-red-500/15 text-red-300"
          }`}>
            {modeLabel}
          </span>

          <div className="w-px h-6 bg-zinc-700/60" />

          <div className="flex items-center gap-1 p-1 rounded-full bg-zinc-800/60">
            <ToolBtn icon={Brush} active={tool === "brush"} label={t("brush")} onClick={() => setTool("brush")} />
            <ToolBtn icon={Square} active={tool === "rect"} label={t("rect")} onClick={() => setTool("rect")} />
            <ToolBtn icon={Eraser} active={tool === "eraser"} label={t("eraser")} onClick={() => setTool("eraser")} />
          </div>

          <div className="w-px h-6 bg-zinc-700/60" />

          <div className="flex items-center gap-2 w-28">
            <BrushPreview size={brushSize} />
            <input
              type="range"
              min={MIN_BRUSH}
              max={MAX_BRUSH}
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-full h-1.5 appearance-none bg-zinc-700 rounded-full cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md
                [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-300
                [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:transition-transform"
            />
          </div>

          <div className="w-px h-6 bg-zinc-700/60" />

          <div className="flex items-center gap-1">
            <button onClick={undo} disabled={strokes.length === 0} className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:pointer-events-none">
              <Undo2 size={18} />
            </button>
            <button onClick={redo} disabled={redoStack.length === 0} className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:pointer-events-none">
              <Redo2 size={18} />
            </button>
          </div>

          <div className="flex-1" />
          <span className="text-xs text-zinc-500">{t("maskHint")}</span>
        </div>

        {/* ── Canvas area ─────────────────────────────── */}
        <div ref={containerRef} className="flex-1 flex items-center justify-center min-h-0 overflow-hidden p-4">
          {imgLoaded && canvasSize.w > 0 ? (
            <div className="relative rounded-xl overflow-hidden" style={{ width: canvasSize.w, height: canvasSize.h }}>
              <img
                src={imageUrl}
                alt="source"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                draggable={false}
              />
              <canvas
                ref={canvasRef}
                width={canvasSize.w}
                height={canvasSize.h}
                className="absolute inset-0 w-full h-full"
                style={{ cursor: cursorStyle }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center text-zinc-500 text-sm">
              {t("loadingImage")}
            </div>
          )}
        </div>

        {/* ── Bottom generation panel (node-style) ────── */}
        <div>
          {/* Prompt textarea */}
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
              style={{ minHeight: 56, maxHeight: 120 }}
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
            {/* Left: Model selector + Quality selector */}
            <div className="flex items-center gap-2">
              {/* Model selector */}
              <div className="relative">
                <button
                  type="button"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] text-sm text-zinc-300 transition-colors"
                  onClick={() => setShowModelPicker((v) => !v)}
                >
                  <span className="truncate max-w-[140px]">{currentModelLabel}</span>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-zinc-500 shrink-0"><path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                {showModelPicker && (
                  <div className="absolute bottom-full mb-1 left-0 bg-[#252525] border border-white/10 rounded-lg py-1 min-w-[180px] z-10">
                    {INPAINT_MODELS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-white/5 transition ${m.id === modelId ? "text-[#CCFF00]" : "text-white/70"}`}
                        onClick={() => {
                          setModelId(m.id);
                          setShowModelPicker(false);
                          const newOpts = MODEL_QUALITY_OPTIONS[m.id] ?? [];
                          if (!newOpts.includes(quality)) setQuality(newOpts[0] ?? "2K");
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quality selector */}
              <div className="relative flex bg-white/[0.06] rounded-lg p-0.5">
                {qualityOptions.map((q) => (
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
            </div>

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
                  disabled={!prompt.trim() || strokes.length === 0 || isGenerating}
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

/* ─── Helper components ────────────────────────────── */

function ToolBtn({ icon: Icon, active, label, onClick }: { icon: typeof Brush; active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
        active ? "bg-white/20 text-white" : "text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
      }`}
      title={label}
    >
      <Icon size={18} />
    </button>
  );
}

function BrushPreview({ size }: { size: number }) {
  const s = Math.max(4, Math.min(24, (size / MAX_BRUSH) * 20 + 4));
  return (
    <div className="w-6 h-6 flex items-center justify-center shrink-0">
      <div className="rounded-full bg-zinc-300" style={{ width: s, height: s }} />
    </div>
  );
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
