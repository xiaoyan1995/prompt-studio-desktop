"use client";

import { useState, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { usePricingPromo, useAllPricing, applyDiscount } from "@/hooks/use-pricing-promo";
import { Fullscreen, Grid2x2, Layers } from "lucide-react";
import {
  useClickOutside,
  useAutoFlip,
  PanelShell,
  CreditsPill,
  ImageModelIcon,
  AspectRatioIcon,
  IMAGE_MODELS,
  IMAGE_MODEL_MAP,
  ASPECT_RATIOS,
  GROK_ONLY_RATIOS,
  QUALITY_OPTIONS,
  MODEL_QUALITY_PRICE,
  OUTPUT_QUALITY_OPTIONS,
  OUTPUT_QUALITY_MODELS,
} from "../../panel-shared";

const STORYBOARD_MODELS = new Set(["nano-banana-2", "nano-banana-pro", "gpt-image-2", "gpt-image-2-lite", "doubao-seedream-4-5-251128", "doubao-seedream-5-0-260128"]);

export type StoryboardOutputMode = "individual" | "grid";

interface StoryboardGenPanelProps {
  selectedCount: number;
  modelId: string;
  onModelChange: (id: string) => void;
  aspectRatio: string;
  onAspectRatioChange: (ratio: string) => void;
  imageSize: string;
  onImageSizeChange: (size: string) => void;
  outputQuality: string | null;
  onOutputQualityChange: (q: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  inverseZoom: number;
  outputMode: StoryboardOutputMode;
  onOutputModeChange: (mode: StoryboardOutputMode) => void;
}

export function StoryboardGenPanel({
  selectedCount,
  modelId,
  onModelChange,
  aspectRatio,
  onAspectRatioChange,
  imageSize,
  onImageSizeChange,
  outputQuality,
  onOutputQualityChange,
  onGenerate,
  isGenerating,
  inverseZoom,
  outputMode,
  onOutputModeChange,
}: StoryboardGenPanelProps) {
  const t = useTranslations("canvas");
  const [modelOpen, setModelOpen] = useState(false);
  const [ratioOpen, setRatioOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef<HTMLDivElement>(null);

  useClickOutside(modelRef, modelOpen, () => setModelOpen(false));
  useClickOutside(ratioRef, ratioOpen, () => setRatioOpen(false));
  const [modelFlipUp, modelDropRef] = useAutoFlip(modelRef, modelOpen);
  const [ratioFlipUp, ratioDropRef] = useAutoFlip(ratioRef, ratioOpen);

  const modelKey = modelId || "nano-banana-2";
  const modelLabel = IMAGE_MODEL_MAP[modelKey] || "Nano Banana 2";

  const availableRatios = useMemo(
    () => ASPECT_RATIOS.filter((r) => !GROK_ONLY_RATIOS.has(r.value)),
    [],
  );

  const { getQualityPrices, getOutputQualityPrices } = useAllPricing();
  const priceMap = getQualityPrices(modelKey) ?? MODEL_QUALITY_PRICE[modelKey] ?? MODEL_QUALITY_PRICE["nano-banana-2"];
  const availableQualities = QUALITY_OPTIONS.filter((q) => q in priceMap);
  const quality = priceMap[imageSize] ? imageSize : availableQualities[0] ?? "2K";
  const oqMap = getOutputQualityPrices(modelKey);
  const credits = oqMap?.[quality]?.[outputQuality ?? "high"] ?? priceMap[quality] ?? 0;
  const { discountPct } = usePricingPromo(modelKey);
  const discountedCredits = applyDiscount(credits, discountPct);
  const showOutputQuality = OUTPUT_QUALITY_MODELS.has(modelKey);

  const isAuto = aspectRatio === "auto" || GROK_ONLY_RATIOS.has(aspectRatio);
  const currentRatio = ASPECT_RATIOS.find((r) => r.value === aspectRatio) || ASPECT_RATIOS[0];
  const ratioLabel = isAuto ? `${t("adaptive")} · ${quality}` : `${currentRatio.label} · ${quality}`;

  const handleModelChange = (id: string) => {
    onModelChange(id);
    if (GROK_ONLY_RATIOS.has(aspectRatio)) onAspectRatioChange("auto");
    const newPriceMap = getQualityPrices(id) ?? MODEL_QUALITY_PRICE[id];
    if (newPriceMap && imageSize && !newPriceMap[imageSize]) onImageSizeChange(Object.keys(newPriceMap)[0]);
    setModelOpen(false);
  };

  return (
      <PanelShell inverseZoom={inverseZoom}>
        <div className="flex items-center justify-between w-full p-2 h-14">
          <div className="flex items-center gap-1">
            {/* Model selector */}
            <div className="relative" ref={modelRef}>
              <button
                className={`nodrag flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 transition-colors text-zinc-300 ${modelOpen ? "bg-zinc-800" : ""}`}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => { e.preventDefault(); setModelOpen((v) => { if (!v) setRatioOpen(false); return !v; }); }}
              >
                <ImageModelIcon modelId={modelKey} />
                <span className="whitespace-nowrap">{modelLabel}</span>
              </button>
              {modelOpen && (
                <div
                  ref={modelDropRef}
                  className={`absolute ${modelFlipUp ? "bottom-full mb-2" : "top-full mt-2"} left-0 w-56 rounded-2xl border border-zinc-700/60 p-1 z-30 nodrag nowheel`}
                  style={{ background: "#1c1c1c" }}
                  onPointerDownCapture={(e) => e.stopPropagation()}
                >
                  {IMAGE_MODELS.filter((m) => STORYBOARD_MODELS.has(m.id)).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`nodrag w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors ${
                        modelKey === m.id ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                      }`}
                      onMouseDown={(e) => { e.preventDefault(); handleModelChange(m.id); }}
                    >
                      <ImageModelIcon modelId={m.id} />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{m.name}</span>
                        <span className="text-[11px] text-zinc-500">{t(m.descKey)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="w-px h-4 bg-zinc-700" />

            {/* Aspect ratio + quality popover */}
            <div className="relative" ref={ratioRef}>
              <button
                className={`nodrag flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 transition-colors text-zinc-300 ${ratioOpen ? "bg-zinc-800" : ""}`}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => { e.preventDefault(); setRatioOpen((v) => { if (!v) setModelOpen(false); return !v; }); }}
              >
                {isAuto ? <Fullscreen size={16} /> : <AspectRatioIcon w={currentRatio.w} h={currentRatio.h} />}
                <span>{ratioLabel}</span>
              </button>

              {ratioOpen && (
                <div
                  ref={ratioDropRef}
                  className={`absolute ${ratioFlipUp ? "bottom-full mb-2" : "top-full mt-2"} left-0 w-[380px] rounded-[20px] border border-zinc-700/60 p-1.5 z-30 nodrag nowheel`}
                  style={{ background: "#1c1c1c" }}
                  onPointerDownCapture={(e) => e.stopPropagation()}
                >
                  {/* Quality */}
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
                          onMouseDown={(e) => { e.preventDefault(); onImageSizeChange(q); }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 精细度 (Output Quality) — GPT Image 2 only */}
                  {showOutputQuality && (
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
                            onMouseDown={(e) => { e.preventDefault(); onOutputQualityChange(oq); }}
                          >
                            {t(`outputQuality_${oq}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ratio */}
                  <div className="p-2 flex flex-col gap-1.5">
                    <div className="text-xs font-medium text-zinc-500 px-1">{t("aspectRatio")}</div>
                    <div className="relative flex gap-1.5 bg-white/[0.06] rounded-lg p-1">
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
                </div>
              )}
            </div>

            <div className="w-px h-4 bg-zinc-700" />

            {/* Output mode toggle: individual vs grid */}
            <div className="flex items-center bg-white/[0.06] rounded-lg p-0.5">
              <button
                type="button"
                className={`nodrag flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors ${
                  outputMode === "individual" ? "text-white bg-white/[0.08]" : "text-zinc-500 hover:text-zinc-200"
                }`}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => { e.preventDefault(); onOutputModeChange("individual"); }}
                title={t("storyboardOutputIndividual")}
              >
                <Layers size={14} />
                <span>{t("storyboardOutputIndividual")}</span>
              </button>
              <button
                type="button"
                className={`nodrag flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors ${
                  outputMode === "grid" ? "text-white bg-white/[0.08]" : "text-zinc-500 hover:text-zinc-200"
                }`}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => { e.preventDefault(); onOutputModeChange("grid"); }}
                title={t("storyboardOutputGrid")}
              >
                <Grid2x2 size={14} />
                <span>{t("storyboardOutputGrid")}</span>
              </button>
            </div>
          </div>

          {/* Right: count + send */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-zinc-500 tabular-nums whitespace-nowrap px-1">
              {t("storyboardGenCount", { n: selectedCount })}
            </span>
            <CreditsPill
              credits={String(
                outputMode === "grid"
                  ? discountedCredits || "—"
                  : selectedCount > 1 ? discountedCredits * selectedCount : discountedCredits || "—"
              )}
              originalCredits={discountPct > 0 ? String(
                outputMode === "grid"
                  ? credits || "—"
                  : selectedCount > 1 ? credits * selectedCount : credits || "—"
              ) : undefined}
              onSend={onGenerate}
              disabled={isGenerating || selectedCount === 0 || (outputMode === "grid" && selectedCount < 2)}
              loading={isGenerating}
            />
          </div>
        </div>
      </PanelShell>
  );
}
