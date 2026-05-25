"use client";

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { X, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCanvasStore } from "@/stores/canvas-store";
import { getImageOriginalUrl } from "@/lib/media-url";

const PRESETS = [
  { label: "2×2", cols: 2, rows: 2 },
  { label: "3×3", cols: 3, rows: 3 },
  { label: "4×4", cols: 4, rows: 4 },
];

const MIN_FRAC = 0.05;

function equalFractions(n: number): number[] {
  const arr: number[] = [0];
  for (let i = 1; i < n; i++) arr.push(i / n);
  arr.push(1);
  return arr;
}

function clampFraction(val: number, lo: number, hi: number): number {
  return Math.min(hi - MIN_FRAC, Math.max(lo + MIN_FRAC, val));
}

interface GridSplitModalProps {
  imageUrl: string;
  nodeData: Record<string, unknown>;
  nodeId: string;
  onClose: () => void;
}

export default function GridSplitModal({ imageUrl, nodeData, nodeId, onClose }: GridSplitModalProps) {
  const t = useTranslations("imageToolbar");
  const addNodeWithData = useCanvasStore((s) => s.addNodeWithData);
  const nodes = useCanvasStore((s) => s.nodes);

  const [colFracs, setColFracs] = useState<number[]>(() => equalFractions(3));
  const [rowFracs, setRowFracs] = useState<number[]>(() => equalFractions(3));
  const [splitting, setSplitting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  const numCols = colFracs.length - 1;
  const numRows = rowFracs.length - 1;

  const handleImgLoad = useCallback(() => {
    if (!imgRef.current || !containerRef.current) return;
    const { naturalWidth, naturalHeight } = imgRef.current;
    const containerRect = containerRef.current.getBoundingClientRect();
    const style = getComputedStyle(containerRef.current);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const maxW = containerRect.width - padX;
    const maxH = containerRect.height - padY;
    const scale = Math.min(maxW / naturalWidth, maxH / naturalHeight, 1);
    setImgSize({ w: Math.round(naturalWidth * scale), h: Math.round(naturalHeight * scale) });
  }, []);

  useEffect(() => {
    const handleResize = () => handleImgLoad();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleImgLoad]);

  const applyPreset = useCallback((cols: number, rows: number) => {
    setColFracs(equalFractions(cols));
    setRowFracs(equalFractions(rows));
  }, []);

  const draggingRef = useRef<{
    axis: "col" | "row";
    index: number;
    startFrac: number;
    startPointerPx: number;
    sizePx: number;
  } | null>(null);

  const handlePointerDown = useCallback(
    (axis: "col" | "row", index: number, e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!imgSize) return;
      const sizePx = axis === "col" ? imgSize.w : imgSize.h;
      const fracs = axis === "col" ? colFracs : rowFracs;
      draggingRef.current = {
        axis,
        index,
        startFrac: fracs[index],
        startPointerPx: axis === "col" ? e.clientX : e.clientY,
        sizePx,
      };

      const onMove = (ev: globalThis.PointerEvent) => {
        const d = draggingRef.current;
        if (!d) return;
        const deltaPx = (d.axis === "col" ? ev.clientX : ev.clientY) - d.startPointerPx;
        const deltaFrac = deltaPx / d.sizePx;
        const setFn = d.axis === "col" ? setColFracs : setRowFracs;
        setFn((prev) => {
          const next = [...prev];
          next[d.index] = clampFraction(d.startFrac + deltaFrac, prev[d.index - 1], prev[d.index + 1]);
          return next;
        });
      };

      const onUp = () => {
        draggingRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [imgSize, colFracs, rowFracs],
  );

  const handleSplit = useCallback(async () => {
    if (splitting) return;
    setSplitting(true);

    const originalUrl = getImageOriginalUrl(nodeData) ?? imageUrl;

    try {
      const res = await fetch("/api/images/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: originalUrl, cols: colFracs, rows: rowFracs }),
      });
      if (!res.ok) throw new Error(`Split failed: ${res.status}`);
      const { pieces } = await res.json() as {
        pieces: Array<{
          url: string;
          originalUrl: string;
          thumbnailUrl: string;
          thumbnailLevels: Record<string, string>;
          width: number;
          height: number;
          col: number;
          row: number;
        }>;
      };

      const sourceNode = nodes.find((n) => n.id === nodeId);
      const baseX = sourceNode ? sourceNode.position.x + Number(sourceNode.style?.width ?? sourceNode.width ?? 280) + 60 : 0;
      const baseY = sourceNode ? sourceNode.position.y : 0;

      const GAP = 20;
      const NODE_SHORT = 300;

      for (const piece of pieces) {
        const ratio = piece.width / piece.height;
        const nodeW = ratio >= 1 ? Math.round(NODE_SHORT * ratio) : NODE_SHORT;
        const nodeH = ratio >= 1 ? NODE_SHORT : Math.round(NODE_SHORT / ratio);

        const x = baseX + piece.col * (nodeW + GAP);
        const y = baseY + piece.row * (nodeH + GAP);

        addNodeWithData(
          "source-image",
          x,
          y,
          {
            imageUrl: piece.url,
            originalUrl: piece.originalUrl,
            thumbnailUrl: piece.thumbnailUrl,
            thumbnailLevels: piece.thumbnailLevels,
            originalImageUrls: [piece.originalUrl],
            status: "idle",
            label: `split-r${piece.row + 1}c${piece.col + 1}.png`,
          },
          { w: nodeW, h: nodeH },
        );
      }

      onClose();
    } catch (err) {
      console.error("Grid split failed:", err);
    } finally {
      setSplitting(false);
    }
  }, [splitting, colFracs, rowFracs, imageUrl, nodeData, nodeId, nodes, addNodeWithData, onClose]);

  const gridOverlay = useMemo(() => {
    if (!imgSize) return null;
    const { w, h } = imgSize;

    const verticalLines = colFracs.slice(1, -1).map((frac, i) => {
      const actualIndex = i + 1;
      const xPx = frac * w;
      return (
        <div
          key={`col-${actualIndex}`}
          className="absolute top-0 bottom-0 cursor-col-resize group/line z-10"
          style={{ left: xPx - 6, width: 12 }}
          onPointerDown={(e) => handlePointerDown("col", actualIndex, e)}
        >
          <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-white/60 group-hover/line:bg-[#CCFF00] group-hover/line:w-[2px] transition-all" />
        </div>
      );
    });

    const horizontalLines = rowFracs.slice(1, -1).map((frac, i) => {
      const actualIndex = i + 1;
      const yPx = frac * h;
      return (
        <div
          key={`row-${actualIndex}`}
          className="absolute left-0 right-0 cursor-row-resize group/line z-10"
          style={{ top: yPx - 6, height: 12 }}
          onPointerDown={(e) => handlePointerDown("row", actualIndex, e)}
        >
          <div className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 bg-white/60 group-hover/line:bg-[#CCFF00] group-hover/line:h-[2px] transition-all" />
        </div>
      );
    });

    const cellLabels: React.ReactElement[] = [];
    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        const x1 = colFracs[c] * w;
        const x2 = colFracs[c + 1] * w;
        const y1 = rowFracs[r] * h;
        const y2 = rowFracs[r + 1] * h;
        const cw = x2 - x1;
        const ch = y2 - y1;
        cellLabels.push(
          <div
            key={`cell-${r}-${c}`}
            className="absolute flex items-center justify-center pointer-events-none"
            style={{ left: x1, top: y1, width: cw, height: ch }}
          >
            <span className="text-[10px] font-mono text-white/40 bg-black/30 px-1 rounded">
              {r + 1},{c + 1}
            </span>
          </div>,
        );
      }
    }

    return (
      <>
        {verticalLines}
        {horizontalLines}
        {cellLabels}
      </>
    );
  }, [imgSize, colFracs, rowFracs, numCols, numRows, handlePointerDown]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex flex-col w-[90vw] max-w-[800px] h-[80vh] max-h-[700px] bg-[#1a1a1a] rounded-2xl border border-zinc-700/60 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">{t("gridSplit")}</h3>
          <button
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {/* Image + grid overlay */}
        <div ref={containerRef} className="flex-1 flex items-center justify-center p-6 overflow-hidden select-none">
          <div className="relative" style={imgSize ? { width: imgSize.w, height: imgSize.h } : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={imageUrl}
              alt=""
              className="block w-full h-full object-contain rounded"
              style={imgSize ? { width: imgSize.w, height: imgSize.h } : { maxWidth: "100%", maxHeight: "100%" }}
              onLoad={handleImgLoad}
              draggable={false}
            />
            {imgSize && (
              <div className="absolute inset-0 border border-white/30 rounded pointer-events-none" />
            )}
            {gridOverlay}
          </div>
        </div>

        {/* Footer: presets + confirm */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">{t("gridPresets")}:</span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  numCols === p.cols && numRows === p.rows
                    ? "bg-[#CCFF00]/20 text-[#CCFF00] border border-[#CCFF00]/30"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700/60"
                }`}
                onClick={() => applyPreset(p.cols, p.rows)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">
              {numRows}×{numCols} = {numRows * numCols} {t("gridPieces")}
            </span>
            <button
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#CCFF00] text-black hover:bg-[#CCFF00]/90 transition-colors disabled:opacity-50"
              onClick={handleSplit}
              disabled={splitting}
            >
              {splitting ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 size={13} className="animate-spin" />
                  {t("gridSplitting")}
                </span>
              ) : (
                t("gridConfirm")
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
