"use client";

import { memo, useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Video, Sparkles, Scissors, Music, EllipsisVertical, ArrowUpFromDot, ArrowRightFromLine, Upload } from "lucide-react";
import type { NodeType } from "@/types/canvas";
import {
  PREVIEW_ZOOM_SMALL_MAX,
  PREVIEW_ZOOM_MEDIUM_MAX,
  getThumbnailLevels,
  getThumbnailLevelsList,
  getVideoDisplayUrl,
  resolveRenderSource,
} from "@/lib/media-url";
import { trackEvent } from "@/lib/analytics";
import { ImagePlaceholderIcon, ImageTitleIcon } from "../../node-constants";
import { AnnotationOverlay, type AnnotationStroke } from "../../../AnnotationOverlay";
import { createPortal } from "react-dom";
import type { IdleViewProps } from "../../plugin-types";
import { AudioWaveformPlayer } from "./AudioWaveformPlayer";
import { useCanvasStore } from "@/stores/canvas-store";
import { openFilePicker, uploadFile, type UploadResult, type VideoUploadResult } from "@/lib/upload-client";

const ERR_KEYS = new Set([
  "errContentSafety", "errBadParams", "errInsufficientBalance",
  "errConcurrency", "errTimeout", "errConnectionLost",
  "errRateLimit", "errGenericFailed", "errCopyright",
  "errContentSecurity", "errFaceDetected", "errSensitiveContent",
  "errNSFW",
]);

type PreviewTier = "sm" | "md" | "lg";

const SMALL_EXIT_THRESHOLD = PREVIEW_ZOOM_SMALL_MAX + 0.08;
const SMALL_ENTER_THRESHOLD = PREVIEW_ZOOM_SMALL_MAX - 0.08;
const LARGE_ENTER_THRESHOLD = PREVIEW_ZOOM_MEDIUM_MAX + 0.12;
const LARGE_EXIT_THRESHOLD = PREVIEW_ZOOM_MEDIUM_MAX - 0.1;

function tierFromZoom(zoom: number): PreviewTier {
  if (zoom <= PREVIEW_ZOOM_SMALL_MAX) return "sm";
  if (zoom <= PREVIEW_ZOOM_MEDIUM_MAX) return "md";
  return "lg";
}

function nextTierWithHysteresis(prev: PreviewTier, zoom: number): PreviewTier {
  if (!Number.isFinite(zoom)) return prev;
  if (prev === "sm") return zoom >= SMALL_EXIT_THRESHOLD ? "md" : "sm";
  if (prev === "lg") return zoom <= LARGE_EXIT_THRESHOLD ? "md" : "lg";
  if (zoom <= SMALL_ENTER_THRESHOLD) return "sm";
  if (zoom >= LARGE_ENTER_THRESHOLD) return "lg";
  return "md";
}

function readImageFileDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };
    img.onload = () => {
      const width = Number(img.naturalWidth || 0);
      const height = Number(img.naturalHeight || 0);
      cleanup();
      resolve(width > 0 && height > 0 ? { width, height } : null);
    };
    img.onerror = () => {
      cleanup();
      resolve(null);
    };
    img.src = objectUrl;
  });
}

export const MediaIdleView = memo(function MediaIdleView({ id, data, selected, soloSelected, isZoomedOut, zoom, updaters }: IdleViewProps) {
  const t = useTranslations("canvas");
  const nodeType = data.nodeType as NodeType;
  const isVideoGen = nodeType === "video-gen";
  const isUpscale = nodeType === "upscale";
  const isVideoUpscale = nodeType === "video-upscale";
  const isRembg = nodeType === "rembg";
  const isSourceImage = nodeType === "source-image";

  const hasAudio = !!data.audioUrl;
  const hasImage = !!data.imageUrl;
  const displayVideoSrc = getVideoDisplayUrl(data) ?? "";
  const hasVideo = !hasAudio && displayVideoSrc.length > 0;
  const imageUrls = (data.imageUrls ?? []) as string[];
  const originalImageUrls = (data.originalImageUrls ?? []) as string[];
  const thumbUrls = (data.thumbnailUrls ?? []) as string[];
  const thumbLevelsList = getThumbnailLevelsList(data);
  const hasMultiImage = imageUrls.length > 1;
  const primaryIdx = Number(data.primaryImageIndex ?? 0);
  const primaryImageSrc = String(data.imageUrl ?? "");
  const primaryThumbSrc = String(data.thumbnailUrl ?? "");
  const primaryThumbLevels = thumbLevelsList[primaryIdx] ?? getThumbnailLevels(data, primaryThumbSrc, primaryImageSrc);

  const [titleValue, setTitleValue] = useState(String(data.label ?? ""));
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showVideoMenu, setShowVideoMenu] = useState(false);
  const [videoActionRunning, setVideoActionRunning] = useState(false);
  const videoMenuRef = useRef<HTMLDivElement>(null);
  const imageNodeRef = useRef<HTMLDivElement>(null);

  const isImageGen = nodeType === "image-gen";
  const isGenerative = isImageGen || isVideoGen;
  const hasContent = hasImage || hasVideo || hasAudio;
  const [uploading, setUploading] = useState(false);

  const handleUploadToNode = useCallback(async () => {
    if (uploading) return;
    const acceptType = isVideoGen ? "video" as const : "image" as const;
    const file = await openFilePicker(acceptType);
    if (!file) return;
    setUploading(true);
    updaters.updateData({ status: "uploading" });
    try {
      const projectId = useCanvasStore.getState().projectId ?? undefined;
      const imageDimsPromise = acceptType === "image" ? readImageFileDimensions(file) : Promise.resolve(null);
      const result = await uploadFile(file, { projectId, nodeId: id });
      if ("mediaType" in result && result.mediaType === "video") {
        const vr = result as VideoUploadResult;
        updaters.updateData({
          videoUrl: vr.videoUrl,
          originalVideoUrl: vr.originalVideoUrl ?? vr.videoUrl,
          thumbnailUrl: vr.thumbnailUrl,
          thumbnailLevels: vr.thumbnailLevels,
          status: "succeeded",
        });
        if (vr.width && vr.height) {
          const BASE = 280;
          const ratio = vr.width / vr.height;
          const w = ratio >= 1 ? Math.round(BASE * ratio) : BASE;
          const h = ratio >= 1 ? BASE : Math.round(BASE / ratio);
          updaters.updateSize(w, h);
        }
      } else {
        const ir = result as UploadResult;
        const sourceDims = await imageDimsPromise;
        const finalWidth = sourceDims?.width;
        const finalHeight = sourceDims?.height;
        updaters.updateData({
          imageUrl: ir.url,
          originalUrl: ir.originalUrl ?? ir.url,
          thumbnailUrl: ir.thumbnailUrl,
          thumbnailLevels: ir.thumbnailLevels,
          status: "succeeded",
        });
        if (finalWidth && finalHeight) {
          const BASE = 280;
          const ratio = finalWidth / finalHeight;
          const w = ratio >= 1 ? Math.round(BASE * ratio) : BASE;
          const h = ratio >= 1 ? BASE : Math.round(BASE / ratio);
          updaters.updateSize(w, h);
        }
      }
    } catch (err) {
      console.error("[MediaIdleView] upload failed:", err);
      updaters.updateData({ status: "failed" });
    } finally {
      setUploading(false);
    }
  }, [id, isVideoGen, uploading, updaters]);

  const isGrokVideo = isVideoGen && String(data.model_id ?? "") === "grok-video";
  const hasKieTaskId = !!data.kie_task_id;
  const showGrokVideoMenu = isGrokVideo && hasVideo && hasKieTaskId && !videoActionRunning;

  // Click-outside to close video menu
  useEffect(() => {
    if (!showVideoMenu) return;
    const handler = (e: MouseEvent) => {
      if (videoMenuRef.current && !videoMenuRef.current.contains(e.target as Node)) {
        setShowVideoMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showVideoMenu]);

  const handleVideoAction = useCallback(async (action: "upscale" | "extend") => {
    setShowVideoMenu(false);
    setVideoActionRunning(true);
    updaters.updateData({ status: "running", errorMessage: undefined });

    try {
      const res = await fetch("/api/generate/video-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          kie_task_id: data.kie_task_id,
          node_id: id,
          project_id: useCanvasStore.getState().projectId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown" }));
        if (err.error === "CONCURRENCY_LIMIT") {
          updaters.updateData({ status: "succeeded" });
          return;
        }
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const { jobId } = await res.json();
      updaters.updateData({ jobId, status: "running" });
      window.dispatchEvent(new Event("xinyu:balance-changed"));

      await new Promise<void>((resolve, reject) => {
        let retries = 0;
        function connectSSE() {
          const es = new EventSource(`/api/jobs/${jobId}/sse`);
          es.onmessage = (event) => {
            retries = 0;
            try {
              const msg = JSON.parse(event.data);
              if (msg.status === "SUCCEEDED") {
                es.close();
                const displayUrl = String(msg.videoUrl ?? "");
                updaters.updateData({
                  videoUrl: displayUrl,
                  originalVideoUrl: String(msg.originalVideoUrl ?? displayUrl),
                  thumbnailUrl: msg.thumbnailUrl || undefined,
                  thumbnailLevels: msg.thumbnailLevels,
                  status: "succeeded",
                  ...(msg.video_width ? { video_width: msg.video_width } : {}),
                  ...(msg.video_height ? { video_height: msg.video_height } : {}),
                  ...(msg.kie_task_id ? { kie_task_id: msg.kie_task_id } : {}),
                });
                window.dispatchEvent(new Event("xinyu:balance-changed"));
                window.dispatchEvent(new Event("xinyu:save-now"));
                resolve();
              } else if (msg.status === "FAILED") {
                es.close();
                reject(new Error(msg.error || `Video ${action} failed`));
              }
            } catch { /* ignore */ }
          };
          es.onerror = () => {
            es.close();
            if (retries < 10) { retries++; setTimeout(connectSSE, Math.min(3000 * retries, 15000)); }
            else reject(new Error("SSE connection lost"));
          };
        }
        connectSSE();
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      updaters.updateData({
        status: "failed",
        errorMessage: msg || t("videoUpscaleFailed"),
      });
      window.dispatchEvent(new Event("xinyu:balance-changed"));
    } finally {
      setVideoActionRunning(false);
      window.dispatchEvent(new Event("xinyu:save-now"));
    }
  }, [id, data.kie_task_id, updaters, t]);
  const [previewTier, setPreviewTier] = useState<PreviewTier>(() => tierFromZoom(zoom));
  const imageRender = resolveRenderSource(zoom, {
    kind: "image",
    data,
    displayUrl: primaryImageSrc,
    thumbnailUrl: primaryThumbSrc,
    thumbnailLevels: primaryThumbLevels,
    preferredTier: previewTier,
  });
  const imagePreviewSrc = imageRender.url;
  const videoRender = resolveRenderSource(zoom, {
    kind: "video",
    data,
    preferredTier: previewTier,
  });
  const videoPosterSrc = videoRender.url;
  const initialPreviewSrc = hasVideo ? videoPosterSrc : imagePreviewSrc;

  const [previewSrc, setPreviewSrc] = useState(initialPreviewSrc);
  const [previewFailed, setPreviewFailed] = useState(initialPreviewSrc.length === 0);
  const currentPreviewSrcRef = useRef(initialPreviewSrc);
  const previewSwitchRequestRef = useRef(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const [realResLabel, setRealResLabel] = useState<string | null>(null);
  const origSrc = String(data.originalUrl ?? data.imageUrl ?? "");
  useEffect(() => {
    if (!origSrc) { setRealResLabel(null); return; }
    const img = new Image();
    img.onload = () => {
      const shorter = Math.min(img.naturalWidth, img.naturalHeight);
      if (shorter >= 4320) setRealResLabel("8K");
      else if (shorter >= 2160) setRealResLabel("4K");
      else if (shorter >= 1440) setRealResLabel("3K");
      else setRealResLabel(null);
    };
    img.onerror = () => setRealResLabel(null);
    img.src = origSrc;
    return () => { img.onload = null; img.onerror = null; };
  }, [origSrc]);
  const lastTrackedRenderTierRef = useRef<string>("");

  useEffect(() => {
    setPreviewTier((prev) => nextTierWithHysteresis(prev, zoom));
  }, [zoom]);

  useEffect(() => {
    currentPreviewSrcRef.current = previewSrc;
  }, [previewSrc]);

  useEffect(() => {
    if (initialPreviewSrc.length === 0) {
      currentPreviewSrcRef.current = "";
      setPreviewSrc("");
      setPreviewFailed(true);
      return;
    }
    if (initialPreviewSrc === currentPreviewSrcRef.current) {
      setPreviewFailed(false);
      return;
    }

    const requestId = ++previewSwitchRequestRef.current;
    const preloader = new Image();
    preloader.decoding = "async";

    const commit = () => {
      if (previewSwitchRequestRef.current !== requestId) return;
      currentPreviewSrcRef.current = initialPreviewSrc;
      setPreviewSrc(initialPreviewSrc);
      setPreviewFailed(false);
    };

    const fail = () => {
      if (previewSwitchRequestRef.current !== requestId) return;
      if (!currentPreviewSrcRef.current) {
        currentPreviewSrcRef.current = initialPreviewSrc;
        setPreviewSrc(initialPreviewSrc);
      }
      setPreviewFailed(true);
    };

    preloader.onload = commit;
    preloader.onerror = fail;
    preloader.src = initialPreviewSrc;
    if (preloader.complete && preloader.naturalWidth > 0) {
      commit();
    }

    return () => {
      if (previewSwitchRequestRef.current === requestId) {
        preloader.onload = null;
        preloader.onerror = null;
      }
    };
  }, [initialPreviewSrc]);

  useEffect(() => {
    setVideoFailed(false);
  }, [displayVideoSrc]);

  useEffect(() => {
    if (!hasImage && !hasVideo) return;
    const mediaType = hasVideo ? "video" : "image";
    const tier = hasVideo && !isZoomedOut ? "display" : (hasVideo ? videoRender.tier : imageRender.tier);
    const key = `${mediaType}:${tier}`;
    if (lastTrackedRenderTierRef.current === key) return;
    lastTrackedRenderTierRef.current = key;
    trackEvent("canvas_zoom_tier_hit", {
      nodeId: id,
      nodeType: String(nodeType),
      mediaType,
      tier,
      zoom: Number(zoom.toFixed(2)),
    });
  }, [hasImage, hasVideo, id, imageRender.tier, isZoomedOut, nodeType, videoRender.tier, zoom]);

  const handlePreviewError = () => {
    if (previewSrc !== primaryImageSrc && primaryImageSrc.length > 0) {
      setPreviewSrc(primaryImageSrc);
      return;
    }
    setPreviewFailed(true);
  };
  const showPreviewImage = previewSrc.length > 0 && !previewFailed;

  return (
    <div
      ref={imageNodeRef}
      className={`group relative overflow-visible rounded-[12px] border border-zinc-200 dark:border-transparent bg-white dark:bg-[#1c1c1c] ${selected ? "ring-1 ring-zinc-400 dark:ring-zinc-600" : ""}`}
      style={{ width: "100%", height: "100%" }}
    >
      {/* Floating title above card */}
      <div className="absolute -translate-y-full left-1 -top-0 pb-2 w-full text-zinc-400/70 overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-1">
        <span className="shrink-0 flex items-center">
          {isUpscale || isVideoUpscale ? <Sparkles size={14} className="text-zinc-400/70" /> : isRembg ? <Scissors size={14} className="text-zinc-400/70" /> : hasAudio ? <Music size={14} className="text-zinc-400/70" /> : (isVideoGen || hasVideo) ? <Video size={14} className="text-zinc-400/70" /> : <ImageTitleIcon size={16} />}
        </span>
        <div className="flex items-center relative w-full">
          <input
            className="nodrag nowheel bg-transparent text-sm text-zinc-400 border-none outline-none p-0 w-full h-auto overflow-hidden text-ellipsis whitespace-nowrap placeholder:text-zinc-600 focus:ring-0"
            placeholder={t("enterTitle")}
            value={titleValue}
            onChange={(e) => {
              setTitleValue(e.target.value);
              updaters.updateData({ label: e.target.value });
            }}
            onPointerDownCapture={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      {/* Audio / Image / Video content area */}
      {hasAudio ? (
        <AudioWaveformPlayer audioUrl={String(data.audioUrl)} audioDuration={Number(data.audioDuration) || undefined} />
      ) : (
      <div className="absolute inset-0 w-full h-full overflow-hidden rounded-[12px]">
        {hasVideo ? (
          isZoomedOut && showPreviewImage ? (
            <img
              src={previewSrc}
              alt={titleValue || "video"}
              className="w-full h-full object-cover"
              loading="eager"
              decoding="async"
              onError={handlePreviewError}
              onLoad={() => setPreviewFailed(false)}
            />
          ) : (
            <video
              src={displayVideoSrc}
              poster={videoPosterSrc || undefined}
              className="w-full h-full object-cover"
              controls={selected}
              loop muted playsInline
              preload="metadata"
              autoPlay={selected}
              onError={() => setVideoFailed(true)}
              onMouseEnter={(e) => { e.currentTarget.play().catch(() => {}); }}
              onMouseLeave={(e) => { if (!selected) { e.currentTarget.pause(); } }}
            />
          )
        ) : hasImage ? (
          <>
            {showPreviewImage ? (
              <img
                src={previewSrc}
                alt={titleValue || "image"}
                className="w-full h-full object-cover"
                loading="eager"
                decoding="async"
                onError={handlePreviewError}
                onLoad={() => setPreviewFailed(false)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-500">
                <ImagePlaceholderIcon size={48} opacity={0.2} />
              </div>
            )}
            {hasMultiImage && !showImagePicker && imageUrls.slice(1, Math.min(imageUrls.length, 4)).map((_, i) => (
              <div
                key={i}
                className="absolute inset-0 rounded-[12px] border border-white/10 pointer-events-none"
                style={{
                  zIndex: -(i + 1),
                  backgroundColor: `rgba(39,39,42,${0.6 - i * 0.15})`,
                  transform: `rotate(${(i + 1) * 3}deg)`,
                  right: -(i + 1) * 8,
                  top: (i + 1) * 4,
                  left: "auto", bottom: "auto",
                  width: "100%", height: "100%",
                }}
              />
            ))}
            {hasMultiImage && (
              <button
                type="button"
                className="nodrag absolute top-2.5 right-2.5 z-10 flex items-center gap-1 h-7 px-2.5 rounded-md bg-black/80 text-white/80 text-xs font-medium hover:bg-black/90 transition-colors border border-white/10"
                onClick={(e) => { e.stopPropagation(); setShowImagePicker(!showImagePicker); }}
              >
                <span>{imageUrls.length}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-500">
            {isUpscale ? (
              <div className="flex flex-col items-center gap-2"><Sparkles size={32} className="text-zinc-600" /><span className="text-xs text-zinc-600">{t("enhanceLabel")}</span></div>
            ) : isVideoUpscale ? (
              <div className="flex flex-col items-center gap-2"><Sparkles size={32} className="text-zinc-600" /><span className="text-xs text-zinc-600">{t("videoEnhanceLabel")}</span></div>
            ) : isRembg ? (
              <div className="flex flex-col items-center gap-2"><Scissors size={32} className="text-zinc-600" /><span className="text-xs text-zinc-600">{t("rembgLabel")}</span></div>
            ) : isVideoGen ? (
              <div className="flex flex-col items-center gap-2"><Video size={32} className="text-zinc-600" /><span className="text-xs text-zinc-600">{t("videoGen")}</span></div>
            ) : isImageGen ? (
              <ImagePlaceholderIcon size={48} opacity={0.2} />
            ) : (
              <ImagePlaceholderIcon size={48} opacity={0.2} />
            )}
          </div>
        )}

        {hasImage && showPreviewImage && Array.isArray(data.annotations) && data.annotations.length > 0 && (
          <AnnotationOverlay annotations={data.annotations as AnnotationStroke[]} />
        )}

        {/* Re-upload for source-image nodes */}
        {isSourceImage && !hasAudio && (
          <button
            className="nodrag absolute top-2 right-2 z-[5] flex items-center gap-2 w-fit px-4 py-2 h-9 text-sm font-medium text-white rounded-md bg-zinc-800/80 hover:bg-zinc-700/80 cursor-pointer border border-zinc-600/50 transition-colors"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onClick={() => window.dispatchEvent(new CustomEvent("xinyu:reupload", { detail: { nodeId: id } }))}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 9-6-6-6 6"/><path d="M12 3v14"/></svg>
            {t("upload")}
          </button>
        )}

        {/* Multi-image picker modal */}
        {showImagePicker && hasMultiImage && typeof document !== "undefined" && createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowImagePicker(false)}
            onPointerDownCapture={(e) => e.stopPropagation()}
          >
            <div
              className="relative flex flex-col bg-zinc-900/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden w-[90vw] max-w-[720px] max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
                <span className="text-sm font-medium text-white/80">{imageUrls.length} {t("generatedImages")}</span>
                <button type="button" className="text-white/40 hover:text-white transition-colors p-1" onClick={() => setShowImagePicker(false)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-3 overflow-y-auto">
                <div className={`grid gap-3 ${imageUrls.length <= 2 ? "grid-cols-2" : imageUrls.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`}>
                  {imageUrls.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className={`relative rounded-xl overflow-hidden border-2 transition-all hover:ring-2 hover:ring-[#CCFF00]/30 cursor-pointer ${idx === primaryIdx ? "border-[#CCFF00]" : "border-white/10 hover:border-white/30"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const nextLevels = thumbLevelsList[idx];
                        updaters.updateData({
                          imageUrl: url,
                          originalUrl: originalImageUrls[idx] ?? url,
                          thumbnailUrl: thumbUrls[idx] ?? url,
                          ...(nextLevels ? { thumbnailLevels: nextLevels } : {}),
                          primaryImageIndex: idx,
                        });
                        setShowImagePicker(false);
                      }}
                    >
                      <img src={thumbUrls[idx] ?? url} alt={`Option ${idx + 1}`} className="w-full object-cover aspect-[3/4]" decoding="async" loading="eager" />
                      {idx === primaryIdx && (
                        <div className="absolute top-2 left-2 h-5 px-1.5 bg-[#CCFF00] rounded-[4px] flex items-center">
                          <span className="text-[10px] font-bold text-black">{t("primary")}</span>
                        </div>
                      )}
                      <div className="absolute bottom-2 right-2 h-5 px-1.5 bg-black/60 rounded-[4px] flex items-center">
                        <span className="text-[10px] text-white/70">{idx + 1}/{imageUrls.length}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
      )}

      {/* Re-upload for audio source-image nodes */}
      {isSourceImage && hasAudio && (
        <button
          className="nodrag absolute top-2 right-2 z-[5] flex items-center gap-2 w-fit px-4 py-2 h-9 text-sm font-medium text-white rounded-md bg-zinc-800/80 hover:bg-zinc-700/80 cursor-pointer border border-zinc-600/50 transition-colors"
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={() => window.dispatchEvent(new CustomEvent("xinyu:reupload", { detail: { nodeId: id } }))}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 9-6-6-6 6"/><path d="M12 3v14"/></svg>
          {t("upload")}
        </button>
      )}

      {/* Favorite heart */}
      {(hasImage || hasVideo) && !isSourceImage && (
        <button
          className={`nodrag absolute top-2 left-2 z-10 p-1 rounded-full transition-all duration-200 cursor-pointer
            ${data.isFavorited
              ? "text-red-500 opacity-100 scale-100 drop-shadow-[0_0_4px_rgba(239,68,68,0.5)]"
              : "text-white/70 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 hover:text-red-400"}
          `}
          style={{ background: data.isFavorited ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.35)" }}
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); updaters.updateData({ isFavorited: !data.isFavorited }); }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={data.isFavorited ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={data.isFavorited ? "animate-[heartBeat_0.3s_ease-in-out]" : ""}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      )}

      {/* Resolution badge (based on actual image dimensions) */}
      {hasImage && realResLabel && (
        <div className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded bg-black/60 text-[10px] font-bold text-white tracking-wide">{realResLabel}</div>
      )}

      {/* Compliance badge */}
      {hasImage && data.complianceStatus === "passed" && (
        <div className="absolute bottom-2 right-2 z-10 drop-shadow-[0_0_4px_rgba(34,197,94,0.4)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#22c55e" stroke="none">
            <path d="M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-1.293 5.953a1 1 0 0 0 -1.32 -.083l-.094 .083l-3.293 3.292l-1.293 -1.292l-.094 -.083a1 1 0 0 0 -1.403 1.403l.083 .094l2 2l.094 .083a1 1 0 0 0 1.226 0l.094 -.083l4 -4l.083 -.094a1 1 0 0 0 -.083 -1.32z" />
          </svg>
        </div>
      )}
      {hasImage && data.complianceStatus === "failed" && (
        <div className="absolute bottom-2 right-2 z-10 drop-shadow-[0_0_4px_rgba(239,68,68,0.4)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="none">
            <path d="M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-6.489 5.8a1 1 0 0 0 -1.218 1.567l1.292 1.293l-1.292 1.293l-.083 .094a1 1 0 0 0 1.497 1.32l1.293 -1.292l1.293 1.292l.094 .083a1 1 0 0 0 1.32 -1.497l-1.292 -1.293l1.292 -1.293l.083 -.094a1 1 0 0 0 -1.497 -1.32l-1.293 1.292l-1.293 -1.292l-.094 -.083z" />
          </svg>
        </div>
      )}

      {/* Grok Video action menu — disabled until KIE upscale/extend API is stable */}
      {/* {showGrokVideoMenu && (
        <div ref={videoMenuRef} className="nodrag absolute bottom-2 right-2 z-20">
          <button
            type="button"
            className="flex items-center justify-center w-7 h-7 rounded-full bg-black/60 text-white/70 hover:text-white hover:bg-black/80 transition-colors cursor-pointer backdrop-blur-sm border border-white/10"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowVideoMenu(!showVideoMenu); }}
          >
            <EllipsisVertical size={14} />
          </button>
          {showVideoMenu && (
            <div className="absolute bottom-full right-0 mb-1.5 min-w-[140px] py-1 rounded-lg bg-zinc-900/95 backdrop-blur-md border border-white/10 shadow-xl">
              <button
                type="button"
                className="nodrag w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-white/[0.08] transition-colors"
                onPointerDownCapture={(e) => e.stopPropagation()}
                onClick={() => handleVideoAction("upscale")}
              >
                <ArrowUpFromDot size={14} className="text-zinc-400" />
                {t("videoUpscale")}
              </button>
              <button
                type="button"
                className="nodrag w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-200 hover:bg-white/[0.08] transition-colors"
                onPointerDownCapture={(e) => e.stopPropagation()}
                onClick={() => handleVideoAction("extend")}
              >
                <ArrowRightFromLine size={14} className="text-zinc-400" />
                {t("videoExtend")}
              </button>
            </div>
          )}
        </div>
      )} */}

      {/* Upload toolbar for empty generative nodes (positioned like ImageToolbar) */}
      {isGenerative && !hasContent && soloSelected && (
        <div
          className="absolute left-1/2 z-30 pointer-events-auto nowheel"
          style={{
            top: "-40px",
            transform: `translateX(-50%) translateY(-100%) scale(${1 / zoom})`,
            transformOrigin: "center bottom",
          }}
        >
          <button
            type="button"
            className="nodrag flex items-center gap-1.5 h-10 px-4 rounded-full bg-white dark:bg-[#1a1a1a]/90 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-xs font-medium shadow-sm transition-colors cursor-pointer whitespace-nowrap"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); handleUploadToNode(); }}
            disabled={uploading}
          >
            <Upload size={14} />
            {uploading ? t("uploading") : t("upload")}
          </button>
        </div>
      )}

      {/* Status indicators moved to NodeShell overlays (MeteorShowerOverlay for running/queued, FailedOverlay for failed) */}
    </div>
  );
});
