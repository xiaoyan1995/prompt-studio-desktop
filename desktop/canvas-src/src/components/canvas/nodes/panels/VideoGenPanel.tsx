"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useMaterials } from "@/hooks/use-materials";
import { usePricingPromo, applyDiscount } from "@/hooks/use-pricing-promo";
import { useTranslations } from "next-intl";
import { Fullscreen, Settings2, BookOpen, Sparkles } from "lucide-react";
import { extractMaterialUrls } from "@/lib/material-utils";
import { useCanvasStore } from "@/stores/canvas-store";
import { ASPECT_RATIOS } from "../panel-shared";
import { PromptEditor } from "../PromptEditor";
import type { RefSuggestion, PromptEditorHandle } from "../PromptEditor";
import { SortableRefRow, type SortableRefItem } from "../SortableRefRow";
import { PromptLibraryPopover } from "../PromptLibraryPopover";
import { PromptRewritePopover } from "../PromptRewritePopover";
import {
  useClickOutside,
  useAutoFlip,
  PanelShell,
  CreditsPill,
  RefThumb,
  RefImageButton,
  KlingIcon,
  GrokIcon,
  LtxIcon,
  SeedreamIcon,
  WanIcon,
  VideoVolumeIcon,
  SegmentControl,
  VIDEO_VERSIONS,
  VIDEO_DURATIONS,
  VIDEO_RATIOS,
  GROK_VIDEO_RATIOS,
  GROK_VIDEO_DURATIONS,
  GROK_VIDEO_RESOLUTIONS,
  LTX_RATIOS,
  LTX_DURATIONS_PRO,
  LTX_DURATIONS_FAST,
  LTX_RESOLUTIONS,
  LTX_FPS_OPTIONS,
  SEEDANCE_RATIOS,
  SEEDANCE_DURATIONS,
  SEEDANCE2_DURATIONS,
  SEEDANCE_RESOLUTIONS,
  SEEDANCE2_RESOLUTIONS,
  SEEDANCE2_FAST_RESOLUTIONS,
  KLING_RESOLUTIONS,
  KLING_O3_RESOLUTIONS,
  WAN_VIDEO_RATIOS,
  WAN_VIDEO_DURATIONS,
  WAN_VIDEO_DURATIONS_SHORT,
  WAN_VIDEO_RESOLUTIONS,
  parseVideoModelId,
  calcVideoCredits,
  calcVideoEditCredits,
  isGrokVideoModel,
  isLtxVideoModel,
  isWanVideoModel,
  isSeedanceVideoModel,
  isSeedance2VideoModel,
} from "../panel-shared";

type VideoRefMode = "startEnd" | "imageRef" | "videoEdit" | "videoRef";

function VideoSettingsPanel({
  tier, aspectRatio, duration, generateAudio, isVideoEdit, isGrok, isLtx, isWan, isSeedance, isSeedance2, resolution, fps, version,
  onTierChange, onAspectRatioChange, onDurationChange, onAudioChange, onResolutionChange,
}: {
  tier: string; aspectRatio: string; duration: number; generateAudio: boolean; isVideoEdit: boolean; isGrok: boolean; isLtx: boolean; isWan: boolean; isSeedance: boolean; isSeedance2: boolean; resolution: string; fps: string; version: string;
  onTierChange: (v: string) => void; onAspectRatioChange: (v: string) => void;
  onDurationChange: (v: number) => void; onAudioChange: (v: boolean) => void; onResolutionChange: (v: string) => void;
}) {
  const t = useTranslations("canvas");
  const ltxFastLongOk = fps === "25" && resolution === "1080p";
  const ltxDurations = tier === "pro"
    ? LTX_DURATIONS_PRO
    : ltxFastLongOk
      ? LTX_DURATIONS_FAST
      : LTX_DURATIONS_FAST.filter((d) => d <= 10);
  const wanHasVideoRef = false; // settings panel doesn't have ref info; use full durations
  const durations = isWan ? WAN_VIDEO_DURATIONS : isSeedance2 ? SEEDANCE2_DURATIONS : isSeedance ? SEEDANCE_DURATIONS : isGrok ? GROK_VIDEO_DURATIONS : isLtx ? ltxDurations : VIDEO_DURATIONS;
  const durIdx = (durations as readonly number[]).indexOf(duration);
  const ratioOptions = isWan ? WAN_VIDEO_RATIOS : isSeedance ? SEEDANCE_RATIOS : isGrok ? GROK_VIDEO_RATIOS : isLtx ? LTX_RATIOS : VIDEO_RATIOS;
  const durCols = durations.length <= 5 ? durations.length : Math.ceil(durations.length / 2);

  const isKling3 = version === "3";
  const isO3 = version === "o3";
  const isKling = isKling3 || isO3;
  const showTier = !isGrok && !isWan && !isSeedance && !isKling;
  const tierOptions = isLtx
    ? [{ value: "fast", label: t("videoFast") }, { value: "pro", label: t("videoPro") }]
    : [{ value: "standard", label: t("videoStandard") }, { value: "pro", label: t("videoPro") }];
  return (
    <div
      className="w-[320px] p-1 rounded-[20px]"
      style={{
        background: "rgba(51,51,51,0.80)",
        backdropFilter: "blur(28px)",
        boxShadow: "0px 4px 16px rgba(0,0,0,0.16), inset 0px 0.5px 0px rgba(255,255,255,0.16)",
      }}
      onPointerDownCapture={(e) => e.stopPropagation()}
    >
      {/* Mode: Standard/Pro or Fast/Pro (hidden for Grok) */}
      {showTier && (
        <div className="p-2 flex flex-col gap-1.5">
          <div className="text-xs font-medium text-zinc-400 px-1">{t("videoMode")}</div>
          <SegmentControl options={tierOptions} value={tier} onChange={onTierChange} />
        </div>
      )}

      {!isVideoEdit && (
        <>
          {/* Aspect ratio */}
          <div className="p-2 flex flex-col gap-1.5">
            <div className="text-xs font-medium text-zinc-400 px-1">{t("aspectRatio")}</div>
            {(() => {
              const showAuto = !isLtx;
              const ratioCols = ratioOptions.length <= 4 ? ratioOptions.length : Math.ceil(ratioOptions.length / 2);
              return (
                <div className="relative flex gap-1.5 bg-white/[0.06] rounded-lg p-1">
                  {showAuto && (
                    <button
                      type="button"
                      className={`nodrag relative z-10 flex flex-col items-center justify-center rounded-md transition-colors duration-200 w-14 py-2 gap-1 ${
                        aspectRatio === "auto" || !aspectRatio ? "text-white bg-white/[0.1]" : "text-zinc-500 hover:text-zinc-200"
                      }`}
                      onPointerDownCapture={(e) => e.stopPropagation()}
                      onMouseDown={(e) => { e.preventDefault(); onAspectRatioChange("auto"); }}
                    >
                      <Fullscreen size={20} />
                      <span className="text-xs">{t("adaptive")}</span>
                    </button>
                  )}
                  <div className="grid gap-1 flex-1" style={{ gridTemplateColumns: `repeat(${ratioCols}, 1fr)` }}>
                    {ratioOptions.map((r) => {
                      const full = ASPECT_RATIOS.find((a) => a.value === r.value);
                      const rw = full?.w ?? 1;
                      const rh = full?.h ?? 1;
                      const iconMax = 14;
                      const ratio = rw / rh;
                      const iW = ratio >= 1 ? iconMax : Math.round(iconMax * ratio);
                      const iH = ratio >= 1 ? Math.round(iconMax / ratio) : iconMax;
                      return (
                        <button
                          key={r.value}
                          type="button"
                          className={`nodrag relative z-10 flex flex-col items-center justify-center rounded-md transition-colors duration-200 py-1.5 gap-0.5 ${
                            r.value === aspectRatio ? "text-white bg-white/[0.1]" : "text-zinc-500 hover:text-zinc-200"
                          }`}
                          onPointerDownCapture={(e) => e.stopPropagation()}
                          onMouseDown={(e) => { e.preventDefault(); onAspectRatioChange(r.value); }}
                        >
                          <div className="flex items-center justify-center flex-none" style={{ width: 14, height: 14 }}>
                            <div className="border-[1.5px] border-current rounded-[2px]" style={{ width: iW, height: iH }} />
                          </div>
                          <span className="text-[10px]">{r.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Duration */}
          <div className="p-2 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 px-1">
              <div className="text-xs font-medium text-zinc-400">{t("duration")}</div>
              {isLtx && tier === "fast" && !ltxFastLongOk && (
                <span className="text-[10px] text-amber-400/70">{t("ltxLongDurationHint")}</span>
              )}
            </div>
            <div
              className="grid gap-0.5 rounded-lg p-0.5 nodrag"
              style={{
                background: "rgba(255,255,255,0.06)",
                gridTemplateColumns: `repeat(${durCols}, 1fr)`,
              }}
            >
              {(durations as readonly number[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`nodrag relative z-10 py-1.5 rounded-md text-sm transition-colors duration-200 text-center ${
                    duration === d ? "text-white font-medium bg-white/[0.08]" : "text-zinc-400 hover:text-white"
                  }`}
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  onMouseDown={(e) => { e.preventDefault(); onDurationChange(d); }}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          {/* Resolution */}
          {(isGrok || isLtx || isWan || isSeedance || isKling) && (
            <div className="p-2 flex flex-col gap-1.5">
              <div className="text-xs font-medium text-zinc-400 px-1">{t("resolution")}</div>
              <SegmentControl
                options={(isWan ? WAN_VIDEO_RESOLUTIONS : isKling3 ? KLING_RESOLUTIONS : isO3 ? KLING_O3_RESOLUTIONS : (version === "seedance-2-fast" || version === "seedance-2-fast-cli") ? SEEDANCE2_FAST_RESOLUTIONS : isSeedance2 ? SEEDANCE2_RESOLUTIONS : isSeedance ? SEEDANCE_RESOLUTIONS : isLtx ? LTX_RESOLUTIONS : GROK_VIDEO_RESOLUTIONS).map((r) => ({ value: r.value, label: r.label }))}
                value={resolution}
                onChange={onResolutionChange}
              />
            </div>
          )}

        </>
      )}

      {isVideoEdit && !isGrok && (
        <div className="p-2 flex flex-col gap-1.5">
          <div className="text-xs font-medium text-zinc-400 px-1">{t("keepAudio")}</div>
          <SegmentControl
            options={[{ value: "on", label: t("on") }, { value: "off", label: t("off") }]}
            value={generateAudio ? "on" : "off"}
            onChange={(v) => onAudioChange(v === "on")}
          />
        </div>
      )}
    </div>
  );
}

export function VideoGenPanel({
  prompt,
  promptJson,
  modelId,
  aspectRatio,
  durationS,
  generateAudio,
  resolution,
  fps,
  videoRefMode,
  videoRefOrder,
  referenceImages,
  referenceVideos,
  referenceAudios,
  imageNodes,
  videoNodes,
  audioNodes,
  connectedTextNodes,
  onPromptChange,
  onModelChange,
  onAspectRatioChange,
  onDurationChange,
  onAudioChange,
  onResolutionChange,
  onFpsChange,
  onRefModeChange,
  onRefOrderChange,
  onGenerate,
  isGenerating,
  inverseZoom,
  onRemoveRef,
}: {
  prompt: string;
  promptJson?: any;
  modelId: string;
  aspectRatio: string;
  durationS: number;
  generateAudio: boolean;
  resolution: string;
  fps: string;
  videoRefMode: VideoRefMode;
  videoRefOrder: number[];
  referenceImages: string[];
  referenceVideos: string[];
  referenceAudios?: string[];
  imageNodes?: Array<{ nodeId: string; url: string; thumbnailUrl: string; label: string }>;
  videoNodes?: Array<{ nodeId: string; url: string; thumbnailUrl: string; label: string }>;
  audioNodes?: Array<{ nodeId: string; url: string; thumbnailUrl: string; label: string }>;
  connectedTextNodes?: Array<{ id?: string; label?: string; content?: string }>;
  onPromptChange: (v: string, json?: any) => void;
  onModelChange: (v: string) => void;
  onAspectRatioChange: (v: string) => void;
  onDurationChange: (v: number) => void;
  onAudioChange: (v: boolean) => void;
  onResolutionChange: (v: string) => void;
  onFpsChange: (v: string) => void;
  onRefModeChange: (v: VideoRefMode) => void;
  onRefOrderChange: (order: number[]) => void;
  onGenerate?: () => void;
  isGenerating?: boolean;
  onRemoveRef?: (url: string, type: "image" | "video" | "audio") => void;
  inverseZoom: number;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [showPromptRewrite, setShowPromptRewrite] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const promptLibraryRef = useRef<HTMLDivElement>(null);
  const promptRewriteRef = useRef<HTMLDivElement>(null);
  const promptEditorRef = useRef<PromptEditorHandle>(null);
  useClickOutside(settingsRef, showSettings, () => setShowSettings(false));
  useClickOutside(promptLibraryRef, showPromptLibrary, () => setShowPromptLibrary(false));
  useClickOutside(promptRewriteRef, showPromptRewrite, () => setShowPromptRewrite(false));
  const [promptLibraryFlipUp, promptLibraryDropRef] = useAutoFlip(promptLibraryRef, showPromptLibrary);
  const [promptRewriteFlipUp, promptRewriteDropRef] = useAutoFlip(promptRewriteRef, showPromptRewrite);
  const t = useTranslations("canvas");

  const { version, tier } = parseVideoModelId(modelId);
  const isGrok = isGrokVideoModel(modelId);
  const isLtx = isLtxVideoModel(modelId);
  const isWan = isWanVideoModel(modelId);
  const isSeedance = isSeedanceVideoModel(modelId);
  const isSeedance2 = isSeedance2VideoModel(modelId);
  const currentVersion = VIDEO_VERSIONS.find((v) => v.id === version) || VIDEO_VERSIONS[0];
  const isKling3 = version === "3";
  const isO3 = version === "o3";
  const isKling = isKling3 || isO3;
  const tierLabel = isGrok || isWan || isSeedance || isKling ? "" : isLtx ? (tier === "pro" ? t("videoPro") : t("videoFast")) : (tier === "pro" ? t("videoPro") : t("videoStandard"));
  const duration = durationS || (isLtx ? 6 : 5);
  const showResInCredits = isGrok || isLtx || isWan || isSeedance || isKling;

  const hasVideoRef = referenceVideos.length > 0;
  const isVideoMode = videoRefMode === "videoEdit" || videoRefMode === "videoRef";
  const effectiveMode = hasVideoRef
    ? (isSeedance2 ? "imageRef" : isWan ? "imageRef" : (isVideoMode ? videoRefMode : "videoEdit"))
    : isGrok
      ? "imageRef"
      : isLtx
        ? "startEnd"
        : (isVideoMode ? "startEnd" : videoRefMode);

  const isVideoEditMode = hasVideoRef && (effectiveMode === "videoEdit" || effectiveMode === "videoRef") && !isSeedance2;
  const refVideoDuration = useMemo(() => {
    if (!videoNodes || videoNodes.length === 0) return 0;
    let total = 0;
    for (const vn of videoNodes) {
      const nd = useCanvasStore.getState()._nodeMap.get(vn.nodeId)?.data;
      const dur = Number(nd?.duration_s ?? 0);
      if (dur > 0) total += dur;
    }
    return total;
  }, [videoNodes]);
  const credits = isVideoEditMode
    ? calcVideoEditCredits(modelId, duration)
    : calcVideoCredits(modelId, duration, isGrok ? true : generateAudio, showResInCredits ? (resolution || (isGrok ? "720p" : isWan ? "720p" : isSeedance ? "720p" : isKling3 ? "720p" : "1080p")) : undefined, referenceVideos.length > 0, refVideoDuration || undefined);
  const { discountPct } = usePricingPromo(modelId);
  const discountedCredits = applyDiscount(credits, discountPct);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  useClickOutside(modelPickerRef, showModelPicker, () => setShowModelPicker(false));
  const [modelFlipUp, modelDropRef] = useAutoFlip(modelPickerRef, showModelPicker);

  useEffect(() => {
    if (hasVideoRef && !isGrok && !isO3 && !isLtx && !isWan && !isSeedance) {
      const klingTier = tier === "fast" ? "standard" : tier;
      onModelChange(`kling-o3-${klingTier}`);
    }
  }, [hasVideoRef, isGrok, isO3, isLtx, isSeedance, isSeedance2, version, tier, onModelChange]);

  useEffect(() => {
    if (isGrok && !hasVideoRef && videoRefMode === "startEnd") {
      onRefModeChange("imageRef");
    }
  }, [isGrok, hasVideoRef, videoRefMode, onRefModeChange]);

  useEffect(() => {
    if (isLtx && !hasVideoRef && videoRefMode === "imageRef") {
      onRefModeChange("startEnd");
    }
  }, [isLtx, hasVideoRef, videoRefMode, onRefModeChange]);

  useEffect(() => {
    if (!isSeedance2) return;
    const hasAudio = (referenceAudios?.length ?? 0) > 0;
    if ((hasVideoRef || hasAudio) && videoRefMode !== "imageRef") {
      onRefModeChange("imageRef");
    } else if (referenceImages.length > 2 && videoRefMode === "startEnd") {
      onRefModeChange("imageRef");
    } else if (!hasVideoRef && !hasAudio && videoRefMode !== "imageRef" && videoRefMode !== "startEnd") {
      onRefModeChange("imageRef");
    }
  }, [isSeedance2, hasVideoRef, referenceAudios, referenceImages.length, videoRefMode, onRefModeChange]);

  useEffect(() => {
    if (!isLtx) return;
    const validDur = tier === "pro" ? [6, 8, 10] : [6, 8, 10, 12, 14, 16, 18, 20];
    if (!validDur.includes(duration)) {
      onDurationChange(validDur.reduce((a, b) => Math.abs(b - duration) < Math.abs(a - duration) ? b : a));
    }
    const ar = aspectRatio || "";
    if (ar && ar !== "auto" && !["16:9", "9:16"].includes(ar)) {
      onAspectRatioChange("16:9");
    }
    const f = fps || "25";
    if (!["24", "25", "48", "50"].includes(f)) {
      onFpsChange("25");
    }
    const r = resolution || "1080p";
    if (!["1080p", "1440p", "2160p"].includes(r)) {
      onResolutionChange("1080p");
    }
  }, [isLtx, tier, duration, aspectRatio, fps, resolution, onDurationChange, onAspectRatioChange, onFpsChange, onResolutionChange]);

  useEffect(() => {
    if (!isSeedance) return;
    const validDur = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    if (!validDur.includes(duration)) {
      onDurationChange(validDur.reduce((a, b) => Math.abs(b - duration) < Math.abs(a - duration) ? b : a));
    }
    const ar = aspectRatio || "";
    if (ar && ar !== "auto" && !["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"].includes(ar)) {
      onAspectRatioChange("16:9");
    }
    const r = resolution || "720p";
    if (version === "seedance-2-fast" || version === "seedance-2-fast-cli") {
      if (!["480p", "720p"].includes(r)) {
        onResolutionChange("720p");
      }
    } else if (!["480p", "720p", "1080p"].includes(r)) {
      onResolutionChange("720p");
    }
  }, [isSeedance, version, duration, aspectRatio, resolution, onDurationChange, onAspectRatioChange, onResolutionChange]);

  useEffect(() => {
    if (!isGrok) return;
    const validDur = [5, 10, 15];
    if (!validDur.includes(duration)) {
      onDurationChange(validDur.reduce((a, b) => Math.abs(b - duration) < Math.abs(a - duration) ? b : a));
    }
    const r = resolution || "720p";
    if (!["480p", "720p", "1080p"].includes(r)) {
      onResolutionChange("720p");
    }
  }, [isGrok, duration, resolution, onDurationChange, onResolutionChange]);

  useEffect(() => {
    if (!isWan) return;
    if (hasVideoRef && videoRefMode !== "imageRef") {
      onRefModeChange("imageRef");
    }
  }, [isWan, hasVideoRef, videoRefMode, onRefModeChange]);

  useEffect(() => {
    if (!isWan) return;
    const maxDur = hasVideoRef ? 10 : 15;
    const wanValid = Array.from({ length: maxDur - 1 }, (_, i) => i + 2);
    if (!wanValid.includes(duration)) {
      onDurationChange(wanValid.reduce((a, b) => Math.abs(b - duration) < Math.abs(a - duration) ? b : a));
    }
    const ar = aspectRatio || "";
    if (ar && ar !== "auto" && !["16:9", "9:16", "1:1", "4:3", "3:4"].includes(ar)) {
      onAspectRatioChange("16:9");
    }
    const r = resolution || "720p";
    if (!["720p", "1080p"].includes(r)) {
      onResolutionChange("720p");
    }
  }, [isWan, hasVideoRef, duration, aspectRatio, resolution, onDurationChange, onAspectRatioChange, onResolutionChange]);

  const ratioLabel = aspectRatio === "auto" || !aspectRatio ? t("adaptive") : aspectRatio;
  const maxRefs = isGrok ? 7 : isWan ? (videoRefMode === "startEnd" ? 2 : 5) : isLtx ? 2 : isSeedance2 ? (videoRefMode === "startEnd" ? 2 : 9) : isSeedance ? (videoRefMode === "startEnd" ? 2 : 1) : (videoRefMode === "startEnd" ? 2 : 5);
  const raw = referenceImages.slice(0, maxRefs);

  const orderedRefs = useMemo(() => {
    if (raw.length < 2 || !videoRefOrder?.length || videoRefOrder.length !== raw.length) return raw;
    return videoRefOrder.filter((i) => i < raw.length).map((i) => raw[i]);
  }, [raw, videoRefOrder]);

  const isStartEnd = videoRefMode === "startEnd";
  const frameTooltips = [t("firstFrameTooltip"), t("lastFrameTooltip")];

  const videoSortableItems = useMemo<SortableRefItem[]>(() => {
    const order = videoRefOrder?.length === raw.length ? videoRefOrder : raw.map((_, i) => i);
    return order.map((origIdx, dp) => ({
      id: `vimg-${origIdx}`,
      src: raw[origIdx],
      label: t("mentionImage", { n: dp + 1 }),
      originalIndex: origIdx,
    }));
  }, [raw, videoRefOrder]);

  const handleVideoSortReorder = useCallback((newOrder: number[]) => {
    onRefOrderChange(newOrder);
    if (promptJson) {
      const newPosOf = new Map<number, number>();
      for (let dp = 0; dp < newOrder.length; dp++) newPosOf.set(newOrder[dp], dp);
      const walkUpdate = (node: any): any => {
        if (node.type === "refMention" && node.attrs) {
          let origIdx = -1;
          if (imageNodes?.length) origIdx = imageNodes.findIndex((n) => n.nodeId === node.attrs.id);
          if (origIdx < 0 && typeof node.attrs.id === "string") {
            const m = node.attrs.id.match(/^image-(\d+)$/);
            if (m) origIdx = parseInt(m[1], 10);
          }
          if (origIdx >= 0 && newPosOf.has(origIdx)) {
            const newLabel = t("mentionImage", { n: newPosOf.get(origIdx)! + 1 });
            if (node.attrs.label !== newLabel) return { ...node, attrs: { ...node.attrs, label: newLabel } };
          }
        }
        if (node.content) return { ...node, content: node.content.map(walkUpdate) };
        return node;
      };
      const updatedJson = walkUpdate(JSON.parse(JSON.stringify(promptJson)));
      const newText = (updatedJson.content ?? [])
        .map((p: any) => (p.content ?? []).map((n: any) => (n.type === "text" ? n.text ?? "" : n.type === "refMention" ? `@${n.attrs?.label ?? ""}` : "")).join(""))
        .join("\n");
      onPromptChange(newText, updatedJson);
    }
  }, [raw, videoRefOrder, onRefOrderChange, promptJson, imageNodes, t, onPromptChange]);

  const handleSwapFrames = () => {
    if (orderedRefs.length !== 2) return;
    const cur = videoRefOrder?.length === raw.length ? [...videoRefOrder] : raw.map((_, i) => i);
    [cur[0], cur[1]] = [cur[1], cur[0]];
    onRefOrderChange(cur);
  };

  const handleThumbClick = useCallback((item: SortableRefItem) => {
    const handle = promptEditorRef.current;
    if (!handle) return;
    const refNode = imageNodes?.[item.originalIndex];
    handle.insertRefMention({
      id: refNode?.nodeId ?? `image-${item.originalIndex}`,
      label: item.label ?? "",
      thumbnailUrl: refNode?.thumbnailUrl ?? refNode?.url ?? item.src,
      refType: "image",
    });
  }, [imageNodes]);

  const handleVideoThumbClick = useCallback((url: string, index: number) => {
    const handle = promptEditorRef.current;
    if (!handle) return;
    const refNode = videoNodes?.[index];
    handle.insertRefMention({
      id: refNode?.nodeId ?? `video-${index}`,
      label: t("mentionVideo", { n: index + 1 }),
      thumbnailUrl: refNode?.thumbnailUrl ?? refNode?.url ?? url,
      refType: "video",
    });
  }, [videoNodes, t]);

  const handleAudioThumbClick = useCallback((url: string, index: number) => {
    const handle = promptEditorRef.current;
    if (!handle) return;
    const refNode = audioNodes?.[index];
    handle.insertRefMention({
      id: refNode?.nodeId ?? `audio-${index}`,
      label: t("mentionAudio", { n: index + 1 }),
      refType: "audio",
    });
  }, [audioNodes, t]);

  const handleImageRefThumbClick = useCallback((url: string, origIdx: number, displayIdx: number) => {
    const handle = promptEditorRef.current;
    if (!handle) return;
    const refNode = imageNodes?.[origIdx];
    handle.insertRefMention({
      id: refNode?.nodeId ?? `image-${origIdx}`,
      label: t("mentionImage", { n: displayIdx + 1 }),
      thumbnailUrl: refNode?.thumbnailUrl ?? refNode?.url ?? url,
      refType: "image",
    });
  }, [imageNodes, t]);

  const { suggestions: materialSuggestions, folderSuggestions } = useMaterials();

  const refSuggestions = useMemo<RefSuggestion[]>(() => {
    const items: RefSuggestion[] = [];
    if (videoNodes && videoNodes.length > 0) {
      videoNodes.forEach((n, i) => {
        items.push({ id: n.nodeId, label: t("mentionVideo", { n: i + 1 }), type: "video", thumbnailUrl: n.url });
      });
    } else {
      referenceVideos.forEach((url, i) => {
        items.push({ id: `video-${i}`, label: t("mentionVideo", { n: i + 1 }), type: "video", thumbnailUrl: url });
      });
    }
    const imgOrder = videoRefOrder?.length === raw.length ? videoRefOrder : raw.map((_, i) => i);
    if (imageNodes && imageNodes.length > 0) {
      for (let dp = 0; dp < imgOrder.length; dp++) {
        const origIdx = imgOrder[dp];
        const n = imageNodes[origIdx];
        if (!n) continue;
        items.push({ id: n.nodeId, label: t("mentionImage", { n: dp + 1 }), type: "image", thumbnailUrl: n.thumbnailUrl || n.url });
      }
    } else {
      for (let dp = 0; dp < imgOrder.length; dp++) {
        const origIdx = imgOrder[dp];
        const url = referenceImages[origIdx];
        if (!url) continue;
        items.push({ id: `image-${origIdx}`, label: t("mentionImage", { n: dp + 1 }), type: "image", thumbnailUrl: url });
      }
    }
    if (audioNodes && audioNodes.length > 0) {
      audioNodes.forEach((n, i) => {
        items.push({ id: n.nodeId, label: t("mentionAudio", { n: i + 1 }), type: "audio", thumbnailUrl: "" });
      });
    } else if (referenceAudios && referenceAudios.length > 0) {
      referenceAudios.forEach((url, i) => {
        items.push({ id: `audio-${i}`, label: t("mentionAudio", { n: i + 1 }), type: "audio", thumbnailUrl: "" });
      });
    }
    (connectedTextNodes ?? []).forEach((tn, idx) => {
      const preview = (tn.content || "").replace(/<[^>]*>/g, "").slice(0, 40);
      items.push({ id: `text-${tn.id}`, label: t("mentionText", { n: idx + 1 }), type: "text" as const, preview });
    });
    items.push(...materialSuggestions);
    return items;
  }, [referenceImages, referenceVideos, referenceAudios, imageNodes, videoNodes, audioNodes, connectedTextNodes, materialSuggestions, videoRefOrder, raw, t]);

  // Extract material refs from prompt JSON (@ mentions from material library)
  const materialRefs = useMemo(() => extractMaterialUrls(promptJson), [promptJson]);
  const matImageRefs = materialRefs.images;
  const matVideoRefs = materialRefs.videos;
  const matAudioRefs = materialRefs.audios;

  const hasAudioRef = (referenceAudios?.length ?? 0) > 0 || matAudioRefs.length > 0;
  const hasAnyImageRef = orderedRefs.length > 0 || matImageRefs.length > 0;
  const hasAnyVideoRef = hasVideoRef || matVideoRefs.length > 0;
  const seedance2OnlyImages = isSeedance2 && hasAnyImageRef && !hasAnyVideoRef && !hasAudioRef;
  const seedance2HasMediaRef = isSeedance2 && (hasAnyVideoRef || hasAudioRef);
  const seedance2TooManyImages = isSeedance2 && referenceImages.length > 2;

  const modeLabel = hasAnyVideoRef
    ? (isSeedance2 ? t("multimodalReference") : t("videoEditTab"))
    : hasAnyImageRef
      ? (isSeedance2 ? (videoRefMode === "startEnd" ? t("startEndFrame") : t("multimodalReference")) : t("imageToVideo"))
      : t("textToVideo");

  const tabsConfig = hasAnyVideoRef
    ? (isSeedance2
        ? [{ mode: "imageRef" as VideoRefMode, label: t("multimodalReference") }]
        : [
            { mode: "videoEdit" as VideoRefMode, label: t("videoEditTab") },
            { mode: "videoRef" as VideoRefMode, label: t("videoRefTab") },
          ])
    : isGrok
      ? [{ mode: "imageRef" as VideoRefMode, label: t("imageReference") }]
      : isLtx || isKling3
        ? [{ mode: "startEnd" as VideoRefMode, label: t("startEndFrame") }]
        : isSeedance2
          ? (seedance2HasMediaRef || seedance2TooManyImages
              ? [{ mode: "imageRef" as VideoRefMode, label: t("multimodalReference") }]
              : [
                  { mode: "startEnd" as VideoRefMode, label: t("startEndFrame") },
                  { mode: "imageRef" as VideoRefMode, label: t("multimodalReference") },
                ])
          : [
              { mode: "startEnd" as VideoRefMode, label: t("startEndFrame") },
              { mode: "imageRef" as VideoRefMode, label: t("imageReference") },
            ];

  const hasImageRef = hasAnyImageRef;
  const showModeTabs = (hasAnyVideoRef && !isSeedance2) || (isSeedance2 && (seedance2OnlyImages || seedance2HasMediaRef)) || (hasImageRef && !isGrok && !isLtx && !isKling3 && !isSeedance2);

  return (
    <PanelShell inverseZoom={inverseZoom} expanded={expanded} onExpand={() => setExpanded(true)} onCollapse={() => setExpanded(false)}>
      {/* ── Mode label + tabs + references ── */}
      <div className="flex-1 px-3 pt-3 pb-2 flex gap-2 items-center">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            {/* Dynamic mode label */}
            <button
              className="nodrag inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors h-8 rounded-md px-3 text-xs border border-zinc-200 dark:border-zinc-700/60 bg-zinc-100 dark:bg-zinc-800 shadow-sm text-zinc-800 dark:text-zinc-100"
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              <span>{modeLabel}</span>
            </button>

            {/* Ref mode sub-tabs (only when multiple modes available) */}
            {showModeTabs && (
              <>
                <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />
                {tabsConfig.map((tab) => (
                  <button
                    key={tab.mode}
                    className={`nodrag inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors h-8 rounded-md px-3 text-xs ${
                      effectiveMode === tab.mode 
                        ? "text-zinc-900 dark:text-white bg-zinc-800/[0.06] dark:bg-white/[0.06] font-semibold" 
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-800/[0.03] dark:hover:bg-white/[0.02]"
                    }`}
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onMouseDown={(e) => { e.preventDefault(); onRefModeChange(tab.mode); }}
                  >
                    <span>{tab.label}</span>
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Reference thumbnails */}
          <div className="flex items-center gap-2 nowheel nodrag">
            <div className="flex flex-wrap gap-1.5 nodrag items-center">
              <RefImageButton />

              {/* Video thumbnails (videoEdit / videoRef modes) */}
              {hasVideoRef && referenceVideos.length > 0 && (
                <>
                  <div className="w-px h-4 bg-white/10" />
                  {referenceVideos.map((url, i) => (
                    <RefThumb key={`vid-${i}`} src={url} isVideo label={t("mentionVideo", { n: i + 1 })} onRemove={() => onRemoveRef?.(url, "video")} onClick={() => handleVideoThumbClick(url, i)} />
                  ))}
                </>
              )}

              {/* Start/End frame strip (Tapnow style) */}
              {!hasVideoRef && isStartEnd && orderedRefs.length > 0 && (
                <>
                  <div className="w-px h-4 bg-white/10" />
                  <div className="flex items-center gap-1">
                    <RefThumb
                      key="startEnd-0"
                      src={orderedRefs[0]}
                      label={frameTooltips[0]}
                      onRemove={() => onRemoveRef?.(orderedRefs[0], "image")}
                      onClick={() => { const order = videoRefOrder?.length === raw.length ? videoRefOrder : raw.map((_, i) => i); handleImageRefThumbClick(orderedRefs[0], order[0], 0); }}
                    />

                    {orderedRefs.length === 2 && (
                      <button
                        type="button"
                        className="nodrag flex items-center justify-center shrink-0 rounded-sm p-1 transition-colors hover:bg-white/[0.12] cursor-pointer"
                        onPointerDownCapture={(e) => e.stopPropagation()}
                        onMouseDown={(e) => { e.preventDefault(); handleSwapFrames(); }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="size-4 text-white/40">
                          <path d="M10.5 2.85L13 5.35H3M5.5 13.1L3 10.6H13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}

                    {orderedRefs.length >= 2 && (
                      <RefThumb
                        key="startEnd-1"
                        src={orderedRefs[1]}
                        label={frameTooltips[1]}
                        onRemove={() => onRemoveRef?.(orderedRefs[1], "image")}
                        onClick={() => { const order = videoRefOrder?.length === raw.length ? videoRefOrder : raw.map((_, i) => i); handleImageRefThumbClick(orderedRefs[1], order[1], 1); }}
                      />
                    )}
                  </div>
                </>
              )}

              {/* Image reference thumbnails (non-startEnd modes) */}
              {!hasVideoRef && !isStartEnd && orderedRefs.length > 0 && (
                <>
                  <div className="w-px h-4 bg-white/10" />
                  <SortableRefRow
                    items={videoSortableItems}
                    onReorder={handleVideoSortReorder}
                    onRemove={onRemoveRef as ((src: string, type: "image" | "video" | "audio") => void) | undefined}
                    onThumbClick={handleThumbClick}
                  />
                </>
              )}

              {/* Additional image refs in video modes */}
              {hasVideoRef && referenceImages.length > 0 && (
                <>
                  <div className="w-px h-4 bg-white/10" />
                  {referenceImages.slice(0, 4).map((url, i) => (
                    <RefThumb key={`img-${i}`} src={url} label={t("mentionImage", { n: i + 1 })} onRemove={() => onRemoveRef?.(url, "image")} onClick={() => handleImageRefThumbClick(url, i, i)} />
                  ))}
                </>
              )}

              {/* Audio ref thumbnails */}
              {referenceAudios && referenceAudios.length > 0 && (
                <>
                  <div className="w-px h-4 bg-white/10" />
                  {referenceAudios.map((url, i) => (
                    <RefThumb key={`aud-${i}`} src={url} isAudio label={audioNodes?.[i]?.label || t("mentionAudio", { n: i + 1 })} onRemove={() => onRemoveRef?.(url, "audio")} onClick={() => handleAudioThumbClick(url, i)} />
                  ))}
                </>
              )}

              {/* Material @ ref thumbnails (from prompt mentions) */}
              {(matImageRefs.length > 0 || matVideoRefs.length > 0 || matAudioRefs.length > 0) && (
                <>
                  <div className="w-px h-4 bg-white/10" />
                  {matImageRefs.map((url, i) => (
                    <div key={`mat-img-${i}`} className="relative">
                      <RefThumb src={url} label={`素材 ${i + 1}`} />
                      <span className="absolute -top-1 -right-1 bg-violet-500 text-white text-[7px] px-1 rounded-full leading-3 font-medium">@</span>
                    </div>
                  ))}
                  {matVideoRefs.map((url, i) => (
                    <div key={`mat-vid-${i}`} className="relative">
                      <RefThumb src={url} isVideo label={`素材视频 ${i + 1}`} />
                      <span className="absolute -top-1 -right-1 bg-violet-500 text-white text-[7px] px-1 rounded-full leading-3 font-medium">@</span>
                    </div>
                  ))}
                  {matAudioRefs.map((url, i) => (
                    <div key={`mat-aud-${i}`} className="relative">
                      <RefThumb src={url} isAudio label={`素材音频 ${i + 1}`} />
                      <span className="absolute -top-1 -right-1 bg-violet-500 text-white text-[7px] px-1 rounded-full leading-3 font-medium">@</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Prompt editor ── */}
      <div className="relative flex justify-between flex-1 nodrag nowheel">
        <PromptEditor
          ref={promptEditorRef}
          content={prompt}
          contentJson={promptJson}
          onChange={onPromptChange}
          suggestions={(isLtx || (isSeedance && !isSeedance2)) ? [] : refSuggestions}
          materialFolders={(isLtx || (isSeedance && !isSeedance2)) ? [] : folderSuggestions}
          placeholder={t("promptPlaceholder")}
          style={{ minHeight: expanded ? 300 : 80, maxHeight: expanded ? "calc(80vh - 280px)" : 120 }}
        />
      </div>

      {/* ── Action bar ── */}
      <div className="flex items-center justify-between w-full p-2 h-14">
        <div className="flex items-center gap-1">
          {/* Model version dropdown (Kling 3.0 / Kling O3) */}
          <div className="relative" ref={modelPickerRef}>
            <button
              className={`nodrag flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-300 ${showModelPicker ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setShowModelPicker((v) => { if (!v) setShowSettings(false); return !v; }); }}
            >
              {isWan ? <WanIcon /> : isSeedance ? <SeedreamIcon /> : isGrok ? <GrokIcon /> : isLtx ? <LtxIcon /> : <KlingIcon />}
              <span className="whitespace-nowrap">{currentVersion.name}</span>
            </button>

            {showModelPicker && (
              <div
                ref={modelDropRef}
                className={`absolute ${modelFlipUp ? "bottom-full mb-2" : "top-full mt-2"} left-0 w-56 rounded-2xl border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-[#1a1a1a] shadow-xl p-1 z-50 nodrag nowheel`}
                onPointerDownCapture={(e) => e.stopPropagation()}
              >
                {[...VIDEO_VERSIONS].sort((a, b) => {
                  const icon = (v: typeof a) => v.icon as string;
                  const noV2V = (v: typeof a) => (icon(v) === "kling" && v.id !== "o3") || icon(v) === "ltx" || (icon(v) === "seedance" && v.id !== "seedance-2" && v.id !== "seedance-2-fast" && v.id !== "seedance-2-cli" && v.id !== "seedance-2-fast-cli");
                  const aOk = !(hasVideoRef && noV2V(a));
                  const bOk = !(hasVideoRef && noV2V(b));
                  if (aOk === bOk) return 0;
                  return aOk ? -1 : 1;
                }).map((v) => {
                  const ic = v.icon as string;
                  const noV2V = (ic === "kling" && v.id !== "o3") || ic === "ltx" || (ic === "seedance" && v.id !== "seedance-2" && v.id !== "seedance-2-fast" && v.id !== "seedance-2-cli" && v.id !== "seedance-2-fast-cli");
                  const disabled = hasVideoRef && noV2V;
                  const vIcon = ic === "wan" ? <WanIcon /> : ic === "seedance" ? <SeedreamIcon /> : ic === "grok" ? <GrokIcon /> : ic === "ltx" ? <LtxIcon /> : <KlingIcon />;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={disabled}
                      className={`nodrag w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
                        version === v.id ? "bg-zinc-100 dark:bg-white/[0.08] text-zinc-900 dark:text-white font-medium"
                          : disabled ? "text-zinc-400 dark:text-zinc-600 cursor-not-allowed opacity-40"
                          : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.04]"
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (disabled) return;
                        let newModelId: string;
                        if (v.id === "grok-video") newModelId = "grok-video";
                        else if (v.id === "wan-2.7-video") newModelId = "wan-2.7-video";
                        else if (v.id === "seedance") newModelId = "seedance";
                        else if (v.id === "seedance-2") newModelId = "seedance-2";
                        else if (v.id === "seedance-2-fast") newModelId = "seedance-2-fast";
                        else if (v.id === "seedance-2-cli") newModelId = "seedance-2-cli";
                        else if (v.id === "seedance-2-fast-cli") newModelId = "seedance-2-fast-cli";
                        else if (v.id === "ltx-2.3") newModelId = `ltx-2.3-${tier === "pro" ? "pro" : "fast"}`;
                        else newModelId = `kling-${v.id}-${tier === "fast" ? "standard" : tier}`;
                        onModelChange(newModelId);
                        if (ic === "ltx") {
                          const ltxValid = tier === "pro" ? [6, 8, 10] : [6, 8, 10, 12, 14, 16, 18, 20];
                          if (!ltxValid.includes(duration)) onDurationChange(6);
                          if (!["16:9", "9:16"].includes(aspectRatio || "")) onAspectRatioChange("16:9");
                        }
                        if (ic === "seedance") {
                          if (![4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].includes(duration)) onDurationChange(5);
                          if (!["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "auto"].includes(aspectRatio || "")) onAspectRatioChange("16:9");
                          const seedResValid = (v.id === "seedance-2" || v.id === "seedance-2-fast" || v.id === "seedance-2-cli" || v.id === "seedance-2-fast-cli") ? ["480p", "720p"] : ["480p", "720p", "1080p"];
                          if (!seedResValid.includes(resolution || "")) onResolutionChange("720p");
                        }
                        if (ic === "grok") {
                          if (![5, 10, 15].includes(duration)) onDurationChange(5);
                          if (!["480p", "720p", "1080p"].includes(resolution || "")) onResolutionChange("720p");
                        }
                        if (ic === "wan") {
                          if (duration < 2 || duration > 15) onDurationChange(5);
                          if (!["16:9", "9:16", "1:1", "4:3", "3:4", "auto"].includes(aspectRatio || "")) onAspectRatioChange("16:9");
                          if (!["720p", "1080p"].includes(resolution || "")) onResolutionChange("720p");
                        }
                        setShowModelPicker(false);
                      }}
                    >
                      {vIcon}
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{v.name}</span>
                        <span className="text-[11px] text-zinc-500">
                          {disabled ? t("videoEditOnly") : t(v.descKey)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700" />

          {/* Settings summary */}
          <div className="relative" ref={settingsRef}>
            <button
              className={`nodrag flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-300 ${showSettings ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setShowSettings((v) => { if (!v) setShowModelPicker(false); return !v; }); }}
            >
              {!isGrok && !isWan && !isSeedance && !isKling && <span>{tierLabel}</span>}
              {effectiveMode !== "videoEdit" && (
                <>
                  {!isGrok && !isWan && !isSeedance && !isKling && <span className="opacity-50">·</span>}
                  <Fullscreen size={16} />
                  <span>{ratioLabel} · {duration}s</span>
                  {(isGrok || isLtx || isWan || isSeedance || isKling) && <span className="opacity-50">·</span>}
                  {(isGrok || isLtx || isWan || isSeedance || isKling) && <span>{resolution || (isKling ? "720p" : isWan ? "720p" : isSeedance ? "720p" : isLtx ? "1080p" : "720p")}</span>}
                </>
              )}
              {!isGrok && !isWan && (
                <>
                  <span className="opacity-50">·</span>
                  <VideoVolumeIcon muted={!generateAudio} />
                </>
              )}
            </button>

            {showSettings && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40">
                <VideoSettingsPanel
                  tier={tier}
                  aspectRatio={aspectRatio || (isLtx ? "16:9" : "auto")}
                  duration={duration}
                  generateAudio={generateAudio}
                  isVideoEdit={effectiveMode === "videoEdit"}
                  isGrok={isGrok}
                  isLtx={isLtx}
                  isWan={isWan}
                  isSeedance={isSeedance}
                  isSeedance2={isSeedance2}
                  resolution={resolution || (isWan ? "720p" : isSeedance ? "720p" : isLtx ? "1080p" : "720p")}
                  fps={fps || "25"}
                  version={version}
                  onTierChange={(v) => {
                    if (isLtx) {
                      onModelChange(`ltx-2.3-${v}`);
                      if (v === "pro" && duration > 10) onDurationChange(10);
                    } else if (!isSeedance) {
                      onModelChange(`kling-${version}-${v}`);
                    }
                  }}
                  onAspectRatioChange={onAspectRatioChange}
                  onDurationChange={onDurationChange}
                  onAudioChange={onAudioChange}
                  onResolutionChange={(v) => {
                    onResolutionChange(v);
                    if (isLtx && tier === "fast" && v !== "1080p" && duration > 10) onDurationChange(10);
                    if (isKling) {
                      const newTier = v === "4k" ? "4k" : v === "1080p" ? "pro" : "standard";
                      onModelChange(`kling-${version}-${newTier}`);
                    }
                  }}
                />
              </div>
            )}
          </div>

          {!isGrok && !isWan && (
            <>
              <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700" />
              <button
                className="nodrag flex items-center justify-center rounded-lg px-2.5 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-white/[0.1] transition-colors"
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => { e.preventDefault(); setShowAdvanced(!showAdvanced); }}
              >
                <Settings2 size={16} className="text-zinc-500 dark:text-zinc-300" />
              </button>
            </>
          )}

          {/* Prompt Library Button */}
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700" />
          <div className="relative group/library" ref={promptLibraryRef}>
            <button
              className={`nodrag flex items-center justify-center h-9 w-9 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors ${
                showPromptLibrary ? "bg-zinc-100 dark:bg-zinc-800" : ""
              } text-zinc-600 dark:text-zinc-300`}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                setShowPromptLibrary((v) => {
                  if (!v) {
                    setShowSettings(false);
                    setShowAdvanced(false);
                    setShowPromptRewrite(false);
                  }
                  return !v;
                });
              }}
              title="提示词库"
            >
              <BookOpen size={16} className="opacity-60 text-zinc-400 dark:text-zinc-500" />
            </button>

            {showPromptLibrary && (
              <PromptLibraryPopover
                type="video"
                onSelect={(newPrompt) => onPromptChange(newPrompt, null)}
                onClose={() => setShowPromptLibrary(false)}
                flipUp={promptLibraryFlipUp}
                popoverRef={promptLibraryDropRef}
              />
            )}
          </div>

          {/* AI Rewrite Button */}
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700" />
          <div className="relative group/rewrite" ref={promptRewriteRef}>
            <button
              className={`nodrag flex items-center justify-center h-9 w-9 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors ${
                showPromptRewrite ? "bg-zinc-100 dark:bg-zinc-800" : ""
              } text-zinc-600 dark:text-zinc-300`}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                setShowPromptRewrite((v) => {
                  if (!v) {
                    setShowSettings(false);
                    setShowAdvanced(false);
                    setShowPromptLibrary(false);
                  }
                  return !v;
                });
              }}
              title="AI改写"
            >
              <Sparkles size={16} className="opacity-60 text-zinc-400 dark:text-zinc-500" />
            </button>

            {showPromptRewrite && (
              <PromptRewritePopover
                currentPrompt={prompt}
                onSuccess={(newPrompt) => onPromptChange(newPrompt, null)}
                onClose={() => setShowPromptRewrite(false)}
                flipUp={promptRewriteFlipUp}
                popoverRef={promptRewriteDropRef}
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <CreditsPill credits={String(discountedCredits)} originalCredits={discountPct > 0 ? String(credits) : undefined} onSend={() => { onGenerate?.(); setExpanded(false); }} disabled={isGenerating || !prompt.trim()} loading={isGenerating} />
        </div>
      </div>

      {/* ── Advanced settings panel (collapsible) ── */}
      {!isGrok && !isWan && (
        <div className={`nodrag overflow-hidden transition-all duration-300 ${showAdvanced ? (isLtx ? "max-h-40" : "max-h-20") : "max-h-0"}`}>
          <div className="px-4 py-3 bg-zinc-900/30 flex flex-col gap-3">
            {isLtx && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-zinc-300">{t("fps")}</span>
                <div className="flex gap-1">
                  {LTX_FPS_OPTIONS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      className={`nodrag px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        fps === f.value ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"
                      }`}
                      onPointerDownCapture={(e) => e.stopPropagation()}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onFpsChange(f.value);
                        if (isLtx && tier === "fast" && f.value !== "25" && duration > 10) onDurationChange(10);
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-between items-center text-sm">
              <span className="text-zinc-300">{t("generateAudio")}</span>
              <button
                type="button"
                role="switch"
                aria-checked={generateAudio}
                className={`peer nodrag inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                  generateAudio ? "bg-purple-500" : "bg-zinc-600"
                }`}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => { e.preventDefault(); onAudioChange(!generateAudio); }}
              >
                <span className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                  generateAudio ? "translate-x-4" : "translate-x-0"
                }`} />
              </button>
            </div>
          </div>
        </div>
      )}
    </PanelShell>
  );
}


