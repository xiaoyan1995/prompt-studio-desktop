"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import { useMaterials } from "@/hooks/use-materials";
import { usePricingPromo, useAllPricing, applyDiscount } from "@/hooks/use-pricing-promo";
import { useLocale, useTranslations } from "next-intl";
import { X, Settings2, Fullscreen, BookOpen, Sparkles } from "lucide-react";
import { extractMaterialUrls } from "@/lib/material-utils";
import { PromptEditor } from "../PromptEditor";
import type { PromptEditorHandle, RefSuggestion, ElementRef, SlashCommandItem } from "../PromptEditor";
import { SortableRefRow, type SortableRefItem } from "../SortableRefRow";
import { CameraControlPopover, cameraDisplayLabel, type CameraSettings } from "../CameraControl";
import { LightingPopover, lightingDisplayLabel, type LightingSettings } from "../LightingControl";
import { PromptLibraryPopover } from "../PromptLibraryPopover";
import { PromptRewritePopover } from "../PromptRewritePopover";
import {
  useClickOutside,
  useAutoFlip,
  PanelShell,
  CreditsPill,
  RefThumb,
  RefImageButton,
  ImageModelIcon,
  AspectRatioIcon,
  IMAGE_MODELS,
  IMAGE_MODEL_MAP,
  IMAGE_MODEL_MAX_REFS,
  DEFAULT_MAX_REFS,
  DEFAULT_MODEL,
  ASPECT_RATIOS,
  GROK_ONLY_RATIOS,
  QUALITY_OPTIONS,
  OUTPUT_QUALITY_OPTIONS,
  OUTPUT_QUALITY_MODELS,
  THINKING_LEVEL_OPTIONS,
  THINKING_LEVEL_MODELS,
  WEB_SEARCH_MODELS,
  IMAGE_SEARCH_MODELS,
  MODEL_QUALITY_PRICE,
} from "../panel-shared";

export function ImageGenPanel({
  prompt,
  promptJson,
  modelId,
  aspectRatio,
  imageSize,
  count,
  cameraSettings,
  lightingSettings,
  referenceImages,
  imageNodes,
  connectedTextNodes,
  onPromptChange,
  onModelChange,
  onAspectRatioChange,
  onImageSizeChange,
  onCountChange,
  onCameraChange,
  onLightingChange,
  onGenerate,
  isGenerating,
  inverseZoom,
  onFocusEdit,
  promptEditorRef,
  onElementsChange,
  onRemoveRef,
  imageRefOrder,
  onImageRefOrderChange,
  enablePro,
  onEnableProChange,
  negativePrompt,
  guidanceScale,
  numInferenceSteps,
  seed,
  onNegativePromptChange,
  onGuidanceScaleChange,
  onNumInferenceStepsChange,
  onSeedChange,
  outputQuality,
  onOutputQualityChange,
  thinkingLevel,
  onThinkingLevelChange,
  enableWebSearch,
  onEnableWebSearchChange,
  enableImageSearch,
  onEnableImageSearchChange,
}: {
  prompt: string;
  promptJson?: any;
  modelId: string;
  aspectRatio: string;
  imageSize: string;
  count: number;
  cameraSettings: CameraSettings | null;
  lightingSettings: LightingSettings | null;
  referenceImages: string[];
  imageNodes?: Array<{ nodeId: string; url: string; thumbnailUrl: string; label: string }>;
  connectedTextNodes: { id: string; label: string; content: string }[];
  onPromptChange: (v: string, json?: any) => void;
  onModelChange: (v: string) => void;
  onAspectRatioChange: (v: string) => void;
  onImageSizeChange: (v: string) => void;
  onCountChange: (v: number) => void;
  onCameraChange: (s: CameraSettings | null) => void;
  onLightingChange: (s: LightingSettings | null) => void;
  onGenerate?: () => void;
  onRemoveRef?: (url: string, type: "image" | "video") => void;
  isGenerating?: boolean;
  inverseZoom: number;
  onFocusEdit?: () => void;
  promptEditorRef?: React.Ref<PromptEditorHandle>;
  onElementsChange?: (elements: ElementRef[]) => void;
  imageRefOrder?: number[];
  onImageRefOrderChange?: (order: number[]) => void;
  enablePro?: boolean;
  onEnableProChange?: (v: boolean) => void;
  negativePrompt?: string;
  guidanceScale?: number;
  numInferenceSteps?: number;
  seed?: number;
  onNegativePromptChange?: (v: string) => void;
  onGuidanceScaleChange?: (v: number) => void;
  onNumInferenceStepsChange?: (v: number) => void;
  onSeedChange?: (v: number | undefined) => void;
  outputQuality?: string;
  onOutputQualityChange?: (v: string) => void;
  thinkingLevel?: string;
  onThinkingLevelChange?: (v: string) => void;
  enableWebSearch?: boolean;
  onEnableWebSearchChange?: (v: boolean) => void;
  enableImageSearch?: boolean;
  onEnableImageSearchChange?: (v: boolean) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAspectPicker, setShowAspectPicker] = useState(false);
  const [showCameraControl, setShowCameraControl] = useState(false);
  const [showLightingControl, setShowLightingControl] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showCountPicker, setShowCountPicker] = useState(false);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [showPromptRewrite, setShowPromptRewrite] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const aspectRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const lightingRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLDivElement>(null);
  const promptLibraryRef = useRef<HTMLDivElement>(null);
  const promptRewriteRef = useRef<HTMLDivElement>(null);
  useClickOutside(aspectRef, showAspectPicker, () => setShowAspectPicker(false));
  useClickOutside(cameraRef, showCameraControl, () => setShowCameraControl(false));
  useClickOutside(lightingRef, showLightingControl, () => setShowLightingControl(false));
  useClickOutside(modelRef, showModelPicker, () => setShowModelPicker(false));
  useClickOutside(countRef, showCountPicker, () => setShowCountPicker(false));
  useClickOutside(promptLibraryRef, showPromptLibrary, () => setShowPromptLibrary(false));
  useClickOutside(promptRewriteRef, showPromptRewrite, () => setShowPromptRewrite(false));
  const [modelFlipUp, modelDropRef] = useAutoFlip(modelRef, showModelPicker);
  const [aspectFlipUp, aspectDropRef] = useAutoFlip(aspectRef, showAspectPicker);
  const [cameraFlipUp, cameraDropRef] = useAutoFlip(cameraRef, showCameraControl);
  const [lightingFlipUp, lightingDropRef] = useAutoFlip(lightingRef, showLightingControl);
  const [promptLibraryFlipUp, promptLibraryDropRef] = useAutoFlip(promptLibraryRef, showPromptLibrary);
  const [promptRewriteFlipUp, promptRewriteDropRef] = useAutoFlip(promptRewriteRef, showPromptRewrite);
  const t = useTranslations("canvas");
  const locale = useLocale();
  const modelKey = modelId || "nano-banana-2";
  const modelLabel = IMAGE_MODEL_MAP[modelKey] || DEFAULT_MODEL["image-gen"];
  const isSeedream = modelKey.startsWith("doubao-seedream");
  const isGrokImagine = modelKey === "grok-imagine";
  const isZImage = modelKey === "z-image-turbo";
  const isGptImage2 = modelKey === "gpt-image-2" || modelKey === "gpt-image-2-lite";
  const isWan = modelKey === "wan-2.7";
  const supportsCameraControl = !isSeedream && !isGrokImagine && !isZImage && !isGptImage2 && !isWan;
  const LIGHTING_MODELS = new Set(["nano-banana-2", "nano-banana-pro", "doubao-seedream-5-0-260128"]);
  const supportsLighting = LIGHTING_MODELS.has(modelKey);
  const SEEDREAM_UNSUPPORTED_RATIOS = new Set(["5:4", "4:5"]);
  const GROK_HIDDEN_RATIOS = new Set(["1:1", "5:4", "4:5", "21:9"]);
  const availableRatios = isGrokImagine
    ? ASPECT_RATIOS.filter((r) => !GROK_HIDDEN_RATIOS.has(r.value))
    : isSeedream
      ? ASPECT_RATIOS.filter((r) => !SEEDREAM_UNSUPPORTED_RATIOS.has(r.value) && !GROK_ONLY_RATIOS.has(r.value))
      : ASPECT_RATIOS.filter((r) => !GROK_ONLY_RATIOS.has(r.value));
  const maxRefs = IMAGE_MODEL_MAX_REFS[modelKey] ?? DEFAULT_MAX_REFS;
  const rawRefs = referenceImages.slice(0, maxRefs);
  const visibleRefs = useMemo(() => {
    if (!imageRefOrder?.length || imageRefOrder.length !== rawRefs.length) return rawRefs;
    return imageRefOrder.filter((i) => i < rawRefs.length).map((i) => rawRefs[i]);
  }, [rawRefs, imageRefOrder]);

  const sortableItems = useMemo<SortableRefItem[]>(() => {
    const order = imageRefOrder?.length === rawRefs.length ? imageRefOrder : rawRefs.map((_, i) => i);
    return order.map((origIdx, dp) => ({
      id: `img-${origIdx}`,
      src: rawRefs[origIdx],
      label: t("mentionImage", { n: dp + 1 }),
      originalIndex: origIdx,
    }));
  }, [rawRefs, imageRefOrder, t]);

  const handleSortReorder = useCallback((newOrder: number[]) => {
    onImageRefOrderChange?.(newOrder);
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
  }, [imageRefOrder, rawRefs, onImageRefOrderChange, promptJson, imageNodes, t, onPromptChange]);

  const handleThumbClick = useCallback((item: SortableRefItem) => {
    const editorHandle = (promptEditorRef as React.RefObject<PromptEditorHandle | null>)?.current;
    if (!editorHandle) return;
    const refNode = imageNodes?.[item.originalIndex];
    editorHandle.insertRefMention({
      id: refNode?.nodeId ?? `image-${item.originalIndex}`,
      label: item.label ?? "",
      thumbnailUrl: refNode?.thumbnailUrl ?? refNode?.url ?? item.src,
      refType: "image",
    });
  }, [imageNodes, promptEditorRef]);
  const { suggestions: materialSuggestions, folderSuggestions } = useMaterials();

  // Extract material refs from prompt JSON (@ mentions from material library)
  const materialRefs = useMemo(() => extractMaterialUrls(promptJson), [promptJson]);
  const matImageRefs = materialRefs.images;

  const imgSuggestions = useMemo<RefSuggestion[]>(() => {
    const items: RefSuggestion[] = [];
    const order = imageRefOrder?.length === rawRefs.length ? imageRefOrder : rawRefs.map((_, i) => i);
    if (imageNodes?.length) {
      for (let dp = 0; dp < order.length; dp++) {
        const origIdx = order[dp];
        const n = imageNodes[origIdx];
        if (!n) continue;
        items.push({ id: n.nodeId, label: t("mentionImage", { n: dp + 1 }), type: "image" as const, thumbnailUrl: n.thumbnailUrl || n.url });
      }
    } else {
      for (let dp = 0; dp < order.length; dp++) {
        const origIdx = order[dp];
        const url = referenceImages[origIdx];
        if (!url) continue;
        items.push({ id: `image-${origIdx}`, label: t("mentionImage", { n: dp + 1 }), type: "image" as const, thumbnailUrl: url });
      }
    }
    connectedTextNodes.forEach((tn, idx) => {
      const preview = (tn.content || "").replace(/<[^>]*>/g, "").slice(0, 40);
      items.push({ id: `text-${tn.id}`, label: t("mentionText", { n: idx + 1 }), type: "text" as const, preview });
    });
    items.push(...materialSuggestions);
    return items;
  }, [referenceImages, imageNodes, connectedTextNodes, materialSuggestions, imageRefOrder, rawRefs, t]);

  const hasImageRefs = referenceImages.length > 0;
  const slashCommands = useMemo<SlashCommandItem[]>(() => [
    {
      id: "multi-cam-grid",
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 10l4.553 -2.276a1 1 0 0 1 1.447 .894v6.764a1 1 0 0 1 -1.447 .894l-4.553 -2.276v-4z"/><path d="M3 6m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z"/></svg>,
      name: t("slashCmdMultiCamGrid"),
      description: t("slashCmdMultiCamGridDesc"),
      promptTemplate: t("slashCmdMultiCamGridPrompt"),
      disabled: !hasImageRefs,
    },
    {
      id: "cinematic-lighting",
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M12 5l0 -2"/><path d="M17 7l1.4 -1.4"/><path d="M19 12l2 0"/><path d="M17 17l1.4 1.4"/><path d="M12 19l0 2"/><path d="M7 17l-1.4 1.4"/><path d="M6 12l-2 0"/><path d="M7 7l-1.4 -1.4"/></svg>,
      name: t("slashCmdCinematicLighting"),
      description: t("slashCmdCinematicLightingDesc"),
      promptTemplate: t("slashCmdCinematicLightingPrompt"),
      disabled: !hasImageRefs,
    },
    {
      id: "char-tri-view",
      icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 16v5"/><path d="M14 16v5"/><path d="M9 9h6l-1 7h-4z"/><path d="M5 11c1.333 -1.333 2.667 -2 4 -2"/><path d="M19 11c-1.333 -1.333 -2.667 -2 -4 -2"/><path d="M12 4m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/></svg>,
      name: t("slashCmdCharTriView"),
      description: t("slashCmdCharTriViewDesc"),
      promptTemplate: t("slashCmdCharTriViewPrompt"),
      disabled: !hasImageRefs,
    },
  ], [hasImageRefs, t]);

  const hasRefs = referenceImages.length > 0 || matImageRefs.length > 0;
  const { getQualityPrices, getI2iPrices, getOutputQualityPrices } = useAllPricing();
  const basePriceMap = getQualityPrices(modelKey) ?? MODEL_QUALITY_PRICE[modelKey] ?? MODEL_QUALITY_PRICE["nano-banana-2"];
  const i2iPriceMap = getI2iPrices(modelKey);
  const priceMap = (hasRefs && i2iPriceMap) ? i2iPriceMap : basePriceMap;
  const availableQualities = QUALITY_OPTIONS.filter((q) => q in basePriceMap);
  const quality = basePriceMap[imageSize] ? imageSize : availableQualities[0] ?? "2K";
  const oqMap = getOutputQualityPrices(modelKey);
  const defaultOQ = "high";
  const baseCredits = oqMap?.[quality]?.[outputQuality ?? defaultOQ] ?? priceMap[quality] ?? basePriceMap[quality] ?? 0;
  const hasSearch = (enableWebSearch && WEB_SEARCH_MODELS.has(modelKey)) || (enableImageSearch && IMAGE_SEARCH_MODELS.has(modelKey));
  const searchSurcharge = hasSearch ? Math.ceil(baseCredits * 0.10) : 0;
  const credits = baseCredits + searchSurcharge;
  const { discountPct } = usePricingPromo(modelKey);
  const discountedCredits = applyDiscount(credits, discountPct);
  const isAuto = aspectRatio === "auto"
    || (isSeedream && SEEDREAM_UNSUPPORTED_RATIOS.has(aspectRatio))
    || (isGrokImagine && GROK_HIDDEN_RATIOS.has(aspectRatio))
    || (!isGrokImagine && GROK_ONLY_RATIOS.has(aspectRatio));
  const currentRatio = ASPECT_RATIOS.find((r) => r.value === aspectRatio) || ASPECT_RATIOS[0];
  const ratioLabel = isAuto ? `${t("adaptive")} · ${quality}` : `${currentRatio.label} · ${quality}`;

  return (
    <PanelShell inverseZoom={inverseZoom} expanded={expanded} onExpand={() => setExpanded(true)} onCollapse={() => setExpanded(false)}>
      {/* ── Reference images row ── */}
      <div className="flex-1 px-3 pt-3 pb-2 flex gap-2 items-center overflow-x-auto nowheel nodrag">
        <div className="flex items-center gap-2">
          <div className="flex flex-wrap gap-1.5 nodrag items-center">
            <RefImageButton onClick={onFocusEdit} />
            {(visibleRefs.length > 0 || matImageRefs.length > 0) && (
              <>
                <div className="w-px h-4 bg-white/10" />
                <SortableRefRow
                  items={sortableItems}
                  onReorder={handleSortReorder}
                  onRemove={onRemoveRef as ((src: string, type: "image" | "video" | "audio") => void) | undefined}
                  onThumbClick={handleThumbClick}
                />
                {matImageRefs.map((url, i) => (
                  <div key={`mat-img-${i}`} className="relative">
                    <RefThumb src={url} label={`素材 ${i + 1}`} />
                    <span className="absolute -top-1 -right-1 bg-violet-500 text-white text-[7px] px-1 rounded-full leading-3 font-medium">@</span>
                  </div>
                ))}
                <span className="text-[11px] text-zinc-500 ml-0.5 shrink-0">{visibleRefs.length + matImageRefs.length}/{maxRefs}</span>
              </>
            )}
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
          onElementsChange={onElementsChange}
          suggestions={imgSuggestions}
          materialFolders={folderSuggestions}
          slashCommands={slashCommands}
          disabledHint={hasImageRefs ? undefined : t("slashCmdRequiresImage")}
          placeholder={connectedTextNodes.length > 0 ? t("promptPlaceholderWithText") : t("promptPlaceholder")}
          style={{ minHeight: expanded ? 300 : 104, maxHeight: expanded ? "calc(80vh - 200px)" : 156 }}
          maxLength={isSeedream ? 3000 : undefined}
        />
      </div>

      {/* ── Action bar ── */}
      <div className="flex items-center justify-between w-full p-2 h-14">
        {/* Left controls */}
        <div className="flex items-center gap-1">
          {/* Model selector */}
          <div className="relative" ref={modelRef}>
            <button
              className={`nodrag flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-300 ${showModelPicker ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setShowModelPicker((v) => { if (!v) { setShowAspectPicker(false); setShowCameraControl(false); setShowLightingControl(false); setShowAdvanced(false); setShowCountPicker(false); } return !v; }); }}
            >
              <ImageModelIcon modelId={modelKey} />
              <span className="whitespace-nowrap capitalize">{modelLabel}</span>
            </button>

            {showModelPicker && (
              <div
                ref={modelDropRef}
                className={`absolute ${modelFlipUp ? "bottom-full mb-2" : "top-full mt-2"} left-0 w-80 rounded-2xl border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-[#1a1a1a] shadow-xl p-1 z-50 nodrag nowheel max-h-[330px] overflow-y-auto`}
                onPointerDownCapture={(e) => e.stopPropagation()}
              >
                {IMAGE_MODELS.map((m) => {
                  const isDisabled = false;
                  return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={isDisabled}
                    className={`nodrag w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
                      isDisabled ? "opacity-40 cursor-not-allowed" : modelKey === m.id ? "bg-zinc-100 dark:bg-white/[0.08] text-zinc-900 dark:text-white font-medium" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/[0.04]"
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (isDisabled) return;
                      onModelChange(m.id);
                      if (m.id.startsWith("doubao-seedream")) {
                        if (cameraSettings) onCameraChange(null);
                        if (SEEDREAM_UNSUPPORTED_RATIOS.has(aspectRatio) || GROK_ONLY_RATIOS.has(aspectRatio))
                          onAspectRatioChange("auto");
                      } else if (m.id === "grok-imagine") {
                        if (cameraSettings) onCameraChange(null);
                        if (lightingSettings) onLightingChange(null);
                        if (GROK_HIDDEN_RATIOS.has(aspectRatio)) onAspectRatioChange("auto");
                      } else if (m.id === "z-image-turbo") {
                        if (cameraSettings) onCameraChange(null);
                        if (lightingSettings) onLightingChange(null);
                        if (GROK_ONLY_RATIOS.has(aspectRatio)) onAspectRatioChange("auto");
                      } else if (m.id === "gpt-image-2" || m.id === "gpt-image-2-lite") {
                        if (cameraSettings) onCameraChange(null);
                        if (lightingSettings) onLightingChange(null);
                        if (GROK_ONLY_RATIOS.has(aspectRatio)) onAspectRatioChange("auto");
                      } else {
                        if (GROK_ONLY_RATIOS.has(aspectRatio)) onAspectRatioChange("auto");
                      }
                      const newPriceMap = getQualityPrices(m.id) ?? MODEL_QUALITY_PRICE[m.id];
                      if (newPriceMap && imageSize && !newPriceMap[imageSize]) {
                        onImageSizeChange(Object.keys(newPriceMap)[0]);
                      }
                      setShowModelPicker(false);
                    }}
                  >
                    <ImageModelIcon modelId={m.id} />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{m.name}</span>
                      <span className="text-[11px] text-zinc-500">{t(m.descKey)}</span>
                    </div>
                  </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-zinc-700" />

          {/* Aspect ratio + quality popover trigger */}
          <div className="relative" ref={aspectRef}>
            <button
              className={`nodrag flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-300 ${showAspectPicker ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setShowAspectPicker((v) => { if (!v) { setShowModelPicker(false); setShowCameraControl(false); setShowLightingControl(false); setShowAdvanced(false); setShowCountPicker(false); } return !v; }); }}
            >
              {isAuto ? <Fullscreen size={16} /> : <AspectRatioIcon w={currentRatio.w} h={currentRatio.h} />}
              <span>{ratioLabel}</span>
            </button>

            {/* ── Aspect + Quality Popover ── */}
            {showAspectPicker && (
              <div
                ref={aspectDropRef}
                className={`absolute ${aspectFlipUp ? "bottom-full mb-2" : "top-full mt-2"} left-0 w-[380px] rounded-[20px] border border-zinc-700/60 p-1.5 z-50 nodrag nowheel`}
                style={{ background: "#1c1c1c" }}
                onPointerDownCapture={(e) => e.stopPropagation()}
              >
                {/* 生成模式 (Generation Mode) — Grok Imagine only */}
                {isGrokImagine && (
                  <div className="p-2 flex flex-col gap-1.5">
                    <div className="text-xs font-medium text-zinc-500 px-1">{t("generationMode")}</div>
                    <div className="relative flex bg-white/[0.06] rounded-lg p-0.5">
                      {([false, true] as const).map((pro) => (
                        <button
                          key={pro ? "pro" : "std"}
                          type="button"
                          className={`nodrag relative z-10 flex-1 px-2 py-1.5 rounded-md text-sm transition-colors duration-200 ${
                            (enablePro ?? false) === pro ? "text-white bg-white/[0.08]" : "text-zinc-500 hover:text-zinc-200"
                          }`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            onEnableProChange?.(pro);
                          }}
                        >
                          {pro ? t("modePro") : t("modeStandard")}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 画质 (Quality) */}
                <div className="p-2 flex flex-col gap-1.5">
                  <div className="text-xs font-medium text-zinc-500 px-1">{t("quality")}</div>
                  <div className="relative flex bg-white/[0.06] rounded-lg p-0.5">
                    {availableQualities.map((q) => (
                      <button
                        key={q}
                        type="button"
                        className={`nodrag relative z-10 flex-1 px-2 py-1.5 rounded-md text-sm transition-colors duration-200 ${
                          quality === q ? "text-white bg-white/[0.08]" : "text-zinc-500 hover:text-zinc-200"
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onImageSizeChange(q);
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 精细度 (Output Quality) — AtlasCloud GPT Image 2 only */}
                {OUTPUT_QUALITY_MODELS.has(modelKey) && (
                  <div className="p-2 flex flex-col gap-1.5">
                    <div className="text-xs font-medium text-zinc-500 px-1">{t("outputQuality")}</div>
                    <div className="relative flex bg-white/[0.06] rounded-lg p-0.5">
                      {OUTPUT_QUALITY_OPTIONS.map((oq) => (
                        <button
                          key={oq}
                          type="button"
                          className={`nodrag relative z-10 flex-1 px-2 py-1.5 rounded-md text-sm transition-colors duration-200 ${
                            (outputQuality ?? "high") === oq ? "text-white bg-white/[0.08]" : "text-zinc-500 hover:text-zinc-200"
                          }`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            onOutputQualityChange?.(oq);
                          }}
                        >
                          {t(`outputQuality_${oq}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 比例 (Ratio) */}
                <div className="p-2 flex flex-col gap-1.5">
                  <div className="text-xs font-medium text-zinc-500 px-1">
                    {t("aspectRatio")}
                  </div>
                  <div className="relative flex gap-1.5 bg-white/[0.06] rounded-lg p-1">
                    {/* 自适应 (Auto) */}
                    <button
                      type="button"
                      className={`nodrag relative z-10 flex flex-col items-center justify-center rounded-md transition-colors duration-200 w-14 py-2 gap-1 ${
                        isAuto ? "text-white bg-white/[0.1]" : "text-zinc-500 hover:text-zinc-200"
                      }`}
                      onMouseDown={(e) => { e.preventDefault(); onAspectRatioChange("auto"); }}
                    >
                      <Fullscreen size={20} />
                      <span className="text-xs">{t("adaptive")}</span>
                    </button>

                    {/* Ratio grid */}
                    <div className="grid gap-1 flex-1" style={{ gridTemplateColumns: `repeat(${availableRatios.length <= 8 ? 4 : 5}, 1fr)` }}>
                      {availableRatios.map((r) => {
                        const iconMax = 14;
                        const ratio = r.w / r.h;
                        const iW = ratio >= 1 ? iconMax : Math.round(iconMax * ratio);
                        const iH = ratio >= 1 ? Math.round(iconMax / ratio) : iconMax;
                        return (
                          <button
                            key={r.value}
                            type="button"
                            className={`nodrag relative z-10 flex flex-col items-center justify-center rounded-md transition-colors duration-200 py-1.5 gap-0.5 ${
                              r.value === aspectRatio && !isAuto ? "text-white bg-white/[0.1]" : "text-zinc-500 hover:text-zinc-200"
                            }`}
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
                </div>

                {/* 思考时间 (Thinking Level) — Nano Banana only */}
                {THINKING_LEVEL_MODELS.has(modelKey) && (
                  <div className="p-2 flex flex-col gap-1.5">
                    <div className="text-xs font-medium text-zinc-500 px-1">{t("thinkingLevel")}</div>
                    <div className="relative flex bg-white/[0.06] rounded-lg p-0.5">
                      {THINKING_LEVEL_OPTIONS.map((tl) => (
                        <button
                          key={tl}
                          type="button"
                          className={`nodrag relative z-10 flex-1 px-2 py-1.5 rounded-md text-sm transition-colors duration-200 ${
                            (thinkingLevel ?? "minimal") === tl ? "text-white bg-white/[0.08]" : "text-zinc-500 hover:text-zinc-200"
                          }`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            onThinkingLevelChange?.(tl);
                          }}
                        >
                          {t(`thinkingLevel_${tl}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 搜索 (Search) — Nano Banana only */}
                {WEB_SEARCH_MODELS.has(modelKey) && (
                  <div className="p-2 flex flex-col gap-1.5">
                    <div className="text-xs font-medium text-zinc-500 px-1">{t("search")}</div>
                    <div className="relative flex gap-2">
                      <button
                        type="button"
                        className={`nodrag relative z-10 flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors duration-200 ${
                          enableWebSearch ? "text-white bg-white/[0.08] ring-1 ring-white/20" : "text-zinc-500 hover:text-zinc-200 bg-white/[0.04]"
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onEnableWebSearchChange?.(!enableWebSearch);
                        }}
                      >
                        <span className={`w-3 h-3 rounded-full border ${enableWebSearch ? "border-white bg-white" : "border-zinc-500"} flex items-center justify-center`}>
                          {enableWebSearch && <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />}
                        </span>
                        {t("webSearch")}
                      </button>
                      {IMAGE_SEARCH_MODELS.has(modelKey) && (
                        <button
                          type="button"
                          className={`nodrag relative z-10 flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors duration-200 ${
                            enableImageSearch ? "text-white bg-white/[0.08] ring-1 ring-white/20" : "text-zinc-500 hover:text-zinc-200 bg-white/[0.04]"
                          }`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            onEnableImageSearchChange?.(!enableImageSearch);
                          }}
                        >
                          <span className={`w-3 h-3 rounded-full border ${enableImageSearch ? "border-white bg-white" : "border-zinc-500"} flex items-center justify-center`}>
                            {enableImageSearch && <span className="w-1.5 h-1.5 rounded-full bg-zinc-900" />}
                          </span>
                          {t("imageSearch")}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {supportsCameraControl && (
            <>
              <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700" />

              {/* Camera control */}
              <div className="relative group/camera" ref={cameraRef}>
                <button
                  className={`nodrag flex items-center h-9 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors ${
                    showCameraControl ? "bg-zinc-100 dark:bg-zinc-800" : ""
                  } ${cameraSettings ? "text-lime-600 dark:text-[#CCFF00]" : "text-zinc-600 dark:text-zinc-300"}`}
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  onMouseDown={(e) => { e.preventDefault(); setShowCameraControl((v) => { if (!v) { setShowModelPicker(false); setShowAspectPicker(false); setShowLightingControl(false); setShowAdvanced(false); setShowCountPicker(false); } return !v; }); }}
                >
                  <div className="flex items-center justify-center w-7 h-7 m-0.5 rounded-md">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={cameraSettings ? "opacity-100 text-lime-600 dark:text-[#CCFF00]" : "opacity-60 text-zinc-400 dark:text-zinc-500"}>
                      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium whitespace-nowrap pr-2 max-w-[100px] truncate">
                    {cameraSettings ? cameraDisplayLabel(cameraSettings) : t("cameraControl")}
                  </span>
                </button>

                {cameraSettings && (
                  <button
                    type="button"
                    className="nodrag absolute -top-1 -right-1 w-4 h-4 bg-black rounded-full flex items-center justify-center opacity-0 group-hover/camera:opacity-100 transition-opacity border border-zinc-600"
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onCameraChange(null);
                      setShowCameraControl(false);
                    }}
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                )}

                {showCameraControl && (
                  <CameraControlPopover
                    settings={cameraSettings ?? undefined}
                    onChange={onCameraChange}
                    onClose={() => setShowCameraControl(false)}
                    flipUp={cameraFlipUp}
                    popoverRef={cameraDropRef}
                  />
                )}
              </div>
            </>
          )}

          {supportsLighting && (
            <>
              <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700" />

              {/* Lighting control */}
              <div className="relative group/lighting" ref={lightingRef}>
                <button
                  className={`nodrag flex items-center h-9 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors ${
                    showLightingControl ? "bg-zinc-100 dark:bg-zinc-800" : ""
                  } ${lightingSettings ? "text-lime-600 dark:text-[#CCFF00]" : "text-zinc-600 dark:text-zinc-300"}`}
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  onMouseDown={(e) => { e.preventDefault(); setShowLightingControl((v) => { if (!v) { setShowModelPicker(false); setShowAspectPicker(false); setShowCameraControl(false); setShowAdvanced(false); setShowCountPicker(false); } return !v; }); }}
                >
                  <div className="flex items-center justify-center w-7 h-7 m-0.5 rounded-md">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={lightingSettings ? "opacity-100 text-lime-600 dark:text-[#CCFF00]" : "opacity-60 text-zinc-400 dark:text-zinc-500"}>
                      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M10 2.5v2.5M10 15v2.5M2.5 10H5M15 10h2.5M5.05 5.05l1.77 1.77M13.18 13.18l1.77 1.77M14.95 5.05l-1.77 1.77M6.82 13.18l-1.77 1.77" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <span className="text-sm font-medium whitespace-nowrap pr-2 max-w-[120px] truncate">
                    {lightingSettings ? lightingDisplayLabel(lightingSettings, locale) : t("lighting")}
                  </span>
                </button>

                {lightingSettings && (
                  <button
                    type="button"
                    className="nodrag absolute -top-1 -right-1 w-4 h-4 bg-black rounded-full flex items-center justify-center opacity-0 group-hover/lighting:opacity-100 transition-opacity border border-zinc-600"
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onLightingChange(null);
                      setShowLightingControl(false);
                    }}
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                )}

                {showLightingControl && (
                  <LightingPopover
                    settings={lightingSettings ?? undefined}
                    onChange={onLightingChange}
                    onClose={() => setShowLightingControl(false)}
                    flipUp={lightingFlipUp}
                    popoverRef={lightingDropRef}
                  />
                )}
              </div>
            </>
          )}

          {isZImage && (
            <>
              <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700" />

              {/* Advanced settings toggle */}
              <button
                className="nodrag flex items-center justify-center rounded-lg px-2.5 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-white/[0.1] transition-colors"
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => { e.preventDefault(); setShowAdvanced((v) => { if (!v) { setShowModelPicker(false); setShowAspectPicker(false); setShowCameraControl(false); setShowLightingControl(false); setShowCountPicker(false); } return !v; }); }}
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
                    setShowModelPicker(false);
                    setShowAspectPicker(false);
                    setShowCameraControl(false);
                    setShowLightingControl(false);
                    setShowAdvanced(false);
                    setShowCountPicker(false);
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
                type="image"
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
                    setShowModelPicker(false);
                    setShowAspectPicker(false);
                    setShowCameraControl(false);
                    setShowLightingControl(false);
                    setShowAdvanced(false);
                    setShowCountPicker(false);
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

        {/* Right controls */}
        <div className="flex items-center gap-1">
          <div ref={countRef} className="relative">
            <button
              className={`nodrag flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium transition ${showCountPicker ? "bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-white" : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-white/[0.1]"}`}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setShowCountPicker((v) => { if (!v) { setShowModelPicker(false); setShowAspectPicker(false); setShowCameraControl(false); setShowLightingControl(false); setShowAdvanced(false); } return !v; }); }}
            >
              <span>{count}×</span>
            </button>
            {showCountPicker && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-1.5 bg-white dark:bg-zinc-900/95 backdrop-blur-sm rounded-xl border border-zinc-200 dark:border-white/10 shadow-2xl flex flex-col gap-1 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-150">
                {[4, 2, 1].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`nodrag px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${n === count ? "bg-zinc-100 dark:bg-white/10 text-zinc-800 dark:text-white" : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white"}`}
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onMouseDown={(e) => { e.preventDefault(); onCountChange(n); setShowCountPicker(false); }}
                  >
                    {n}×
                  </button>
                ))}
              </div>
            )}
          </div>
          <CreditsPill credits={String(count > 1 ? discountedCredits * count : discountedCredits || "—")} originalCredits={discountPct > 0 ? String(count > 1 ? credits * count : credits) : undefined} onSend={() => { onGenerate?.(); setExpanded(false); }} disabled={isGenerating || !prompt.trim()} loading={isGenerating} />
        </div>
      </div>

      {/* ── Advanced settings panel (collapsible) ── */}
      <div className={`nodrag nowheel overflow-hidden transition-all duration-300 ${showAdvanced ? (isZImage ? "max-h-80" : "max-h-32") : "max-h-0"}`}>
        <div className="p-3 bg-zinc-900/30 flex flex-col gap-3">
          {isZImage ? (
            <>
              {/* Negative prompt */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-zinc-400">{t("negativePrompt")}</label>
                <textarea
                  value={negativePrompt ?? ""}
                  onChange={(e) => onNegativePromptChange?.(e.target.value)}
                  placeholder={t("negativePromptPlaceholder")}
                  className="w-full h-16 px-2.5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/20 resize-none transition-colors"
                  onPointerDownCapture={(e) => e.stopPropagation()}
                />
              </div>
              {/* Steps slider + Seed */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-zinc-500">{t("inferenceSteps")}</label>
                  <span className="text-[11px] text-zinc-400 tabular-nums">{numInferenceSteps ?? 8}</span>
                </div>
                <input
                  type="range"
                  min={1} max={8} step={1}
                  value={numInferenceSteps ?? 8}
                  onChange={(e) => onNumInferenceStepsChange?.(parseInt(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#CCFF00] bg-white/10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#CCFF00] [&::-webkit-slider-thumb]:shadow-md"
                  onPointerDownCapture={(e) => e.stopPropagation()}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-zinc-500">{t("seed")}</label>
                <input
                  type="number"
                  min={0}
                  value={seed ?? ""}
                  onChange={(e) => onSeedChange?.(e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder={t("random")}
                  className="w-full h-8 px-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder:text-zinc-600 outline-none focus:border-white/20 tabular-nums transition-colors"
                  onPointerDownCapture={(e) => e.stopPropagation()}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </PanelShell>
  );
}
