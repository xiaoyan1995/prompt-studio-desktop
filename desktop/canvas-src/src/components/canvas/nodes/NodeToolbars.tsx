"use client";

import { useState, useRef, useCallback, useEffect, useMemo, forwardRef } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import type { Editor } from "@tiptap/react";
import {
  Bold, Italic, List, ListOrdered, Minus,
  Heading1, Heading2, Heading3, Pilcrow,
  X, Check, Copy, CopyPlus, Trash2, Maximize2, Download, Info,
  PencilRuler, Eraser, Expand, ZoomIn, ZoomOut, RotateCcw,
  Scissors, Orbit, Sun, Highlighter, Crop, MoreHorizontal,
  ShieldCheck, Loader2, Camera, Grid2X2, ImageUp,
} from "lucide-react";
import { useClickOutside, IMAGE_MODEL_MAP } from "./panel-shared";
import { useIsTouchDevice } from "@/hooks/use-touch-device";
import { useCanvasStore } from "@/stores/canvas-store";
import {
  getImageOriginalUrl,
  getVideoOriginalUrl,
  resolveDownloadSource,
  downloadFile,
  type DownloadSourceKind,
} from "@/lib/media-url";
import { trackEvent } from "@/lib/analytics";
import { showToast } from "@/components/ui/GlobalToast";
import { cameraDisplayLabel, cameraSettingsToPrompt, type CameraSettings } from "./CameraControl";
import { lightingDisplayLabel, lightingSettingsToPrompt, type LightingSettings } from "./LightingControl";
import { VideoPlayer } from "@/components/ui/VideoPlayer";

export function TbBtn({
  icon: Icon,
  active,
  onClick,
  title,
  loading,
}: {
  icon: React.ComponentType<{ size?: number | string }>;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  loading?: boolean;
}) {
  return (
    <div className="relative group/tb">
      <button
        onPointerDownCapture={(e) => e.stopPropagation()}
        onMouseDown={(e) => { e.preventDefault(); if (!loading) onClick?.(); }}
        className={`nodrag w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
          loading ? "text-zinc-400 cursor-wait"
          : active ? "text-zinc-900 bg-zinc-100 dark:text-white dark:bg-zinc-800" : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
        }`}
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
      </button>
      {title && (
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 text-[11px] text-zinc-700 dark:text-zinc-300 whitespace-nowrap opacity-0 scale-95 group-hover/tb:opacity-100 group-hover/tb:scale-100 transition-all duration-150 z-50 shadow-md">
          {title}
        </span>
      )}
    </div>
  );
}

function isOriginalSource(source: DownloadSourceKind): boolean {
  return source === "original" || source === "derived-original";
}

function trackDownloadResult(args: {
  entrypoint: string;
  mediaType: "image" | "video";
  source: DownloadSourceKind;
  success: boolean;
}) {
  trackEvent("canvas_original_download", {
    entrypoint: args.entrypoint,
    mediaType: args.mediaType,
    source: args.source,
    success: args.success,
    originalHit: isOriginalSource(args.source),
  });
}

function TouchNodeActions() {
  const isTouch = useIsTouchDevice();
  const t = useTranslations("nodeActions");
  const copySelected = useCanvasStore((s) => s.copySelected);
  const duplicateSelected = useCanvasStore((s) => s.duplicateSelected);
  const deleteSelected = useCanvasStore((s) => s.deleteSelected);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  if (!isTouch) return null;

  const items: { icon: typeof Copy; label: string; onClick: () => void; danger?: boolean }[] = [
    { icon: Copy, label: t("copy"), onClick: copySelected },
    { icon: CopyPlus, label: t("duplicate"), onClick: duplicateSelected },
    { icon: Trash2, label: t("delete"), onClick: deleteSelected, danger: true },
  ];

  return (
    <>
      <div className="w-px h-5 bg-zinc-700 mx-0.5" />
      <div className="relative" ref={ref}>
        <TbBtn icon={MoreHorizontal} onClick={() => setOpen((v) => !v)} />
        {open && (
          <div
            className="absolute bottom-full right-0 mb-2 py-1 min-w-[120px] rounded-xl bg-[#1a1a1a]/95 backdrop-blur-xl border border-zinc-700/60 shadow-2xl z-50"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {items.map((item) => (
              <button
                key={item.label}
                className={`nodrag w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors ${
                  item.danger
                    ? "text-red-400 hover:text-red-300 hover:bg-zinc-800"
                    : "text-zinc-300 hover:text-white hover:bg-zinc-800"
                }`}
                onMouseDown={(e) => { e.preventDefault(); item.onClick(); setOpen(false); }}
              >
                <item.icon size={15} />
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

const HdIcon = forwardRef<SVGSVGElement, { size?: number | string }>(
  ({ size = 24, ...props }, ref) => (
    <svg ref={ref} width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path fillRule="evenodd" clipRule="evenodd" d="M16.1113 4.02734C17.3002 4.02747 18.2637 4.99181 18.2637 6.18066V13.8193C18.2637 15.0082 17.3002 15.9725 16.1113 15.9727H3.88867C2.69988 15.9725 1.73633 15.0082 1.73633 13.8193V6.18066C1.73634 4.99184 2.69989 4.02753 3.88867 4.02734H16.1113ZM3.88867 5.27734C3.39024 5.27753 2.98634 5.6822 2.98633 6.18066V13.8193C2.98633 14.3178 3.39024 14.7225 3.88867 14.7227H16.1113C16.6098 14.7225 17.0137 14.3178 17.0137 13.8193V6.18066C17.0137 5.68216 16.6098 5.27747 16.1113 5.27734H3.88867ZM8.47266 7.08301C8.81752 7.08325 9.09748 7.36313 9.09766 7.70801V12.292C9.0974 12.6368 8.81747 12.9167 8.47266 12.917C8.12763 12.917 7.84791 12.637 7.84766 12.292V10.625H6.04199V12.292C6.04174 12.6368 5.7618 12.9167 5.41699 12.917C5.07203 12.9169 4.79224 12.6369 4.79199 12.292V7.70801C4.79217 7.36302 5.07198 7.08308 5.41699 7.08301C5.76184 7.08327 6.04182 7.36314 6.04199 7.70801V9.375H7.84766V7.70801C7.84783 7.36298 8.12759 7.08301 8.47266 7.08301ZM12.6738 7.08301C13.346 7.08307 13.9905 7.35087 14.4658 7.82617C14.9411 8.3015 15.208 8.946 15.208 9.61816V10.3818C15.208 11.0541 14.9412 11.6995 14.4658 12.1748C13.9906 12.6499 13.3458 12.9169 12.6738 12.917H11.9102C11.6433 12.917 11.387 12.8106 11.1982 12.6221C11.0095 12.4333 10.9025 12.1771 10.9023 11.9102V8.08984C10.9025 7.82294 11.0095 7.56667 11.1982 7.37793L11.2715 7.31152C11.4507 7.16465 11.6764 7.08301 11.9102 7.08301H12.6738ZM12.1523 11.667H12.6738C13.0143 11.6669 13.3412 11.5317 13.582 11.291C13.823 11.0501 13.958 10.7226 13.958 10.3818V9.61816C13.958 9.27752 13.8229 8.95087 13.582 8.70996C13.3412 8.46908 13.0145 8.33307 12.6738 8.33301H12.1523V11.667Z" fill="currentColor" />
    </svg>
  ),
);
HdIcon.displayName = "HdIcon";

export function ImageInfoModal({
  data,
  nodeId,
  onClose,
}: {
  data: Record<string, unknown>;
  nodeId?: string;
  onClose: () => void;
}) {
  const t = useTranslations("imageInfo");
  const locale = useLocale();
  const prompt = String(data.prompt ?? "");
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const [copyIdState, setCopyIdState] = useState<"idle" | "ok">("idle");
  const hasGenerated = !!data.imageUrl || !!data.videoUrl;
  const modelKey = String((hasGenerated ? data.generated_model_id : undefined) ?? data.model_id ?? "");
  const modelLabel = IMAGE_MODEL_MAP[modelKey] || modelKey;
  const aspectRatio = String((hasGenerated ? data.generated_aspect_ratio : undefined) ?? data.aspect_ratio ?? "");
  const imageSize = String((hasGenerated ? data.generated_image_size : undefined) ?? data.image_size ?? "");
  const cam = data.cameraSettings as CameraSettings | null;
  const lit = data.lightingSettings as LightingSettings | null;
  const generatedAt = data.generatedAt as string | undefined;
  const dateStr = generatedAt
    ? new Date(generatedAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" })
    : "";

  const [dimensions, setDimensions] = useState<string>("");
  const [fileSize, setFileSize] = useState<string>("");

  useEffect(() => {
    const imgSrc = String(data.originalUrl ?? data.imageUrl ?? "");
    if (!imgSrc) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) setDimensions(`${img.naturalWidth} × ${img.naturalHeight}`);
    };
    img.src = imgSrc;
  }, [data.originalUrl, data.imageUrl]);

  useEffect(() => {
    const src = String(data.originalUrl ?? data.imageUrl ?? "");
    if (!src) return;
    let cancelled = false;
    fetch(src, { method: "HEAD" })
      .then((res) => {
        if (cancelled) return;
        const len = Number(res.headers.get("content-length") || 0);
        if (len > 0) {
          if (len >= 1024 * 1024) setFileSize(`${(len / (1024 * 1024)).toFixed(1)} MB`);
          else setFileSize(`${Math.round(len / 1024)} KB`);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [data.originalUrl, data.imageUrl]);

  const [promptExpanded, setPromptExpanded] = useState(false);
  const promptIsLong = prompt.length > 120;

  const infoRows: Array<{ label: string; value: string }> = [];
  if (modelLabel) infoRows.push({ label: t("model"), value: modelLabel });
  if (imageSize) infoRows.push({ label: t("quality"), value: imageSize });
  if (aspectRatio) infoRows.push({ label: t("aspectRatio"), value: aspectRatio.replace(":", " : ") });
  if (dimensions) infoRows.push({ label: t("resolution"), value: dimensions });
  if (fileSize) infoRows.push({ label: t("fileSize"), value: fileSize });
  if (dateStr) infoRows.push({ label: t("date"), value: dateStr });

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4"
      onPointerDown={onClose}
    >
      <div
        className="relative w-full max-w-[380px] rounded-2xl border border-zinc-700/50 bg-[#161616] shadow-2xl overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <span className="text-[13px] font-semibold text-white tracking-wide">{t("title")}</span>
          <button
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-zinc-500 hover:text-white transition-colors"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>

        {/* Prompt section */}
        {prompt && (
          <div className="mx-5 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{t("prompt")}</span>
              <button
                className={`flex items-center justify-center w-6 h-6 rounded-md transition-colors ${
                  copyState === "ok" ? "text-green-400" : copyState === "fail" ? "text-red-400" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/10"
                }`}
                onClick={() => {
                  navigator.clipboard.writeText(prompt).then(
                    () => { setCopyState("ok"); setTimeout(() => setCopyState("idle"), 1000); },
                    () => { setCopyState("fail"); setTimeout(() => setCopyState("idle"), 1000); },
                  );
                }}
                title={t("copyPrompt")}
              >
                {copyState === "ok" ? <Check size={13} /> : copyState === "fail" ? <X size={13} /> : <Copy size={13} />}
              </button>
            </div>
            <div
              className={`text-[13px] text-zinc-300 leading-[1.6] whitespace-pre-wrap break-words ${!promptExpanded && promptIsLong ? "line-clamp-3" : ""}`}
            >
              {prompt}
            </div>
            {promptIsLong && (
              <button
                className="mt-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                onClick={() => setPromptExpanded(!promptExpanded)}
              >
                {promptExpanded ? t("showLess") : t("showAll")}
              </button>
            )}
          </div>
        )}

        {/* Divider */}
        <div className="mx-5 h-px bg-zinc-800" />

        {/* INFORMATION section */}
        <div className="px-5 pt-3 pb-1">
          <div className="flex items-center gap-2 mb-2">
            <Info size={13} className="text-zinc-500" />
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">INFORMATION</span>
          </div>

          <div className="divide-y divide-zinc-800/80">
            {infoRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2.5">
                <span className="text-[13px] text-zinc-500">{row.label}</span>
                <span className="text-[13px] font-medium text-white">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Camera & Lighting */}
        {(cam || lit) && (
          <>
            <div className="mx-5 h-px bg-zinc-800" />
            <div className="px-5 pt-3 pb-1">
              {cam && (
                <div className="py-2">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{t("camera")}</span>
                  <div className="text-[13px] text-white mt-1">{cameraDisplayLabel(cam)}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{cameraSettingsToPrompt(cam)}</div>
                </div>
              )}
              {lit && (
                <div className="py-2">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{t("lighting")}</span>
                  <div className="text-[13px] text-white mt-1">{lightingDisplayLabel(lit, locale)}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{lightingSettingsToPrompt(lit)}</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Node ID footer */}
        {nodeId && (
          <>
            <div className="mx-5 h-px bg-zinc-800" />
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-zinc-600 shrink-0">ID</span>
                <span className="text-[11px] font-mono text-zinc-500 truncate min-w-0 select-all">{nodeId}</span>
              </div>
              <button
                className={`flex items-center gap-1 shrink-0 px-2 py-1 rounded-md text-[11px] transition-colors ${
                  copyIdState === "ok"
                    ? "text-green-400 bg-green-400/10"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/10"
                }`}
                onClick={() => {
                  navigator.clipboard.writeText(nodeId).then(() => {
                    setCopyIdState("ok");
                    setTimeout(() => setCopyIdState("idle"), 1500);
                  });
                }}
                title={t("copyNodeId")}
              >
                {copyIdState === "ok" ? <><Check size={10} /> {t("copied")}</> : <><Copy size={10} /> {t("copyNodeId")}</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ImageDetailModal({
  data,
  imageUrl,
  originalUrl,
  videoUrl,
  isVideo,
  nodeId,
  onClose,
}: {
  data: Record<string, unknown>;
  imageUrl?: string;
  originalUrl?: string;
  videoUrl?: string;
  isVideo?: boolean;
  nodeId?: string;
  onClose: () => void;
}) {
  const t = useTranslations("imageInfo");
  const locale = useLocale();
  const prompt = String(data.prompt ?? "");
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const [copyIdState, setCopyIdState] = useState<"idle" | "ok">("idle");
  const hasGenerated = !!data.imageUrl || !!data.videoUrl;
  const modelKey = String((hasGenerated ? data.generated_model_id : undefined) ?? data.model_id ?? "");
  const modelLabel = IMAGE_MODEL_MAP[modelKey] || modelKey;
  const aspectRatio = String((hasGenerated ? data.generated_aspect_ratio : undefined) ?? data.aspect_ratio ?? "");
  const imageSize = String((hasGenerated ? data.generated_image_size : undefined) ?? data.image_size ?? "");
  const cam = data.cameraSettings as CameraSettings | null;
  const lit = data.lightingSettings as LightingSettings | null;
  const generatedAt = data.generatedAt as string | undefined;
  const videoDisplayUrl = isVideo ? String(data.videoUrl ?? "") : "";
  const fallbackDisplaySrc = isVideo
    ? String(videoUrl ?? data.videoUrl ?? "")
    : String(imageUrl ?? data.imageUrl ?? "");
  const resolvedData = useMemo(
    () => (isVideo ? data : { ...data, ...(originalUrl ? { originalUrl } : {}) }),
    [data, isVideo, originalUrl],
  );
  const mediaType: "image" | "video" = isVideo ? "video" : "image";
  const [mediaSrc, setMediaSrc] = useState(() =>
    isVideo
      ? (getVideoOriginalUrl(data) ?? fallbackDisplaySrc)
      : (originalUrl ?? getImageOriginalUrl(data) ?? fallbackDisplaySrc),
  );
  const [mediaSourceKind, setMediaSourceKind] = useState<DownloadSourceKind>(() => {
    if (isVideo) return data.originalVideoUrl ? "original" : (fallbackDisplaySrc ? "display" : "missing");
    if (originalUrl || data.originalUrl) return "original";
    return fallbackDisplaySrc ? "display" : "missing";
  });
  const [downloading, setDownloading] = useState(false);
  const modalOpenAtRef = useRef<number>(0);
  const loadTrackedRef = useRef(false);

  useEffect(() => {
    modalOpenAtRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const resolved = await resolveDownloadSource({
        kind: mediaType,
        data: resolvedData,
        displayUrl: fallbackDisplaySrc,
      });
      if (cancelled) return;
      const finalUrl = resolved.url || fallbackDisplaySrc;
      const finalSource: DownloadSourceKind = resolved.url
        ? resolved.source
        : (fallbackDisplaySrc ? "display" : "missing");
      setMediaSrc(finalUrl);
      setMediaSourceKind(finalSource);
    })();
    return () => { cancelled = true; };
  }, [fallbackDisplaySrc, mediaType, resolvedData]);

  const [dimensions, setDimensions] = useState<string>("");
  const [fileSize, setFileSize] = useState<string>("");

  const ZOOM_MIN = 1;
  const ZOOM_MAX = 5;
  const ZOOM_STEP = 0.1;
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const mediaContainerRef = useRef<HTMLDivElement>(null);

  const clampZoom = useCallback((z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100)), []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (isVideo) return;
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((prev) => {
      const next = clampZoom(prev + delta);
      if (next <= 1) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  }, [isVideo, clampZoom]);

  const handlePanPointerDown = useCallback((e: React.PointerEvent) => {
    if (isVideo || zoom <= 1) return;
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [isVideo, zoom, panOffset]);

  const handlePanPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanOffset({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy });
  }, []);

  const handlePanPointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);
  useEffect(() => {
    if (!mediaSrc) return;
    let cancelled = false;
    fetch(mediaSrc, { method: "HEAD" })
      .then((res) => {
        if (cancelled) return;
        const len = Number(res.headers.get("content-length") || 0);
        if (len > 0) {
          if (len >= 1024 * 1024) setFileSize(`${(len / (1024 * 1024)).toFixed(1)} MB`);
          else setFileSize(`${Math.round(len / 1024)} KB`);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mediaSrc]);

  const trackMaximizeLoad = useCallback(() => {
    if (loadTrackedRef.current) return;
    loadTrackedRef.current = true;
    const elapsedMs = Math.max(0, Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - modalOpenAtRef.current));
    trackEvent("canvas_maximize_media_load", {
      mediaType,
      source: mediaSourceKind,
      elapsedMs,
    });
  }, [mediaSourceKind, mediaType]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const resolved = await resolveDownloadSource({
        kind: mediaType,
        data: resolvedData,
        displayUrl: fallbackDisplaySrc,
      });
      const dlUrl = resolved.url || mediaSrc;
      const source: DownloadSourceKind = resolved.url ? resolved.source : (dlUrl ? "display" : "missing");
      if (!dlUrl) {
        trackDownloadResult({
          entrypoint: "maximize_modal",
          mediaType,
          source,
          success: false,
        });
        return;
      }
      const ext = isVideo ? "mp4" : (dlUrl.split(".").pop()?.split("?")[0] || "png");
      const fileName = `xinyu-${Date.now()}.${ext}`;
      const ok = await downloadFile(dlUrl, fileName);
      trackDownloadResult({ entrypoint: "maximize_modal", mediaType, source, success: ok });
    } finally {
      setDownloading(false);
    }
  }, [fallbackDisplaySrc, isVideo, mediaSrc, mediaType, resolvedData]);

  const dateStr = generatedAt
    ? new Date(generatedAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit" })
    : "";

  return (
    <div
      className="absolute inset-0 z-[100] flex items-start gap-4 px-6 py-5"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onPointerDown={onClose}
    >
      <div
        className="relative flex min-h-0 flex-1 min-w-0 overflow-hidden h-[calc(100vh-40px)] rounded-2xl bg-[#1c1c1c]/80 border border-white/10"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Left: media */}
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden flex flex-col">
          <div
            ref={mediaContainerRef}
            className="absolute inset-0 flex items-center justify-center overflow-hidden"
            style={{ cursor: !isVideo && zoom > 1 ? "grab" : undefined }}
            onWheel={handleWheel}
            onPointerDown={handlePanPointerDown}
            onPointerMove={handlePanPointerMove}
            onPointerUp={handlePanPointerUp}
          >
            {isVideo && mediaSrc ? (
              <VideoPlayer
                src={mediaSrc}
                autoPlay
                loop
                className="w-full h-full"
                onError={() => {
                  if (videoDisplayUrl && mediaSrc !== videoDisplayUrl) {
                    setMediaSrc(videoDisplayUrl);
                  } else if (mediaSrc !== fallbackDisplaySrc) {
                    setMediaSrc(fallbackDisplaySrc);
                  }
                }}
                onLoadedData={(e) => {
                  const v = e.currentTarget as HTMLVideoElement;
                  if (v.videoWidth && v.videoHeight) setDimensions(`${v.videoWidth} × ${v.videoHeight}`);
                  trackMaximizeLoad();
                }}
              />
            ) : mediaSrc ? (
              <img
                src={mediaSrc}
                alt=""
                className="w-full h-full object-contain select-none"
                draggable={false}
                decoding="async"
                style={{
                  transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
                  transformOrigin: "center center",
                  transition: isDraggingRef.current ? "none" : "transform 0.15s ease-out",
                  willChange: "transform",
                }}
                onError={() => {
                  if (mediaSrc !== fallbackDisplaySrc) {
                    setMediaSrc(fallbackDisplaySrc);
                  } else {
                    // fallbackDisplaySrc is same as mediaSrc (e.g. frame captures where imageUrl === originalUrl)
                    // Try thumbnails as last resort: lg → md → sm
                    const levels = (data.thumbnailLevels ?? {}) as Record<string, unknown>;
                    const lg = typeof levels.lg === "string" ? levels.lg : "";
                    const md = typeof levels.md === "string" ? levels.md : "";
                    const sm = typeof levels.sm === "string" ? levels.sm : "";
                    const thumb = typeof data.thumbnailUrl === "string" ? (data.thumbnailUrl as string) : "";
                    const fallback = lg || md || sm || thumb;
                    if (fallback && fallback !== mediaSrc) {
                      setMediaSrc(fallback);
                    }
                  }
                }}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth && img.naturalHeight) setDimensions(`${img.naturalWidth} × ${img.naturalHeight}`);
                  trackMaximizeLoad();
                }}
              />
            ) : null}
          </div>

          {/* Zoom slider bar — images only */}
          {!isVideo && (
            <div
              className="absolute bottom-0 inset-x-0 flex items-center justify-center gap-2.5 py-2.5 px-4 z-10"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)" }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                className="p-1 rounded text-zinc-400 hover:text-white transition-colors disabled:opacity-30"
                onClick={() => setZoom((z) => { const n = clampZoom(z - ZOOM_STEP); if (n <= 1) setPanOffset({ x: 0, y: 0 }); return n; })}
                disabled={zoom <= ZOOM_MIN}
                title={t("zoomOut")}
              >
                <ZoomOut size={16} />
              </button>
              <input
                type="range"
                min={ZOOM_MIN * 100}
                max={ZOOM_MAX * 100}
                step={ZOOM_STEP * 100}
                value={zoom * 100}
                onChange={(e) => {
                  const next = clampZoom(Number(e.target.value) / 100);
                  setZoom(next);
                  if (next <= 1) setPanOffset({ x: 0, y: 0 });
                }}
                className="w-28 h-1 appearance-none rounded-full bg-white/20 cursor-pointer accent-white
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md
                  [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
              />
              <button
                className="p-1 rounded text-zinc-400 hover:text-white transition-colors disabled:opacity-30"
                onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
                disabled={zoom >= ZOOM_MAX}
                title={t("zoomIn")}
              >
                <ZoomIn size={16} />
              </button>
              <button
                className={`ml-1 px-1.5 py-0.5 rounded text-[11px] tabular-nums font-medium transition-colors ${
                  zoom > 1 ? "text-white bg-white/10 hover:bg-white/20 cursor-pointer" : "text-zinc-500"
                }`}
                onClick={resetZoom}
                disabled={zoom <= 1}
                title={t("zoomReset")}
              >
                {Math.round(zoom * 100)}%
              </button>
            </div>
          )}
        </div>

        {/* Right: info sidebar */}
        <div className="shrink-0">
          <div className="relative w-[284px] h-full shrink-0 flex flex-col items-start px-4 pb-4 gap-5 z-20 bg-[#1c1c1c]">
            {/* Close button row */}
            <div className="flex w-full justify-end pt-3 pb-0 shrink-0">
              <button
                className="flex w-8 h-8 justify-center items-center rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                onClick={onClose}
              >
                <X size={18} className="text-zinc-400" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 min-h-0 overflow-y-auto w-full space-y-5">
              {/* Prompt */}
              <section className="space-y-2">
                <div className="flex items-center justify-between w-full">
                  <span className="text-sm font-semibold leading-5 text-zinc-400">{t("prompt")}</span>
                  {prompt && (
                    <button
                      className={`flex items-center justify-center w-6 h-6 rounded transition-colors ${
                        copyState === "ok" ? "text-green-400" : copyState === "fail" ? "text-red-400" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/60"
                      }`}
                      onClick={() => {
                        navigator.clipboard.writeText(prompt).then(
                          () => { setCopyState("ok"); setTimeout(() => setCopyState("idle"), 1000); },
                          () => { setCopyState("fail"); setTimeout(() => setCopyState("idle"), 1000); },
                        );
                      }}
                      title={t("copyPrompt")}
                    >
                      {copyState === "ok" ? <Check size={13} /> : copyState === "fail" ? <X size={13} /> : <Copy size={13} />}
                    </button>
                  )}
                </div>
                <div className="relative h-[180px] rounded-xl bg-white/5 text-sm leading-5 text-zinc-200 overflow-hidden hover:bg-black/20 transition-colors select-none cursor-pointer">
                  <div
                    className="h-full pt-2 pl-3 pb-3 pr-1.5 overflow-y-auto whitespace-pre-wrap break-words"
                  >
                    {prompt || t("noPrompt")}
                  </div>
                </div>
              </section>

              {/* Info card */}
              <section className="flex flex-col gap-2.5">
                <span className="text-sm font-semibold leading-5 text-zinc-400">{t("title")}</span>
                <div className="flex flex-col gap-2 py-2 px-2.5 rounded-xl bg-white/5">
                  {modelLabel && (
                    <div className="flex items-start text-sm gap-3">
                      <span className="text-zinc-500 shrink-0">{t("model")}:</span>
                      <span className="text-zinc-200 truncate min-w-0">{modelLabel}</span>
                    </div>
                  )}
                  {imageSize && (
                    <div className="flex items-start text-sm gap-3">
                      <span className="text-zinc-500 shrink-0">{t("quality")}:</span>
                      <span className="text-zinc-200 truncate min-w-0">{imageSize}</span>
                    </div>
                  )}
                  {aspectRatio && (
                    <div className="flex items-start text-sm gap-3">
                      <span className="text-zinc-500 shrink-0">{t("aspectRatio")}:</span>
                      <span className="text-zinc-200 truncate min-w-0">{aspectRatio.replace(":", " : ")}</span>
                    </div>
                  )}
                  {dimensions && (
                    <div className="flex items-start text-sm gap-3">
                      <span className="text-zinc-500 shrink-0">{t("resolution")}:</span>
                      <span className="text-zinc-200 truncate min-w-0">{dimensions}</span>
                    </div>
                  )}
                  {fileSize && (
                    <div className="flex items-start text-sm gap-3">
                      <span className="text-zinc-500 shrink-0">{t("fileSize")}:</span>
                      <span className="text-zinc-200 truncate min-w-0">{fileSize}</span>
                    </div>
                  )}
                  {dateStr && (
                    <div className="flex items-start text-sm gap-3">
                      <span className="text-zinc-500 shrink-0">{t("date")}:</span>
                      <span className="text-zinc-200 truncate min-w-0">{dateStr}</span>
                    </div>
                  )}
                </div>
              </section>

              {/* Node ID */}
              {nodeId && (
                <section className="flex items-center gap-2 py-2 px-2.5 rounded-xl bg-white/5">
                  <span className="text-zinc-500 text-sm shrink-0">{t("nodeId")}:</span>
                  <span className="text-zinc-400 text-xs font-mono truncate min-w-0 select-all">{nodeId}</span>
                  <button
                    className={`flex items-center justify-center w-5 h-5 rounded shrink-0 transition-colors ${
                      copyIdState === "ok" ? "text-green-400" : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/60"
                    }`}
                    onClick={() => {
                      navigator.clipboard.writeText(nodeId).then(() => {
                        setCopyIdState("ok");
                        setTimeout(() => setCopyIdState("idle"), 1500);
                      });
                    }}
                    title={t("copyNodeId")}
                  >
                    {copyIdState === "ok" ? <Check size={11} /> : <Copy size={11} />}
                  </button>
                </section>
              )}

              {/* Camera & Lighting */}
              {cam && (
                <section className="space-y-2.5">
                  <span className="text-sm font-semibold text-zinc-400">{t("camera")}</span>
                  <div className="flex flex-col gap-1 py-2 px-2.5 rounded-xl bg-white/5">
                    <span className="text-sm text-zinc-200">{cameraDisplayLabel(cam)}</span>
                    <span className="text-xs text-zinc-400">{cameraSettingsToPrompt(cam)}</span>
                  </div>
                </section>
              )}
              {lit && (
                <section className="space-y-2.5">
                  <span className="text-sm font-semibold text-zinc-400">{t("lighting")}</span>
                  <div className="flex flex-col gap-1 py-2 px-2.5 rounded-xl bg-white/5">
                    <span className="text-sm text-zinc-200">{lightingDisplayLabel(lit, locale)}</span>
                    <span className="text-xs text-zinc-400">{lightingSettingsToPrompt(lit)}</span>
                  </div>
                </section>
              )}
            </div>

            {/* Download button */}
            <div className="w-full space-y-2">
              <button
                className={`w-full flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-[#646464] text-white text-xs font-semibold hover:bg-[#757575] transition-colors ${downloading ? "cursor-wait opacity-70" : "cursor-pointer"}`}
                onClick={handleDownload}
                disabled={downloading}
              >
                {downloading && <Loader2 size={14} className="animate-spin" />}
                {t("download")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type ComplianceStatus = "idle" | "checking" | "passed" | "failed" | "error";

function MoreDropdown({ items, anchorRef, onClose }: {
  items: { icon: typeof Bold; label: string; onClick?: () => void }[];
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={menuRef}
      className="fixed py-1 min-w-[140px] rounded-xl bg-[#1a1a1a]/95 backdrop-blur-xl border border-zinc-700/60 shadow-2xl z-[9999]"
      style={{ top: pos.top, left: pos.left, transform: "translateX(-50%)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          className="nodrag w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
          onMouseDown={(e) => { e.preventDefault(); item.onClick?.(); onClose(); }}
        >
          <item.icon size={15} />
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function ImageToolbar({
  inverseZoom,
  imageUrl,
  nodeData,
  nodeId,
  onRedraw,
  onErase,
  onEnhance,
  onLighting,
  onMultiAngle,
  onOutpaint,
  onRemoveBg,
  onCrop,
  onAnnotate,
  onMaximize,
  onCompliance,
  onGridSplit,
  complianceStatus = "idle",
}: {
  inverseZoom: number;
  imageUrl?: string;
  nodeData: Record<string, unknown>;
  nodeId?: string;
  onRedraw?: () => void;
  onErase?: () => void;
  onEnhance?: () => void;
  onLighting?: () => void;
  onMultiAngle?: () => void;
  onOutpaint?: () => void;
  onRemoveBg?: () => void;
  onCrop?: () => void;
  onAnnotate?: () => void;
  onMaximize?: () => void;
  onCompliance?: () => void;
  onGridSplit?: () => void;
  complianceStatus?: ComplianceStatus;
}) {
  const t = useTranslations("imageToolbar");
  const { data: _sess } = useSession();
  const _isAdminRole = (_sess?.user as unknown as { role?: string })?.role === "ADMIN" || (_sess?.user as unknown as { role?: string })?.role === "OWNER";
  const _skipCompliance = (_sess?.user as unknown as { skipCompliance?: boolean })?.skipCompliance ?? false;
  const _isAdminUser = _isAdminRole || _skipCompliance;
  const [showInfo, setShowInfo] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useClickOutside(moreRef, showMore, () => setShowMore(false));

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const resolved = await resolveDownloadSource({
        kind: "image",
        data: nodeData,
        displayUrl: String(imageUrl ?? ""),
      });
      const dlUrl = resolved.url;
      if (!dlUrl) {
        trackDownloadResult({
          entrypoint: "image_toolbar",
          mediaType: "image",
          source: resolved.source,
          success: false,
        });
        return;
      }
      const ext = dlUrl.split(".").pop()?.split("?")[0] || "png";
      const fileName = `xinyu-${Date.now()}.${ext}`;
      const ok = await downloadFile(dlUrl, fileName);
      trackDownloadResult({
        entrypoint: "image_toolbar",
        mediaType: "image",
        source: resolved.source,
        success: ok,
      });
    } finally {
      setDownloading(false);
    }
  }, [imageUrl, nodeData]);

  const handleSetCover = useCallback(async () => {
    const projectId = useCanvasStore.getState().projectId;
    const imgUrl = String(nodeData.originalUrl ?? nodeData.imageUrl ?? imageUrl ?? "");
    if (!projectId || !imgUrl) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/cover`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: imgUrl }),
      });
      if (res.ok) {
        showToast(t("setCoverSuccess"));
      } else {
        showToast(t("setCoverFailed"));
      }
    } catch {
      showToast(t("setCoverFailed"));
    }
  }, [nodeData, imageUrl, t]);

  const moreItems: { icon: typeof Bold; label: string; onClick?: () => void }[] = [
    { icon: Expand, label: t("outpaint"), onClick: onOutpaint },
    { icon: Scissors, label: t("removeBg"), onClick: onRemoveBg },
    { icon: Orbit, label: t("multiAngle"), onClick: onMultiAngle },
    { icon: Sun, label: t("lighting"), onClick: onLighting },
    { icon: Highlighter, label: t("annotate"), onClick: onAnnotate },
    { icon: Crop, label: t("crop"), onClick: onCrop },
    { icon: Grid2X2, label: t("gridSplit"), onClick: onGridSplit },
    { icon: Info, label: t("info"), onClick: () => setShowInfo(true) },
  ];

  return (
    <div
      className="absolute left-1/2 z-30 pointer-events-auto nowheel"
      style={{
        top: "-40px",
        transform: `translateX(-50%) translateY(-100%) scale(${inverseZoom})`,
        transformOrigin: "center bottom",
      }}
    >
      <div className="flex items-center h-12 p-1 rounded-full bg-[#1a1a1a]/90 border border-zinc-800 whitespace-nowrap gap-0.5">
        <TbBtn icon={PencilRuler} onClick={onRedraw} title={t("redraw")} />
        <TbBtn icon={Eraser} onClick={onErase} title={t("erase")} />
        <TbBtn icon={HdIcon} onClick={onEnhance} title={t("enhance")} />

        <div className="relative" ref={moreRef}>
          <TbBtn icon={MoreHorizontal} onClick={() => setShowMore((v) => !v)} title={t("more")} />
          {showMore && typeof document !== "undefined" && createPortal(
            <MoreDropdown items={moreItems} anchorRef={moreRef} onClose={() => setShowMore(false)} />,
            document.body,
          )}
        </div>

        {/* Compliance verification (hidden for admins or when NEXT_PUBLIC_SKIP_COMPLIANCE=true) */}
        {!_isAdminUser && process.env.NEXT_PUBLIC_SKIP_COMPLIANCE !== "true" && (
        <div className="relative group/tb">
          <button
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseDown={(e) => { e.preventDefault(); if (complianceStatus !== "checking" && complianceStatus !== "passed" && complianceStatus !== "failed") onCompliance?.(); }}
            disabled={complianceStatus === "checking" || complianceStatus === "passed" || complianceStatus === "failed"}
            className={`nodrag w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
              complianceStatus === "passed"
                ? "text-emerald-400 cursor-default"
                : complianceStatus === "failed"
                ? "text-red-400 cursor-default"
                : complianceStatus === "checking"
                ? "text-amber-400"
                : complianceStatus === "error"
                ? "text-orange-400 hover:text-orange-300 hover:bg-zinc-800"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            {complianceStatus === "checking" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <ShieldCheck size={18} />
            )}
          </button>
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-700/60 text-[11px] text-zinc-300 whitespace-nowrap opacity-0 scale-95 group-hover/tb:opacity-100 group-hover/tb:scale-100 transition-all duration-150 z-50">
            {complianceStatus === "checking" ? t("complianceChecking")
              : complianceStatus === "passed" ? t("compliancePassed")
              : complianceStatus === "failed" ? t("complianceFailed")
              : complianceStatus === "error" ? t("complianceError")
              : t("compliance")}
          </span>
        </div>
        )}

        <div className="w-px h-[18px] bg-zinc-200 dark:bg-zinc-700" />

        <TbBtn icon={Download} onClick={handleDownload} title={t("download")} loading={downloading} />
        <TbBtn icon={ImageUp} onClick={handleSetCover} title={t("setCover")} />
        <TbBtn icon={Maximize2} onClick={onMaximize} />
        <TouchNodeActions />
      </div>

      {showInfo && typeof document !== "undefined" && (
        <ImageInfoModal data={nodeData} nodeId={nodeId} onClose={() => setShowInfo(false)} />
      )}
    </div>
  );
}

export function VideoToolbar({
  inverseZoom,
  videoUrl,
  nodeData,
  nodeId,
  onEnhance,
  onFrameCapture,
  onMaximize,
  onCompliance,
  complianceStatus = "idle",
}: {
  inverseZoom: number;
  videoUrl?: string;
  nodeData: Record<string, unknown>;
  nodeId?: string;
  onEnhance?: () => void;
  onFrameCapture?: () => void;
  onMaximize?: () => void;
  onCompliance?: () => void;
  complianceStatus?: ComplianceStatus;
}) {
  const t = useTranslations("videoToolbar");
  const { data: _vSess } = useSession();
  const _isAdminRole = (_vSess?.user as unknown as { role?: string })?.role === "ADMIN" || (_vSess?.user as unknown as { role?: string })?.role === "OWNER";
  const _skipCompliance = (_vSess?.user as unknown as { skipCompliance?: boolean })?.skipCompliance ?? false;
  const _isAdminUser = _isAdminRole || _skipCompliance;
  const [showInfo, setShowInfo] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const resolved = await resolveDownloadSource({
        kind: "video",
        data: nodeData,
        displayUrl: String(videoUrl ?? ""),
      });
      const dlUrl = resolved.url;
      if (!dlUrl) {
        trackDownloadResult({
          entrypoint: "video_toolbar",
          mediaType: "video",
          source: resolved.source,
          success: false,
        });
        return;
      }
      const fileName = `xinyu-${Date.now()}.mp4`;
      const ok = await downloadFile(dlUrl, fileName);
      trackDownloadResult({
        entrypoint: "video_toolbar",
        mediaType: "video",
        source: resolved.source,
        success: ok,
      });
    } finally {
      setDownloading(false);
    }
  }, [videoUrl, nodeData]);

  return (
    <div
      className="absolute left-1/2 z-30 pointer-events-auto nowheel"
      style={{
        top: "-40px",
        transform: `translateX(-50%) translateY(-100%) scale(${inverseZoom})`,
        transformOrigin: "center bottom",
      }}
    >
      <div className="flex items-center h-12 p-1 rounded-full bg-[#1a1a1a]/90 border border-zinc-800 whitespace-nowrap gap-0.5">
        <TbBtn icon={HdIcon} onClick={onEnhance} title={t("enhance")} />
        <TbBtn icon={Camera} onClick={onFrameCapture} title={t("frameCapture")} />

        {/* Compliance verification (hidden for admins or when NEXT_PUBLIC_SKIP_COMPLIANCE=true) */}
        {!_isAdminUser && process.env.NEXT_PUBLIC_SKIP_COMPLIANCE !== "true" && (
        <div className="relative group/tb">
          <button
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseDown={(e) => { e.preventDefault(); if (complianceStatus !== "checking" && complianceStatus !== "passed" && complianceStatus !== "failed") onCompliance?.(); }}
            disabled={complianceStatus === "checking" || complianceStatus === "passed" || complianceStatus === "failed"}
            className={`nodrag w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
              complianceStatus === "passed"
                ? "text-emerald-400 cursor-default"
                : complianceStatus === "failed"
                ? "text-red-400 cursor-default"
                : complianceStatus === "checking"
                ? "text-amber-400"
                : complianceStatus === "error"
                ? "text-orange-400 hover:text-orange-300 hover:bg-zinc-800"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            {complianceStatus === "checking" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <ShieldCheck size={18} />
            )}
          </button>
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-700/60 text-[11px] text-zinc-300 whitespace-nowrap opacity-0 scale-95 group-hover/tb:opacity-100 group-hover/tb:scale-100 transition-all duration-150 z-50">
            {complianceStatus === "checking" ? t("complianceChecking")
              : complianceStatus === "passed" ? t("compliancePassed")
              : complianceStatus === "failed" ? t("complianceFailed")
              : complianceStatus === "error" ? t("complianceError")
              : t("compliance")}
          </span>
        </div>
        )}

        <div className="w-px h-[18px] bg-zinc-200 dark:bg-zinc-700" />

        <TbBtn icon={Download} onClick={handleDownload} loading={downloading} />
        <TbBtn icon={Info} onClick={() => setShowInfo(true)} />
        <TbBtn icon={Maximize2} onClick={onMaximize} />
        <TouchNodeActions />
      </div>

      {showInfo && typeof document !== "undefined" && (
        <ImageInfoModal data={nodeData} nodeId={nodeId} onClose={() => setShowInfo(false)} />
      )}
    </div>
  );
}

export function AudioToolbar({
  inverseZoom,
  audioUrl,
  onTrim,
  onCompliance,
  complianceStatus = "idle",
}: {
  inverseZoom: number;
  audioUrl?: string;
  onTrim?: () => void;
  onCompliance?: () => void;
  complianceStatus?: ComplianceStatus;
}) {
  const t = useTranslations("audioToolbar");
  const { data: _aSess } = useSession();
  const _isAdminRole = (_aSess?.user as unknown as { role?: string })?.role === "ADMIN" || (_aSess?.user as unknown as { role?: string })?.role === "OWNER";
  const _skipCompliance = (_aSess?.user as unknown as { skipCompliance?: boolean })?.skipCompliance ?? false;
  const _isAdminUser = _isAdminRole || _skipCompliance;

  const handleDownload = useCallback(async () => {
    const dlUrl = audioUrl;
    if (!dlUrl) return;
    const ext = dlUrl.includes(".wav") ? "wav" : "mp3";
    await downloadFile(dlUrl, `xinyu-${Date.now()}.${ext}`);
  }, [audioUrl]);

  return (
    <div
      className="absolute left-1/2 z-30 pointer-events-auto nowheel"
      style={{
        top: "-40px",
        transform: `translateX(-50%) translateY(-100%) scale(${inverseZoom})`,
        transformOrigin: "center bottom",
      }}
    >
      <div className="flex items-center h-12 p-1 rounded-full bg-[#1a1a1a]/90 border border-zinc-800 whitespace-nowrap gap-0.5">
        {/* Compliance verification (hidden for admins or when NEXT_PUBLIC_SKIP_COMPLIANCE=true) */}
        {!_isAdminUser && process.env.NEXT_PUBLIC_SKIP_COMPLIANCE !== "true" && (
        <div className="relative group/tb">
          <button
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseDown={(e) => { e.preventDefault(); if (complianceStatus !== "checking" && complianceStatus !== "passed" && complianceStatus !== "failed") onCompliance?.(); }}
            disabled={complianceStatus === "checking" || complianceStatus === "passed" || complianceStatus === "failed"}
            className={`nodrag w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
              complianceStatus === "passed"
                ? "text-emerald-400 cursor-default"
                : complianceStatus === "failed"
                ? "text-red-400 cursor-default"
                : complianceStatus === "checking"
                ? "text-amber-400"
                : complianceStatus === "error"
                ? "text-orange-400 hover:text-orange-300 hover:bg-zinc-800"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
          >
            {complianceStatus === "checking" ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <ShieldCheck size={18} />
            )}
          </button>
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 px-2 py-1 rounded-md bg-zinc-900 border border-zinc-700/60 text-[11px] text-zinc-300 whitespace-nowrap opacity-0 scale-95 group-hover/tb:opacity-100 group-hover/tb:scale-100 transition-all duration-150 z-50">
            {complianceStatus === "checking" ? t("complianceChecking")
              : complianceStatus === "passed" ? t("compliancePassed")
              : complianceStatus === "failed" ? t("complianceFailed")
              : complianceStatus === "error" ? t("complianceError")
              : t("compliance")}
          </span>
        </div>
        )}

        <TbBtn icon={Scissors} onClick={onTrim} title={t("trim")} />

        <div className="w-px h-[18px] bg-zinc-200 dark:bg-zinc-700" />

        <TbBtn icon={Download} onClick={handleDownload} title={t("download")} />
        <TouchNodeActions />
      </div>
    </div>
  );
}

export const TEXT_COLORS = [
  { color: "rgb(150, 66, 67)", labelKey: "red" },
  { color: "rgb(131, 73, 21)", labelKey: "orange" },
  { color: "rgb(143, 128, 48)", labelKey: "yellow" },
  { color: "rgb(61, 115, 68)", labelKey: "green" },
  { color: "rgb(51, 114, 130)", labelKey: "cyan" },
  { color: "rgb(43, 82, 132)", labelKey: "blue" },
  { color: "rgb(118, 56, 134)", labelKey: "purple" },
];

export function TextToolbar({
  inverseZoom,
  editor,
  onOpenModal,
  modalMode = false,
}: {
  inverseZoom: number;
  editor: Editor | null;
  onOpenModal?: () => void;
  modalMode?: boolean;
}) {
  const [showColors, setShowColors] = useState(false);
  const colorsRef = useRef<HTMLDivElement>(null);
  useClickOutside(colorsRef, showColors, () => setShowColors(false));
  const t = useTranslations("canvas");
  const tColor = useTranslations("colors");
  const currentColor = editor?.getAttributes("textStyle")?.color || "#ffffff";

  return (
    <div
      className={`${modalMode ? "relative nodrag" : "absolute left-1/2"} z-30 pointer-events-auto nowheel`}
      style={modalMode
        ? undefined
        : {
            top: "-40px",
            transform: `translateX(-50%) translateY(-100%) scale(${inverseZoom})`,
            transformOrigin: "center bottom",
          }}
    >
      <div className="flex items-center h-12 p-1 rounded-full bg-white/90 dark:bg-[#1a1a1a]/90 border border-zinc-200 dark:border-zinc-800 whitespace-nowrap relative gap-0.5 shadow-xl">
        {/* Color dot + picker */}
        <div className="relative" ref={colorsRef}>
          <button
            className="nodrag w-10 h-10 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseDown={(e) => { e.preventDefault(); setShowColors(!showColors); }}
          >
            <div className="w-4 h-4 rounded-full border border-zinc-300 dark:border-zinc-600" style={{ background: currentColor }} />
          </button>
          {showColors && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 flex flex-col gap-4 px-3 py-5 bg-white/80 dark:bg-black/60 backdrop-blur-lg rounded-xl border border-zinc-200 dark:border-zinc-700 z-[100] nodrag shadow-lg">
              {/* Reset color button */}
              <button
                className="nodrag w-6 h-6 rounded-full border border-zinc-600 bg-zinc-200 relative cursor-pointer hover:scale-110 before:content-[''] before:absolute before:inset-0 before:m-auto before:w-4 before:h-[1.5px] before:bg-zinc-500 before:rotate-45"
                title={t("resetColor")}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor?.chain().focus().unsetColor().run();
                  setShowColors(false);
                }}
              />
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.color}
                  className={`nodrag w-6 h-6 rounded-full border ${currentColor === c.color ? "border-white" : "border-zinc-600"} cursor-pointer hover:scale-110`}
                  style={{ background: c.color }}
                  title={tColor(c.labelKey)}
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    editor?.chain().focus().setColor(c.color).run();
                    setShowColors(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <div className="w-px h-[18px] bg-zinc-200 dark:bg-zinc-700" />

        {/* Headings */}
        <TbBtn icon={Heading1} active={editor?.isActive("heading", { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} />
        <TbBtn icon={Heading2} active={editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} />
        <TbBtn icon={Heading3} active={editor?.isActive("heading", { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} />
        <TbBtn icon={Pilcrow} active={editor?.isActive("paragraph")} onClick={() => editor?.chain().focus().setParagraph().run()} />

        <div className="w-px h-[18px] bg-zinc-200 dark:bg-zinc-700" />

        {/* Inline formatting */}
        <TbBtn icon={Bold} active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()} />
        <TbBtn icon={Italic} active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()} />
        <TbBtn icon={List} active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()} />
        <TbBtn icon={ListOrdered} active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
        <TbBtn icon={Minus} onClick={() => editor?.chain().focus().setHorizontalRule().run()} />

        {!modalMode && (
          <>
            <div className="w-px h-[18px] bg-zinc-200 dark:bg-zinc-700" />

            {/* Utility */}
            <TbBtn icon={Copy} onClick={() => { const text = editor?.getText(); if (text) navigator.clipboard.writeText(text); }} />
            <TbBtn icon={Maximize2} onClick={onOpenModal} />
            <TouchNodeActions />
          </>
        )}
      </div>
    </div>
  );
}

export function VolumeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 8a5 5 0 0 1 0 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.7 5a9 9 0 0 1 0 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
