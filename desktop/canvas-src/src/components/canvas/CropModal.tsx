"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X, Check, RectangleHorizontal } from "lucide-react";
import { cropInWorker } from "@/lib/offthread-image";

const ASPECT_RATIOS = [
  { label: "Free", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
] as const;

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  imageUrl: string;
  onClose: () => void;
  onCrop: (blob: Blob, width: number, height: number) => void;
}

export function CropModal({ imageUrl, onClose, onCrop }: Props) {
  const t = useTranslations("crop");

  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  const [displayScale, setDisplayScale] = useState(1);
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 });
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
  const [aspectIdx, setAspectIdx] = useState(0);
  const [dragging, setDragging] = useState<null | "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w">(null);
  const dragStart = useRef({ mx: 0, my: 0, crop: { x: 0, y: 0, w: 0, h: 0 } });

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const aspectRatio = ASPECT_RATIOS[aspectIdx].value;

  useEffect(() => {
    if (!imgLoaded || !imgNatural.w) return;
    const cw = window.innerWidth * 0.75;
    const ch = window.innerHeight * 0.7;
    const scale = Math.min(cw / imgNatural.w, ch / imgNatural.h, 1);
    setDisplayScale(scale);
    const dw = imgNatural.w * scale;
    const dh = imgNatural.h * scale;
    setImgOffset({ x: (window.innerWidth - dw) / 2, y: (window.innerHeight - dh) / 2 });
    setCrop({ x: 0, y: 0, w: dw, h: dh });
  }, [imgLoaded, imgNatural]);

  const clampCrop = useCallback((c: CropRect, dw: number, dh: number): CropRect => {
    let { x, y, w, h } = c;
    const MIN = 20;
    w = Math.max(MIN, Math.min(w, dw));
    h = Math.max(MIN, Math.min(h, dh));
    x = Math.max(0, Math.min(x, dw - w));
    y = Math.max(0, Math.min(y, dh - h));
    return { x, y, w, h };
  }, []);

  const applyAspect = useCallback((c: CropRect, ratio: number | null, dw: number, dh: number): CropRect => {
    if (!ratio) return c;
    let { x, y, w, h } = c;
    if (w / h > ratio) {
      w = h * ratio;
    } else {
      h = w / ratio;
    }
    return clampCrop({ x, y, w, h }, dw, dh);
  }, [clampCrop]);

  const handleMouseDown = useCallback((e: React.MouseEvent, handle: NonNullable<typeof dragging>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(handle);
    dragStart.current = { mx: e.clientX, my: e.clientY, crop: { ...crop } };
  }, [crop]);

  useEffect(() => {
    if (!dragging) return;
    const dw = imgNatural.w * displayScale;
    const dh = imgNatural.h * displayScale;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      const s = dragStart.current.crop;
      let next: CropRect;

      if (dragging === "move") {
        next = { x: s.x + dx, y: s.y + dy, w: s.w, h: s.h };
      } else {
        let nx = s.x, ny = s.y, nw = s.w, nh = s.h;
        if (dragging.includes("w")) { nx = s.x + dx; nw = s.w - dx; }
        if (dragging.includes("e")) { nw = s.w + dx; }
        if (dragging.includes("n")) { ny = s.y + dy; nh = s.h - dy; }
        if (dragging.includes("s")) { nh = s.h + dy; }
        if (nw < 20) { nw = 20; if (dragging.includes("w")) nx = s.x + s.w - 20; }
        if (nh < 20) { nh = 20; if (dragging.includes("n")) ny = s.y + s.h - 20; }

        if (aspectRatio) {
          if (dragging === "n" || dragging === "s") {
            nw = nh * aspectRatio;
          } else {
            nh = nw / aspectRatio;
          }
          if (dragging.includes("n")) ny = s.y + s.h - nh;
          if (dragging.includes("w")) nx = s.x + s.w - nw;
        }

        next = { x: nx, y: ny, w: nw, h: nh };
      }
      setCrop(clampCrop(next, dw, dh));
    };

    const onUp = () => setDragging(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, imgNatural, displayScale, clampCrop, aspectRatio]);

  const handleConfirm = useCallback(async () => {
    const scale = displayScale;
    const sx = Math.round(crop.x / scale);
    const sy = Math.round(crop.y / scale);
    const sw = Math.round(crop.w / scale);
    const sh = Math.round(crop.h / scale);

    const res = await fetch(imageUrl, { credentials: "same-origin" });
    const srcBlob = await res.blob();
    const bmp = await createImageBitmap(srcBlob);

    const blob = await cropInWorker(bmp, sx, sy, sw, sh);
    if (blob) onCrop(blob, sw, sh);
  }, [crop, displayScale, imageUrl, onCrop]);

  const handleAspectChange = useCallback((idx: number) => {
    setAspectIdx(idx);
    const ratio = ASPECT_RATIOS[idx].value;
    const dw = imgNatural.w * displayScale;
    const dh = imgNatural.h * displayScale;
    setCrop((prev) => applyAspect(prev, ratio, dw, dh));
  }, [imgNatural, displayScale, applyAspect]);

  if (typeof document === "undefined") return null;

  const dw = imgNatural.w * displayScale;
  const dh = imgNatural.h * displayScale;
  const HANDLE = 8;

  const handles: { key: NonNullable<typeof dragging>; style: React.CSSProperties; cursor: string }[] = [
    { key: "nw", style: { left: -HANDLE / 2, top: -HANDLE / 2 }, cursor: "nwse-resize" },
    { key: "ne", style: { right: -HANDLE / 2, top: -HANDLE / 2 }, cursor: "nesw-resize" },
    { key: "sw", style: { left: -HANDLE / 2, bottom: -HANDLE / 2 }, cursor: "nesw-resize" },
    { key: "se", style: { right: -HANDLE / 2, bottom: -HANDLE / 2 }, cursor: "nwse-resize" },
    { key: "n", style: { left: "50%", marginLeft: -HANDLE / 2, top: -HANDLE / 2 }, cursor: "ns-resize" },
    { key: "s", style: { left: "50%", marginLeft: -HANDLE / 2, bottom: -HANDLE / 2 }, cursor: "ns-resize" },
    { key: "w", style: { left: -HANDLE / 2, top: "50%", marginTop: -HANDLE / 2 }, cursor: "ew-resize" },
    { key: "e", style: { right: -HANDLE / 2, top: "50%", marginTop: -HANDLE / 2 }, cursor: "ew-resize" },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center"
      onMouseDown={onClose}
    >
      <div onMouseDown={(e) => e.stopPropagation()} className="relative">
        {/* Top bar */}
        <div className="absolute -top-12 left-0 right-0 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-zinc-800/80 hover:bg-zinc-700 flex items-center justify-center text-zinc-300">
              <X size={16} />
            </button>
            <span className="text-sm text-zinc-400">{t("title")}</span>
          </div>
          <div className="flex items-center gap-1">
            {imgLoaded && (
              <span className="text-xs text-zinc-500 mr-2">
                {Math.round(crop.w / displayScale)} × {Math.round(crop.h / displayScale)} px
              </span>
            )}
            <button
              onClick={handleConfirm}
              className="h-8 px-4 rounded-full bg-white text-black text-sm font-medium hover:bg-white/90 flex items-center gap-1.5"
            >
              <Check size={14} />
              {t("confirm")}
            </button>
          </div>
        </div>

        {/* Aspect ratio bar */}
        <div className="absolute -bottom-11 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-zinc-900/90 rounded-full px-2 py-1 border border-zinc-700/60">
          {ASPECT_RATIOS.map((ar, i) => (
            <button
              key={ar.label}
              onClick={() => handleAspectChange(i)}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                aspectIdx === i ? "bg-white text-black font-medium" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {ar.label}
            </button>
          ))}
        </div>

        {/* Image + crop overlay */}
        <div
          ref={containerRef}
          className="relative select-none"
          style={{ width: dw, height: dh }}
        >
          {!imgLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <RectangleHorizontal size={32} className="text-zinc-600 animate-pulse" />
            </div>
          )}

          <img
            ref={imgRef}
            src={imageUrl}
            alt=""
            className="block w-full h-full object-contain"
            crossOrigin="anonymous"
            onLoad={(e) => {
              const el = e.currentTarget;
              setImgNatural({ w: el.naturalWidth, h: el.naturalHeight });
              setImgLoaded(true);
            }}
            draggable={false}
          />

          {imgLoaded && (
            <>
              {/* Light dim outside crop area — 4 rects around the selection */}
              <div className="absolute pointer-events-none" style={{ left: 0, top: 0, width: dw, height: crop.y, background: "rgba(0,0,0,0.35)" }} />
              <div className="absolute pointer-events-none" style={{ left: 0, top: crop.y + crop.h, width: dw, height: dh - crop.y - crop.h, background: "rgba(0,0,0,0.35)" }} />
              <div className="absolute pointer-events-none" style={{ left: 0, top: crop.y, width: crop.x, height: crop.h, background: "rgba(0,0,0,0.35)" }} />
              <div className="absolute pointer-events-none" style={{ left: crop.x + crop.w, top: crop.y, width: dw - crop.x - crop.w, height: crop.h, background: "rgba(0,0,0,0.35)" }} />

              {/* Crop selection — border + handles only */}
              <div
                className="absolute border border-white/80"
                style={{
                  left: crop.x,
                  top: crop.y,
                  width: crop.w,
                  height: crop.h,
                  cursor: dragging === "move" ? "grabbing" : "grab",
                }}
                onMouseDown={(e) => handleMouseDown(e, "move")}
              >
                {/* Rule of thirds grid */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/15" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/15" />
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-white/15" />
                  <div className="absolute top-2/3 left-0 right-0 h-px bg-white/15" />
                </div>

                {/* Corner & edge handles */}
                {handles.map((h) => (
                  <div
                    key={h.key}
                    className="absolute bg-white rounded-sm shadow-md"
                    style={{ ...h.style, cursor: h.cursor, width: HANDLE, height: HANDLE }}
                    onMouseDown={(e) => handleMouseDown(e, h.key)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
