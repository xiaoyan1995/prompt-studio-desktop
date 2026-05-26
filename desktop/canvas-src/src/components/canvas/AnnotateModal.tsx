"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  X, Check, Pencil, Circle, ArrowUpRight, Square, Eraser,
  Minus, Plus, Undo2, Type,
} from "lucide-react";

/* ────────────────────────── types ────────────────────────── */

type Tool = "pen" | "circle" | "arrow" | "rect" | "eraser" | "text";

export interface AnnotationStroke {
  id: string;
  tool: Exclude<Tool, "eraser">;
  color: string;
  width: number;
  points?: { x: number; y: number }[];   // pen
  start?: { x: number; y: number };       // circle / arrow / rect
  end?: { x: number; y: number };         // circle / arrow / rect
  pos?: { x: number; y: number };         // text
  text?: string;                           // text
  fontSize?: number;                       // text
}

/* ────────────────────────── constants ────────────────────── */

const COLORS = [
  { value: "#facc15", label: "Yellow" },
  { value: "#f87171", label: "Red" },
  { value: "#60a5fa", label: "Blue" },
];

const WIDTH_OPTIONS = [2, 4, 6];

const TOOLS: { value: Tool; icon: typeof Pencil; labelKey: string }[] = [
  { value: "pen",    icon: Pencil,       labelKey: "annotatePen" },
  { value: "circle", icon: Circle,       labelKey: "annotateCircle" },
  { value: "arrow",  icon: ArrowUpRight, labelKey: "annotateArrow" },
  { value: "rect",   icon: Square,       labelKey: "annotateRect" },
  { value: "eraser", icon: Eraser,       labelKey: "annotateEraser" },
  { value: "text",   icon: Type,         labelKey: "annotateText" },
];

/* ────────────────────────── helpers ──────────────────────── */

let _idCounter = 0;
function uid() { return `ann_${Date.now()}_${_idCounter++}`; }

function svgPathFromPoints(pts: { x: number; y: number }[]) {
  if (pts.length === 0) return "";
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L${pts[i].x} ${pts[i].y}`;
  }
  return d;
}

function distToStroke(
  stroke: AnnotationStroke,
  px: number,
  py: number,
  threshold: number,
): boolean {
  if (stroke.tool === "pen" && stroke.points) {
    for (const p of stroke.points) {
      if (Math.hypot(p.x - px, p.y - py) < threshold) return true;
    }
  } else if (stroke.start && stroke.end) {
    const { start: s, end: e } = stroke;
    if (stroke.tool === "rect") {
      const edges = [
        [s, { x: e.x, y: s.y }], [{ x: e.x, y: s.y }, e],
        [e, { x: s.x, y: e.y }], [{ x: s.x, y: e.y }, s],
      ];
      for (const [a, b] of edges) {
        if (distToSegment(px, py, a.x, a.y, b.x, b.y) < threshold) return true;
      }
    } else if (stroke.tool === "circle") {
      const cx = (s.x + e.x) / 2, cy = (s.y + e.y) / 2;
      const rx = Math.abs(e.x - s.x) / 2, ry = Math.abs(e.y - s.y) / 2;
      if (rx === 0 && ry === 0) return false;
      const angle = Math.atan2(py - cy, px - cx);
      const epx = cx + rx * Math.cos(angle), epy = cy + ry * Math.sin(angle);
      if (Math.hypot(px - epx, py - epy) < threshold) return true;
    } else if (stroke.tool === "arrow") {
      if (distToSegment(px, py, s.x, s.y, e.x, e.y) < threshold) return true;
    }
  }
  return false;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/* ────────────────────────── render stroke ────────────────── */

function StrokeSVG({ stroke, opacity }: { stroke: AnnotationStroke; opacity?: number }) {
  const style: React.CSSProperties = { opacity: opacity ?? 0.7 };

  if (stroke.tool === "pen" && stroke.points) {
    return (
      <path
        d={svgPathFromPoints(stroke.points)}
        stroke={stroke.color}
        strokeWidth={stroke.width}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={style}
      />
    );
  }

  if (!stroke.start || !stroke.end) return null;
  const { start: s, end: e } = stroke;

  if (stroke.tool === "rect") {
    const x = Math.min(s.x, e.x), y = Math.min(s.y, e.y);
    const w = Math.abs(e.x - s.x), h = Math.abs(e.y - s.y);
    return <rect x={x} y={y} width={w} height={h} stroke={stroke.color} strokeWidth={stroke.width} fill="none" rx={2} style={style} />;
  }

  if (stroke.tool === "circle") {
    const cx = (s.x + e.x) / 2, cy = (s.y + e.y) / 2;
    const rx = Math.abs(e.x - s.x) / 2, ry = Math.abs(e.y - s.y) / 2;
    return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} stroke={stroke.color} strokeWidth={stroke.width} fill="none" style={style} />;
  }

  if (stroke.tool === "arrow") {
    const angle = Math.atan2(e.y - s.y, e.x - s.x);
    const headLen = 10 + stroke.width * 2;
    const p1x = e.x - headLen * Math.cos(angle - 0.4);
    const p1y = e.y - headLen * Math.sin(angle - 0.4);
    const p2x = e.x - headLen * Math.cos(angle + 0.4);
    const p2y = e.y - headLen * Math.sin(angle + 0.4);
    return (
      <g style={style}>
        <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" />
        <polyline points={`${p1x},${p1y} ${e.x},${e.y} ${p2x},${p2y}`} stroke={stroke.color} strokeWidth={stroke.width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );
  }

  if (stroke.tool === "text" && stroke.pos && stroke.text) {
    return (
      <text
        x={stroke.pos.x}
        y={stroke.pos.y}
        fill={stroke.color}
        fontSize={stroke.fontSize ?? 44}
        fontFamily="system-ui,-apple-system,sans-serif"
        fontWeight="700"
        style={style}
      >
        {stroke.text}
      </text>
    );
  }

  return null;
}

/* ───────────────── exported read-only overlay ───────────── */

export function AnnotationOverlay({ annotations, className }: { annotations: AnnotationStroke[]; className?: string }) {
  if (!annotations || annotations.length === 0) return null;
  return (
    <svg className={className ?? "absolute inset-0 w-full h-full pointer-events-none"} viewBox="0 0 1000 1000" preserveAspectRatio="none">
      {annotations.map((s) => <StrokeSVG key={s.id} stroke={s} />)}
    </svg>
  );
}

/* ────────────────────────── modal ────────────────────────── */

interface Props {
  imageUrl: string;
  annotations: AnnotationStroke[];
  onClose: () => void;
  onSave: (annotations: AnnotationStroke[]) => void;
}

export function AnnotateModal({ imageUrl, annotations: initial, onClose, onSave }: Props) {
  const t = useTranslations("canvas");

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0].value);
  const [strokeWidth, setStrokeWidth] = useState(WIDTH_OPTIONS[1]);
  const [strokes, setStrokes] = useState<AnnotationStroke[]>(initial);
  const [currentStroke, setCurrentStroke] = useState<AnnotationStroke | null>(null);
  const [hoveredEraseId, setHoveredEraseId] = useState<string | null>(null);
  const [history, setHistory] = useState<AnnotationStroke[][]>([]);
  const [textInput, setTextInput] = useState<{ svgPos: { x: number; y: number }; screenPos: { x: number; y: number }; value: string } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  const [displayRect, setDisplayRect] = useState({ x: 0, y: 0, w: 0, h: 0 });

  // Fit image into viewport
  useEffect(() => {
    if (!imgLoaded || !imgNatural.w) return;
    const pad = 120;
    const cw = window.innerWidth - pad * 2;
    const ch = window.innerHeight - pad * 2;
    const scale = Math.min(cw / imgNatural.w, ch / imgNatural.h, 1);
    const dw = imgNatural.w * scale;
    const dh = imgNatural.h * scale;
    const dx = (window.innerWidth - dw) / 2;
    const dy = (window.innerHeight - dh) / 2;
    setDisplayRect({ x: dx, y: dy, w: dw, h: dh });
  }, [imgLoaded, imgNatural]);

  const toSvgCoords = useCallback((clientX: number, clientY: number) => {
    const { x, y, w, h } = displayRect;
    return {
      x: ((clientX - x) / w) * 1000,
      y: ((clientY - y) / h) * 1000,
    };
  }, [displayRect]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const pt = toSvgCoords(e.clientX, e.clientY);

    if (tool === "text") {
      setTextInput({ svgPos: pt, screenPos: { x: e.clientX, y: e.clientY }, value: "" });
      return;
    }

    if (tool === "eraser") {
      const threshold = 20 + strokeWidth * 2;
      const hit = [...strokes].reverse().find((s) => distToStroke(s, pt.x, pt.y, threshold));
      if (hit) {
        setHistory((prev) => [...prev, strokes]);
        setStrokes((prev) => prev.filter((s) => s.id !== hit.id));
      }
      return;
    }

    const id = uid();
    if (tool === "pen") {
      setCurrentStroke({ id, tool: "pen", color, width: strokeWidth, points: [pt] });
    } else {
      setCurrentStroke({ id, tool, color, width: strokeWidth, start: pt, end: pt });
    }
  }, [tool, color, strokeWidth, strokes, toSvgCoords]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const pt = toSvgCoords(e.clientX, e.clientY);

    if (tool === "eraser") {
      const threshold = 20 + strokeWidth * 2;
      const hit = [...strokes].reverse().find((s) => distToStroke(s, pt.x, pt.y, threshold));
      setHoveredEraseId(hit?.id ?? null);
      return;
    }

    if (!currentStroke) return;

    if (currentStroke.tool === "pen") {
      setCurrentStroke((prev) => prev ? { ...prev, points: [...(prev.points ?? []), pt] } : null);
    } else {
      setCurrentStroke((prev) => prev ? { ...prev, end: pt } : null);
    }
  }, [tool, strokeWidth, strokes, currentStroke, toSvgCoords]);

  const handlePointerUp = useCallback(() => {
    if (currentStroke) {
      setHistory((prev) => [...prev, strokes]);
      setStrokes((prev) => [...prev, currentStroke]);
      setCurrentStroke(null);
    }
    setHoveredEraseId(null);
  }, [currentStroke, strokes]);

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setStrokes(last);
      return prev.slice(0, -1);
    });
  }, []);

  const commitText = useCallback((value: string) => {
    if (!textInput) return;
    if (value.trim()) {
      setHistory((h) => [...h, strokes]);
      setStrokes((prev) => [...prev, {
        id: uid(),
        tool: "text" as const,
        color,
        width: strokeWidth,
        pos: textInput.svgPos,
        text: value.trim(),
        fontSize: 32 + strokeWidth * 6,
      }]);
    }
    setTextInput(null);
  }, [textInput, strokes, color, strokeWidth]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleUndo]);

  const handleSave = useCallback(() => {
    onSave(strokes);
    onClose();
  }, [strokes, onSave, onClose]);

  const widthIdx = WIDTH_OPTIONS.indexOf(strokeWidth);
  const canDecrease = widthIdx > 0;
  const canIncrease = widthIdx < WIDTH_OPTIONS.length - 1;

  const cursorStyle = useMemo(() => {
    if (tool === "eraser") return "crosshair";
    return "crosshair";
  }, [tool]);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ cursor: cursorStyle }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Image */}
      <img
        src={imageUrl}
        alt="annotate"
        className="absolute pointer-events-none select-none"
        draggable={false}
        style={{
          left: displayRect.x,
          top: displayRect.y,
          width: displayRect.w,
          height: displayRect.h,
        }}
        onLoad={(e) => {
          const img = e.currentTarget;
          setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
          setImgLoaded(true);
        }}
      />

      {/* SVG drawing layer */}
      <svg
        ref={svgRef}
        className="absolute"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        style={{
          left: displayRect.x,
          top: displayRect.y,
          width: displayRect.w,
          height: displayRect.h,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {strokes.map((s) => (
          <StrokeSVG
            key={s.id}
            stroke={s}
            opacity={hoveredEraseId === s.id ? 0.3 : 0.7}
          />
        ))}
        {currentStroke && <StrokeSVG stroke={currentStroke} />}
      </svg>

      {/* ── Text input overlay ── */}
      {textInput && (
        <div
          className="absolute z-20"
          style={{ left: textInput.screenPos.x, top: textInput.screenPos.y }}
        >
          <input
            autoFocus
            className="min-w-[140px] bg-transparent border-b-2 border-white outline-none font-bold px-1"
            style={{ color: textInput.value ? color : undefined, caretColor: "white", fontSize: 18, borderColor: color }}
            placeholder="输入文字..."
            value={textInput.value}
            onChange={(e) => setTextInput((prev) => prev ? { ...prev, value: e.target.value } : null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitText(textInput.value); }
              if (e.key === "Escape") { setTextInput(null); }
            }}
            onBlur={() => commitText(textInput.value)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ── Top bar: close / save ── */}
      <div className="relative z-10 flex items-center justify-between px-4 py-3">
        <button
          className="flex items-center justify-center w-9 h-9 rounded-full bg-black/50 text-white hover:bg-black/70 transition"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <span className="text-white/80 text-sm font-medium">{t("annotateTitle")}</span>
        <button
          className="flex items-center justify-center w-9 h-9 rounded-full bg-white text-black hover:bg-white/80 transition"
          onClick={handleSave}
        >
          <Check size={18} />
        </button>
      </div>

      {/* ── Bottom toolbar ── */}
      <div className="relative z-10 mt-auto flex items-center justify-center pb-6">
        <div className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-[#1a1a1a]/90 border border-zinc-800 shadow-xl">
          {/* Tools */}
          {TOOLS.map((t) => {
            const Icon = t.icon;
            const active = tool === t.value;
            return (
              <button
                key={t.value}
                className={`flex items-center justify-center w-9 h-9 rounded-xl transition ${
                  active ? "bg-white text-black" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                }`}
                onClick={() => setTool(t.value)}
              >
                <Icon size={17} />
              </button>
            );
          })}

          {/* Undo */}
          <button
            className="flex items-center justify-center w-9 h-9 rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-white transition disabled:opacity-25 disabled:cursor-not-allowed"
            onClick={handleUndo}
            disabled={history.length === 0}
          >
            <Undo2 size={17} />
          </button>

          <div className="w-px h-5 bg-zinc-700 mx-1" />

          {/* Colors */}
          {COLORS.map((c) => (
            <button
              key={c.value}
              className={`w-7 h-7 rounded-full transition border-2 ${
                color === c.value ? "border-white scale-110" : "border-transparent hover:border-white/40"
              }`}
              style={{ backgroundColor: c.value }}
              onClick={() => setColor(c.value)}
            />
          ))}

          <div className="w-px h-5 bg-zinc-700 mx-1" />

          {/* Stroke width */}
          <button
            className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition disabled:opacity-30 disabled:cursor-not-allowed"
            disabled={!canDecrease}
            onClick={() => canDecrease && setStrokeWidth(WIDTH_OPTIONS[widthIdx - 1])}
          >
            <Minus size={14} />
          </button>
          <div
            className="flex items-center justify-center w-5 h-5"
          >
            <div
              className="rounded-full bg-white"
              style={{ width: strokeWidth * 2 + 2, height: strokeWidth * 2 + 2 }}
            />
          </div>
          <button
            className="flex items-center justify-center w-7 h-7 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition disabled:opacity-30 disabled:cursor-not-allowed"
            disabled={!canIncrease}
            onClick={() => canIncrease && setStrokeWidth(WIDTH_OPTIONS[widthIdx + 1])}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
