"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowUp, ChevronDown, Check, Scissors, Settings2 } from "lucide-react";

const REMBG_MODELS = [
  { value: "General Use (Light)", labelKey: "rembgModelGeneral" },
  { value: "General Use (Light 2K)", labelKey: "rembgModelGeneral2K" },
  { value: "General Use (Heavy)", labelKey: "rembgModelHeavy" },
  { value: "Matting", labelKey: "rembgModelMatting" },
  { value: "Portrait", labelKey: "rembgModelPortrait" },
] as const;

const RESOLUTION_OPTIONS = [
  { value: "1024x1024", label: "1K" },
  { value: "2048x2048", label: "2K" },
] as const;

const PRICE = 2;

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

interface RemoveBgPanelProps {
  inverseZoom: number;
  sourceImageUrl: string | null;
  rembgModel: string;
  resolution: string;
  refineForeground: boolean;
  outputMask: boolean;
  onModelChange: (v: string) => void;
  onResolutionChange: (v: string) => void;
  onRefineChange: (v: boolean) => void;
  onOutputMaskChange: (v: boolean) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export function RemoveBgPanel({
  inverseZoom,
  sourceImageUrl,
  rembgModel,
  resolution,
  refineForeground,
  outputMask,
  onModelChange,
  onResolutionChange,
  onRefineChange,
  onOutputMaskChange,
  onGenerate,
  isGenerating,
}: RemoveBgPanelProps) {
  const t = useTranslations("canvas");

  const [modelOpen, setModelOpen] = useState(false);
  const [resOpen, setResOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const resRef = useRef<HTMLDivElement>(null);

  useClickOutside(modelRef, modelOpen, () => setModelOpen(false));
  useClickOutside(resRef, resOpen, () => setResOpen(false));

  const closeAll = useCallback(() => { setModelOpen(false); setResOpen(false); }, []);

  const modelLabel = REMBG_MODELS.find((m) => m.value === rembgModel)?.labelKey ?? "rembgModelGeneral";
  const resLabel = RESOLUTION_OPTIONS.find((r) => r.value === resolution)?.label ?? "1K";

  return (
    <div
      className="absolute -bottom-2 z-20 w-full transition-all duration-300 min-w-[380px] opacity-100 visible nodrag nowheel"
      style={{
        left: "50%",
        transform: `translateX(-50%) translateY(100%) scale(${inverseZoom})`,
        transformOrigin: "center top",
      }}
    >
      <div className="bg-[#1e1e1e] rounded-[20px] border border-zinc-700/60 shadow-lg mt-2 w-full">
        {/* Source image row */}
        <div className="flex-1 px-3 pt-3 pb-2 flex gap-2 items-center">
          {sourceImageUrl ? (
            <img
              src={sourceImageUrl}
              alt="source"
              className="w-[38px] h-[38px] rounded-lg object-cover border border-zinc-700/40"
            />
          ) : (
            <div className="w-[38px] h-[38px] rounded-lg border border-dashed border-zinc-600 flex items-center justify-center">
              <Scissors size={16} className="text-zinc-500" />
            </div>
          )}
          <span className="text-xs text-zinc-500">{t("rembgSourceImage")}</span>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-between w-full p-2 h-14">
          <div className="flex items-center gap-1">
            {/* Model dropdown */}
            <div ref={modelRef} className="relative">
              <button
                type="button"
                onClick={() => { closeAll(); setModelOpen(!modelOpen); }}
                className="nodrag flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <Scissors size={13} className="text-zinc-400" />
                <span>{t(modelLabel)}</span>
                <ChevronDown size={12} className={`text-zinc-500 transition-transform ${modelOpen ? "rotate-180" : ""}`} />
              </button>
              {modelOpen && (
                <div className="absolute bottom-full mb-1 left-0 w-40 bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-lg py-1 z-50">
                  {REMBG_MODELS.map((m) => (
                    <button
                      key={m.value}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 flex items-center justify-between ${rembgModel === m.value ? "text-white" : "text-zinc-400"}`}
                      onClick={() => { onModelChange(m.value); setModelOpen(false); }}
                    >
                      <span>{t(m.labelKey)}</span>
                      {rembgModel === m.value && <Check size={12} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Divider />

            {/* Resolution dropdown */}
            <div ref={resRef} className="relative">
              <button
                type="button"
                onClick={() => { closeAll(); setResOpen(!resOpen); }}
                className="nodrag flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
              >
                <span>{resLabel}</span>
                <ChevronDown size={12} className={`text-zinc-500 transition-transform ${resOpen ? "rotate-180" : ""}`} />
              </button>
              {resOpen && (
                <div className="absolute bottom-full mb-1 left-0 w-28 bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-lg py-1 z-50">
                  {RESOLUTION_OPTIONS.map((r) => (
                    <button
                      key={r.value}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 flex items-center justify-between ${resolution === r.value ? "text-white" : "text-zinc-400"}`}
                      onClick={() => { onResolutionChange(r.value); setResOpen(false); }}
                    >
                      <span>{r.label}</span>
                      {resolution === r.value && <Check size={12} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Divider />

            {/* Refine toggle */}
            <button
              type="button"
              onClick={() => onRefineChange(!refineForeground)}
              className="nodrag flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs transition-colors hover:bg-zinc-800"
            >
              <span className="text-zinc-400">{t("rembgRefine")}</span>
              <div className={`relative w-7 h-4 rounded-full transition-colors ${refineForeground ? "bg-cyan-500" : "bg-zinc-600"}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${refineForeground ? "translate-x-3.5" : "translate-x-0.5"}`} />
              </div>
            </button>
          </div>

          {/* Advanced toggle + Credits + send */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="nodrag flex items-center justify-center rounded-lg px-2.5 py-2.5 hover:bg-zinc-800 active:bg-white/[0.1] transition-colors"
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setShowAdvanced(!showAdvanced); }}
            >
              <Settings2 size={16} className={showAdvanced ? "text-white" : "text-zinc-300"} />
            </button>

            <div
              className="flex items-center gap-1 rounded-full p-1 border border-white/10"
              style={{
                backdropFilter: "blur(10px)",
                background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)",
              }}
            >
              <div className="flex items-center text-sm text-zinc-200 font-medium pl-1">
                <CreditsIcon />
                <span className="relative inline-flex min-w-[24px] justify-center tabular-nums text-xs">{PRICE}</span>
              </div>
              <button
                type="button"
                disabled={!sourceImageUrl || isGenerating}
                className="w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all"
                onClick={onGenerate}
              >
                {isGenerating ? (
                  <span className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-black rounded-full animate-spin" />
                ) : (
                  <ArrowUp size={14} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── Advanced settings (collapsible) ── */}
        <div className={`nodrag overflow-hidden transition-all duration-300 ${showAdvanced ? "max-h-20" : "max-h-0"}`}>
          <div className="px-4 pb-4 pt-1 bg-zinc-900/30 rounded-b-[20px]">
            <button
              type="button"
              onClick={() => onOutputMaskChange(!outputMask)}
              className="nodrag flex items-center justify-between w-full h-8 text-xs transition-colors"
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              <span className="text-zinc-300">{t("rembgOutputMask")}</span>
              <div className={`relative w-7 h-4 rounded-full transition-colors ${outputMask ? "bg-cyan-500" : "bg-zinc-600"}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${outputMask ? "translate-x-3.5" : "translate-x-0.5"}`} />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
