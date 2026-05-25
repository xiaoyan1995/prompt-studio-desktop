"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, ChevronDown, Check, Sparkles } from "lucide-react";

const VIDEO_ENHANCE_MODELS = [
  { value: "Starlight Precise 2.5", labelKey: "videoEnhanceModelStarlightPrecise" },
  { value: "ByteDance Video Upscaler", labelKey: "videoEnhanceModelByteDance" },
] as const;

const RESOLUTION_OPTIONS = [
  { value: 720, label: "720p" },
  { value: 1080, label: "1080p" },
  { value: 1440, label: "2K" },
  { value: 2160, label: "4K" },
] as const;

const FPS_OPTIONS = [
  { value: 0, labelKey: "videoEnhanceFpsOriginal" },
  { value: 30, labelKey: "videoEnhanceFps30" },
  { value: 60, labelKey: "videoEnhanceFps60" },
] as const;

const STARLIGHT_MODELS = new Set([
  "Starlight Precise 1", "Starlight Precise 2", "Starlight Precise 2.5",
  "Starlight HQ", "Starlight Mini", "Starlight Sharp",
  "Starlight Fast 1", "Starlight Fast 2",
]);
const GAIA2_MODELS = new Set(["Gaia 2"]);

function calcFactor(sourceHeight: number, targetRes: number): number {
  if (!sourceHeight || sourceHeight <= 0) return 2;
  return Math.min(4, Math.max(1, targetRes / sourceHeight));
}

function videoEnhancePrice(durationS: number, targetRes: number, model?: string, targetFps?: number): number {
  if (model === "ByteDance Video Upscaler") {
    // Flat $0.05/s — Runware cost ~$0.022/s, ~50%+ margin
    const priceUsd = 0.05 * durationS;
    return Math.max(15, Math.ceil(priceUsd * 100));
  }
  // Starlight: tiered selling price per second at 24fps (USD)
  // 720p=$0.10, 1080p=$0.12, 2K=$0.18, 4K=$0.25
  // FPS scales linearly: × (output_fps / 24)
  const sellRate = targetRes > 1440 ? 0.25
                 : targetRes > 1080 ? 0.18
                 : targetRes > 720  ? 0.12
                 :                    0.10;
  const fps = targetFps && targetFps > 0 ? targetFps : 24;
  const priceUsd = sellRate * (fps / 24) * durationS;
  return Math.max(15, Math.ceil(priceUsd * 100));
}

function CreditsIcon() {
  return (
    <img src="/infinite_logo.svg" width="16" height="16" alt="Xins" className="brightness-0 invert opacity-80" />
  );
}

function Divider() {
  return <div className="w-px h-4 bg-zinc-700" />;
}

function useVideoDuration(url: string | null): number {
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    if (!url) { setDuration(0); return; }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;
    const onLoaded = () => { setDuration(video.duration || 0); video.remove(); };
    const onError = () => { setDuration(0); video.remove(); };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
    return () => { video.removeEventListener("loadedmetadata", onLoaded); video.removeEventListener("error", onError); video.remove(); };
  }, [url]);
  return duration;
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, open, onClose]);
}

export interface VideoEnhancePanelProps {
  inverseZoom: number;
  sourceVideoUrl: string | null;
  sourceThumbnailUrl: string | null;
  sourceHeight: number;
  durationS: number;
  enhanceModel: string;
  targetResolution: number;
  compression: number;
  noise: number;
  halo: number;
  grain: number;
  recoverDetail: number;
  targetFps: number;
  onModelChange: (v: string) => void;
  onTargetResolutionChange: (v: number) => void;
  onTargetFpsChange: (v: number) => void;
  onCompressionChange: (v: number) => void;
  onNoiseChange: (v: number) => void;
  onHaloChange: (v: number) => void;
  onGrainChange: (v: number) => void;
  onRecoverDetailChange: (v: number) => void;
  onGenerate: () => void;
  onDurationDetected?: (d: number) => void;
  isGenerating: boolean;
}

export function VideoEnhancePanel({
  inverseZoom,
  sourceVideoUrl,
  sourceThumbnailUrl,
  sourceHeight,
  durationS,
  enhanceModel,
  targetResolution,
  compression,
  noise,
  halo,
  grain,
  recoverDetail,
  targetFps,
  onModelChange,
  onTargetResolutionChange,
  onTargetFpsChange,
  onCompressionChange,
  onNoiseChange,
  onHaloChange,
  onGrainChange,
  onRecoverDetailChange,
  onGenerate,
  onDurationDetected,
  isGenerating,
}: VideoEnhancePanelProps) {
  const t = useTranslations("canvas");
  const [modelOpen, setModelOpen] = useState(false);
  const [resOpen, setResOpen] = useState(false);
  const [fpsOpen, setFpsOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const resRef = useRef<HTMLDivElement>(null);
  const fpsRef = useRef<HTMLDivElement>(null);

  useClickOutside(modelRef, modelOpen, () => setModelOpen(false));
  useClickOutside(resRef, resOpen, () => setResOpen(false));
  useClickOutside(fpsRef, fpsOpen, () => setFpsOpen(false));
  const isBytedance = enhanceModel === "ByteDance Video Upscaler";
  const isAlready4K = sourceHeight >= 2160;
  const currentModelLabel = VIDEO_ENHANCE_MODELS.find((m) => m.value === enhanceModel)?.labelKey ?? VIDEO_ENHANCE_MODELS[0].labelKey;
  const normalizedRes = RESOLUTION_OPTIONS.some((r) => r.value === targetResolution) ? targetResolution : 1080;
  const currentResLabel = RESOLUTION_OPTIONS.find((r) => r.value === normalizedRes)?.label ?? "1080p";
  const normalizedFps = FPS_OPTIONS.some((f) => f.value === targetFps) ? targetFps : 0;
  const currentFpsLabel = FPS_OPTIONS.find((f) => f.value === normalizedFps)?.labelKey ?? "videoEnhanceFpsOriginal";
  const realDuration = useVideoDuration(sourceVideoUrl);
  const effectiveDuration = realDuration > 0 ? realDuration : durationS;
  const durationCbRef = useRef(onDurationDetected);
  durationCbRef.current = onDurationDetected;
  useEffect(() => { if (realDuration > 0) durationCbRef.current?.(realDuration); }, [realDuration]);
  const price = videoEnhancePrice(effectiveDuration, normalizedRes, enhanceModel, normalizedFps);

  const handleGenerate = useCallback(() => {
    if (!sourceVideoUrl || isGenerating) return;
    onGenerate();
  }, [sourceVideoUrl, isGenerating, onGenerate]);

  const sliderClass = "nodrag flex-1 h-1 bg-zinc-600 rounded-full appearance-none cursor-pointer accent-white [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer";

  return (
    <div
      className="absolute left-1/2 z-20 w-full pointer-events-auto nowheel transition-transform duration-150 ease-out"
      style={{
        bottom: "-8px",
        transform: `translateX(-50%) translateY(100%) scale(${inverseZoom})`,
        transformOrigin: "center top",
        minWidth: 520,
        maxWidth: 560,
      }}
    >
      <div className="bg-[#1e1e1e] rounded-[20px] border border-zinc-700/60 shadow-lg mt-2 w-full">

        {/* Source video thumbnail (top) */}
        <div className="flex-1 px-3 pt-3 pb-2 flex gap-2 items-center">
          <div className="flex items-center gap-2">
            <div className="flex flex-wrap gap-1.5 nodrag items-center">
              {sourceThumbnailUrl || sourceVideoUrl ? (
                <div className="relative size-[38px] rounded-[10px] border border-white/10 overflow-hidden shrink-0">
                  {sourceThumbnailUrl ? (
                    <img src={sourceThumbnailUrl} alt="source" className="w-full h-full object-cover" />
                  ) : (
                    <video src={sourceVideoUrl!} className="w-full h-full object-cover" muted playsInline />
                  )}
                </div>
              ) : (
                <div className="size-[38px] flex items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.06] shrink-0">
                  <Sparkles size={16} className="text-zinc-500" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Single-row action bar: Model | Scale | Advanced | Credits+Send */}
        <div className="flex items-center justify-between w-full p-2 h-14">
          {/* Left controls */}
          <div className="flex items-center gap-1">

            {/* Model dropdown */}
            <div className="relative" ref={modelRef}>
              <button
                type="button"
                className="nodrag inline-flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 active:bg-white/[0.1] text-zinc-300 transition-colors"
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => { e.preventDefault(); setResOpen(false); setFpsOpen(false); setModelOpen(!modelOpen); }}
              >
                <Sparkles size={15} />
                <span className="whitespace-nowrap">{t(currentModelLabel)}</span>
                <ChevronDown size={12} className={`text-zinc-400 transition-transform ${modelOpen ? "rotate-180" : ""}`} />
              </button>
              {modelOpen && (
                <div className="absolute bottom-full mb-1 left-0 bg-[#252525] border border-zinc-700 rounded-lg py-1 min-w-[180px] z-50">
                  {VIDEO_ENHANCE_MODELS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      className={`nodrag w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-white/5 transition ${
                        enhanceModel === m.value ? "text-white" : "text-zinc-400"
                      }`}
                      onPointerDownCapture={(e) => e.stopPropagation()}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onModelChange(m.value);
                        setModelOpen(false);
                      }}
                    >
                      <span>{t(m.labelKey)}</span>
                      {enhanceModel === m.value && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!isBytedance && <Divider />}

            {/* Resolution dropdown (Starlight only) */}
            {!isBytedance && <div className="relative" ref={resRef}>
                <button
                  type="button"
                  className="nodrag inline-flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 active:bg-white/[0.1] text-zinc-300 transition-colors"
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  onMouseDown={(e) => { e.preventDefault(); setFpsOpen(false); setModelOpen(false); setResOpen(!resOpen); }}
                >
                  <span className="whitespace-nowrap">{currentResLabel}</span>
                  <ChevronDown size={12} className={`text-zinc-400 transition-transform ${resOpen ? "rotate-180" : ""}`} />
                </button>
                {resOpen && (
                  <div className="absolute bottom-full mb-1 left-0 bg-[#252525] border border-zinc-700 rounded-lg py-1 min-w-[100px] z-50">
                    {RESOLUTION_OPTIONS.map((r) => {
                      const disabled = sourceHeight > 0 && r.value < sourceHeight;
                      return (
                        <button
                          key={r.value}
                          type="button"
                          disabled={disabled}
                          className={`nodrag w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition ${
                            disabled ? "text-zinc-600 cursor-not-allowed" : normalizedRes === r.value ? "text-white hover:bg-white/5" : "text-zinc-400 hover:bg-white/5"
                          }`}
                          onPointerDownCapture={(e) => e.stopPropagation()}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            if (disabled) return;
                            onTargetResolutionChange(r.value);
                            setResOpen(false);
                          }}
                        >
                          <span>{r.label}</span>
                          {normalizedRes === r.value && !disabled && <Check size={14} />}
                        </button>
                      );
                    })}
                  </div>
                )}
            </div>}

            {!isBytedance && <Divider />}

            {/* FPS dropdown (Starlight only) */}
            {!isBytedance && <div className="relative" ref={fpsRef}>
                <button
                  type="button"
                  className="nodrag inline-flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 active:bg-white/[0.1] text-zinc-300 transition-colors"
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  onMouseDown={(e) => { e.preventDefault(); setResOpen(false); setModelOpen(false); setFpsOpen(!fpsOpen); }}
                >
                  <span className="whitespace-nowrap">{t(currentFpsLabel)}</span>
                  <ChevronDown size={12} className={`text-zinc-400 transition-transform ${fpsOpen ? "rotate-180" : ""}`} />
                </button>
                {fpsOpen && (
                  <div className="absolute bottom-full mb-1 left-0 bg-[#252525] border border-zinc-700 rounded-lg py-1 min-w-[120px] z-50">
                    {FPS_OPTIONS.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        className={`nodrag w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-white/5 transition ${
                          normalizedFps === f.value ? "text-white" : "text-zinc-400"
                        }`}
                        onPointerDownCapture={(e) => e.stopPropagation()}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onTargetFpsChange(f.value);
                          setFpsOpen(false);
                        }}
                      >
                        <span>{t(f.labelKey)}</span>
                        {normalizedFps === f.value && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                )}
            </div>}

          </div>

          {/* Right: credits pill + generate */}
          <div className="flex items-center gap-1">
            <div
              className="nodrag flex items-center gap-1 rounded-full p-1 border border-white/10"
              style={{
                backdropFilter: "blur(10px)",
                background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)",
              }}
            >
              {isAlready4K ? (
                <span className="text-xs text-zinc-500 px-1.5 whitespace-nowrap">{t("videoEnhanceAlready4K")}</span>
              ) : (
                <div className="flex items-center text-sm text-zinc-200 font-medium box-border pl-1">
                  <CreditsIcon />
                  <span className="relative inline-flex min-w-[24px] justify-center tabular-nums text-xs">
                    {price}
                  </span>
                </div>
              )}
              <button
                type="button"
                disabled={!sourceVideoUrl || isGenerating || isAlready4K}
                className="nodrag aspect-square w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                aria-label={t("videoEnhanceGenerate")}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onClick={handleGenerate}
              >
                {isGenerating ? (
                  <Sparkles size={14} className="animate-spin" />
                ) : (
                  <ArrowUp size={16} />
                )}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
