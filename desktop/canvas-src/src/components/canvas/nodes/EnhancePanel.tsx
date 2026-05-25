"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, ChevronDown, Check, Sparkles, Settings2 } from "lucide-react";

const ENHANCE_STYLES = [
  { value: "Standard V2", labelKey: "enhanceStyleStandard", descKey: "enhanceStyleStandardDesc" },
  { value: "High Fidelity V2", labelKey: "enhanceStyleHiFi", descKey: "enhanceStyleHiFiDesc" },
  { value: "Low Resolution V2", labelKey: "enhanceStyleLowRes", descKey: "enhanceStyleLowResDesc" },
  { value: "CG Art & Game Art", labelKey: "enhanceStyleCG", descKey: "enhanceStyleCGDesc" },
] as const;

const SCALE_OPTIONS = [
  { value: 2, label: "2x" },
  { value: 4, label: "4x" },
] as const;

function priceForOutputMP(outputMP: number): number {
  if (outputMP <= 24)  return 10;
  if (outputMP <= 48)  return 20;
  if (outputMP <= 96)  return 39;
  if (outputMP <= 192) return 77;
  return 164;
}

function estimatePrice(factor: number, imgW?: number, imgH?: number): number {
  if (!imgW || !imgH) return factor <= 2 ? 10 : 39; // fallback
  const outputMP = (imgW * factor * imgH * factor) / 1_000_000;
  return priceForOutputMP(outputMP);
}

function CreditsIcon() {
  return (
    <img src="/infinite_logo.svg" width="16" height="16" alt="Xins" className="brightness-0 invert opacity-80" />
  );
}

function Divider() {
  return <div className="w-px h-4 bg-zinc-700" />;
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

export interface EnhancePanelProps {
  inverseZoom: number;
  sourceImageUrl: string | null;
  sourceOriginalUrl: string | null;
  enhanceModel: string;
  upscaleFactor: number;
  faceEnhancement: boolean;
  faceStrength: number;
  faceCreativity: number;
  onModelChange: (v: string) => void;
  onFactorChange: (v: number) => void;
  onFaceChange: (v: boolean) => void;
  onFaceStrengthChange: (v: number) => void;
  onFaceCreativityChange: (v: number) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export function EnhancePanel({
  inverseZoom,
  sourceImageUrl,
  sourceOriginalUrl,
  enhanceModel,
  upscaleFactor,
  faceEnhancement,
  faceStrength,
  faceCreativity,
  onModelChange,
  onFactorChange,
  onFaceChange,
  onFaceStrengthChange,
  onFaceCreativityChange,
  onGenerate,
  isGenerating,
}: EnhancePanelProps) {
  const t = useTranslations("canvas");
  const [styleOpen, setStyleOpen] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const styleRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef<HTMLDivElement>(null);

  useClickOutside(styleRef, styleOpen, () => setStyleOpen(false));
  useClickOutside(scaleRef, scaleOpen, () => setScaleOpen(false));

  // Fetch ORIGINAL image dimensions server-side for accurate pricing (never loads big image in browser)
  const [srcDims, setSrcDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const url = sourceOriginalUrl || sourceImageUrl;
    if (!url) { setSrcDims(null); return; }
    let cancelled = false;
    fetch("/api/image-dimensions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.width && d.height) setSrcDims({ w: d.width, h: d.height }); })
      .catch(() => { if (!cancelled) setSrcDims(null); });
    return () => { cancelled = true; };
  }, [sourceOriginalUrl, sourceImageUrl]);

  const currentStyleLabel = ENHANCE_STYLES.find((s) => s.value === enhanceModel)?.labelKey ?? "enhanceStyleStandard";
  const currentScaleLabel = SCALE_OPTIONS.find((s) => s.value === upscaleFactor)?.label ?? "2x";
  const price = estimatePrice(upscaleFactor, srcDims?.w, srcDims?.h);

  const handleGenerate = useCallback(() => {
    if (!sourceImageUrl || isGenerating) return;
    onGenerate();
  }, [sourceImageUrl, isGenerating, onGenerate]);

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

        {/* ── Reference image row (top) ── */}
        <div className="flex-1 px-3 pt-3 pb-2 flex gap-2 items-center">
          <div className="flex items-center gap-2">
            <div className="flex flex-wrap gap-1.5 nodrag items-center">
              {sourceImageUrl ? (
                <div className="relative size-[38px] rounded-[10px] border border-white/10 overflow-hidden shrink-0">
                  <img src={sourceImageUrl} alt="source" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="size-[38px] flex items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.06] shrink-0">
                  <Sparkles size={16} className="text-zinc-500" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Single-row action bar: Style | Scale | Face | Credits+Send ── */}
        <div className="flex items-center justify-between w-full p-2 h-14">
          {/* Left controls */}
          <div className="flex items-center gap-1">

            {/* Style dropdown */}
            <div className="relative" ref={styleRef}>
              <button
                type="button"
                className="nodrag inline-flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 active:bg-white/[0.1] text-zinc-300 transition-colors"
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => { e.preventDefault(); setScaleOpen(false); setStyleOpen(!styleOpen); }}
              >
                <Sparkles size={15} />
                <span className="whitespace-nowrap">{t(currentStyleLabel)}</span>
              </button>
              {styleOpen && (
                <div className="absolute bottom-full mb-1 left-0 bg-[#252525] border border-zinc-700 rounded-xl py-1.5 w-[280px] z-50">
                  {ENHANCE_STYLES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      className={`nodrag w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-white/5 transition ${
                        enhanceModel === s.value ? "text-white" : "text-zinc-400"
                      }`}
                      onPointerDownCapture={(e) => e.stopPropagation()}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onModelChange(s.value);
                        setStyleOpen(false);
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium flex items-center gap-1.5">
                          {t(s.labelKey)}
                          {enhanceModel === s.value && <Check size={13} className="shrink-0" />}
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5 leading-snug">{t(s.descKey)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Divider />

            {/* Scale dropdown */}
            <div className="relative" ref={scaleRef}>
              <button
                type="button"
                className="nodrag inline-flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 active:bg-white/[0.1] text-zinc-300 transition-colors"
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => { e.preventDefault(); setStyleOpen(false); setScaleOpen(!scaleOpen); }}
              >
                <span className="whitespace-nowrap">{currentScaleLabel}</span>
                <ChevronDown size={12} className={`text-zinc-400 transition-transform ${scaleOpen ? "rotate-180" : ""}`} />
              </button>
              {scaleOpen && (
                <div className="absolute bottom-full mb-1 left-0 bg-[#252525] border border-zinc-700 rounded-lg py-1 min-w-[80px] z-50">
                  {SCALE_OPTIONS.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      className={`nodrag w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-white/5 transition ${
                        upscaleFactor === s.value ? "text-white" : "text-zinc-400"
                      }`}
                      onPointerDownCapture={(e) => e.stopPropagation()}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onFactorChange(s.value);
                        setScaleOpen(false);
                      }}
                    >
                      <span>{s.label}</span>
                      {upscaleFactor === s.value && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Divider />

            {/* Face enhancement toggle */}
            <div className="nodrag inline-flex items-center gap-1.5 px-2 py-1.5">
              <span className="text-sm text-zinc-300 whitespace-nowrap">{t("enhanceFace")}</span>
              <button
                type="button"
                role="switch"
                aria-checked={faceEnhancement}
                className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  faceEnhancement ? "bg-white" : "bg-zinc-600"
                }`}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => { e.preventDefault(); onFaceChange(!faceEnhancement); }}
              >
                <span
                  className={`pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-transform ${
                    faceEnhancement ? "translate-x-4 bg-black" : "translate-x-0 bg-zinc-400"
                  }`}
                />
              </button>
            </div>

            <Divider />

            {/* Advanced settings toggle */}
            <button
              type="button"
              className="nodrag flex items-center justify-center rounded-lg px-2.5 py-2.5 hover:bg-zinc-800 active:bg-white/[0.1] transition-colors"
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setShowAdvanced(!showAdvanced); }}
            >
              <Settings2 size={16} className={showAdvanced ? "text-white" : "text-zinc-300"} />
            </button>
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
              <div className="flex items-center text-sm text-zinc-200 font-medium box-border pl-1">
                <CreditsIcon />
                <span className="relative inline-flex min-w-[24px] justify-center tabular-nums text-xs">
                  {price}
                </span>
              </div>
              <button
                type="button"
                disabled={!sourceImageUrl || isGenerating}
                className="nodrag aspect-square w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                aria-label={t("enhanceGenerate")}
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

        {/* ── Advanced settings (collapsible) ── */}
        <div className={`nodrag overflow-hidden transition-all duration-300 ${showAdvanced ? "max-h-40" : "max-h-0"}`}>
          <div className="px-4 pb-4 pt-1 space-y-3 bg-zinc-900/30 rounded-b-[20px]">
            {/* Creativity slider */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-300 whitespace-nowrap w-[52px] shrink-0">{t("enhanceCreativity")}</span>
              <input
                type="range"
                min={0} max={1} step={0.1}
                value={faceCreativity}
                onChange={(e) => onFaceCreativityChange(parseFloat(e.target.value))}
                className="nodrag flex-1 h-1 bg-zinc-600 rounded-full appearance-none cursor-pointer accent-white [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                onPointerDownCapture={(e) => e.stopPropagation()}
              />
              <span className="text-xs text-zinc-400 tabular-nums w-7 text-right shrink-0">{faceCreativity.toFixed(1)}</span>
            </div>
            {/* Strength slider */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-300 whitespace-nowrap w-[52px] shrink-0">{t("enhanceStrength")}</span>
              <input
                type="range"
                min={0} max={1} step={0.1}
                value={faceStrength}
                onChange={(e) => onFaceStrengthChange(parseFloat(e.target.value))}
                className="nodrag flex-1 h-1 bg-zinc-600 rounded-full appearance-none cursor-pointer accent-white [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                onPointerDownCapture={(e) => e.stopPropagation()}
              />
              <span className="text-xs text-zinc-400 tabular-nums w-7 text-right shrink-0">{faceStrength.toFixed(1)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
