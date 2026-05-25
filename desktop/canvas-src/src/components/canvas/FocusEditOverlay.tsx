"use client";

import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X, Loader2, Check, RotateCcw } from "lucide-react";

interface ExtractedElement {
  imageUrl: string;
  thumbnailUrl: string;
  name: string;
}

interface FocusEditOverlayProps {
  imageUrl: string;
  thumbnailUrl?: string;
  locale?: string;
  onClose: () => void;
  onConfirm: (element: ExtractedElement) => void;
}

export function FocusEditOverlay({
  imageUrl,
  thumbnailUrl,
  locale,
  onClose,
  onConfirm,
}: FocusEditOverlayProps) {
  const t = useTranslations("focusEdit");
  const imgRef = useRef<HTMLImageElement>(null);
  const [clickPos, setClickPos] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractedElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImageClick = useCallback(
    async (e: React.MouseEvent<HTMLImageElement>) => {
      if (loading) return;
      const img = imgRef.current;
      if (!img) return;

      const rect = img.getBoundingClientRect();
      const scaleX = img.naturalWidth / rect.width;
      const scaleY = img.naturalHeight / rect.height;
      const pixelX = (e.clientX - rect.left) * scaleX;
      const pixelY = (e.clientY - rect.top) * scaleY;

      setClickPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const res = await fetch("/api/focus-extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl,
            thumbnailUrl: thumbnailUrl || undefined,
            x: Math.round(pixelX),
            y: Math.round(pixelY),
            locale: locale || "en",
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Error ${res.status}`);
        }

        const data = await res.json();
        setResult({
          imageUrl: data.imageUrl,
          thumbnailUrl: data.thumbnailUrl,
          name: data.name,
        });
      } catch (err: any) {
        setError(err.message ?? "Extraction failed");
      } finally {
        setLoading(false);
      }
    },
    [imageUrl, loading],
  );

  const handleConfirm = useCallback(() => {
    if (result) onConfirm(result);
  }, [result, onConfirm]);

  const handleRetry = useCallback(() => {
    setResult(null);
    setClickPos(null);
    setError(null);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)" }}>
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
      >
        <X size={20} className="text-white" />
      </button>

      <div className="flex flex-col items-center gap-4 max-w-[90vw] max-h-[90vh]">
        {/* Hint text */}
        {!result && !loading && (
          <div className="text-white/60 text-sm">{t("clickToExtract")}</div>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-white/80 text-sm">
            <Loader2 size={16} className="animate-spin" />
            {t("extracting")}
          </div>
        )}

        {/* Main image with click target */}
        <div className="relative">
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Source"
            className="max-w-[80vw] max-h-[70vh] object-contain rounded-lg"
            style={{ cursor: loading ? "wait" : "crosshair" }}
            onClick={handleImageClick}
            draggable={false}
          />
          {/* Click indicator */}
          {clickPos && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: clickPos.x - 12,
                top: clickPos.y - 12,
                width: 24,
                height: 24,
              }}
            >
              <div className="w-full h-full rounded-full border-2 border-purple-400 bg-purple-400/20 animate-ping" />
              <div className="absolute inset-0 w-full h-full rounded-full border-2 border-purple-400 bg-purple-400/30" />
            </div>
          )}
        </div>

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2">
            <span className="text-red-400 text-sm">{error}</span>
            <button
              type="button"
              onClick={handleRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors cursor-pointer"
            >
              <RotateCcw size={14} />
              {t("retry")}
            </button>
          </div>
        )}

        {/* Result preview + confirm */}
        {result && (
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "rgb(31,31,31)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <img
              src={result.thumbnailUrl}
              alt={result.name}
              className="w-12 h-12 rounded-lg object-cover border border-white/10"
            />
            <div className="flex flex-col">
              <span className="text-white font-medium text-sm">{result.name}</span>
              <span className="text-white/40 text-xs">{t("extracted")}</span>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button
                type="button"
                onClick={handleRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors cursor-pointer"
              >
                <RotateCcw size={14} />
                {t("retry")}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm transition-colors cursor-pointer"
              >
                <Check size={14} />
                {t("confirm")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
