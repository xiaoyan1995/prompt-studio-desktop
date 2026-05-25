"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, ChevronDown, X, Loader2 } from "lucide-react";
import type { NodeType } from "@/types/canvas";
import type { ModelCapabilities } from "@/types/generation";

interface ModelOption {
  model_id: string;
  display_name: string;
  output_type: string;
  capabilities: ModelCapabilities;
}

interface GenerationBarProps {
  nodeType: NodeType;
  nodeId: string;
  models: ModelOption[];
  balance: number;
  onGenerate: (params: {
    model_id: string;
    input_params: {
      prompt: string;
      resolution: string;
      count: number;
      negative_prompt?: string;
    };
  }) => void;
  onClose: () => void;
  isGenerating?: boolean;
  progress?: string;
}

const RESOLUTIONS = ["512x512", "1024x1024", "1024x768", "768x1024"];
const COUNT_OPTIONS = [1, 2, 4];

export function GenerationBar({
  nodeType,
  models,
  balance,
  onGenerate,
  onClose,
  isGenerating = false,
  progress,
}: GenerationBarProps) {
  const t = useTranslations("canvas");
  const filteredModels = models.filter((m) =>
    nodeType === "video-gen" ? m.output_type === "VIDEO" : m.output_type === "IMAGE"
  );

  const [selectedModel, setSelectedModel] = useState(filteredModels[0]?.model_id ?? "");
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState("1024x1024");
  const [count, setCount] = useState(1);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [pricePreview, setPricePreview] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const currentModel = filteredModels.find((m) => m.model_id === selectedModel);
  const maxOutputs = currentModel?.capabilities?.max_outputs ?? 4;
  const availableCounts = COUNT_OPTIONS.filter((c) => c <= maxOutputs);

  useEffect(() => {
    if (count > maxOutputs) setCount(1);
  }, [maxOutputs, count]);

  // Price preview
  useEffect(() => {
    if (!selectedModel) return;
    const controller = new AbortController();
    setPriceLoading(true);

    fetch("/api/pricing/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model_id: selectedModel,
        input_params: { resolution, count },
      }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        setPricePreview(data.pricing?.total_xins ?? null);
        setPriceLoading(false);
      })
      .catch(() => setPriceLoading(false));

    return () => controller.abort();
  }, [selectedModel, resolution, count]);

  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || !selectedModel) return;
    onGenerate({
      model_id: selectedModel,
      input_params: {
        prompt: prompt.trim(),
        resolution,
        count,
      },
    });
  }, [prompt, selectedModel, resolution, count, onGenerate]);

  const insufficient = pricePreview !== null && pricePreview > balance;

  return (
    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 translate-y-full z-50 min-w-[640px] max-w-[650px]">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl p-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/10 text-white/40 hover:text-white/70 transition"
        >
          <X size={14} />
        </button>

        {/* Prompt */}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you want to generate..."
          className="w-full min-h-[80px] max-h-[120px] bg-transparent text-white text-sm placeholder:text-white/30 resize-none outline-none mb-3"
          disabled={isGenerating}
        />

        {/* Action bar */}
        <div className="flex items-center gap-2">
          {/* Model selector */}
          <div className="relative">
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/70 transition"
              disabled={isGenerating}
            >
              <span className="truncate max-w-[120px]">
                {currentModel?.display_name ?? "Select model"}
              </span>
              <ChevronDown size={12} />
            </button>
            {showModelPicker && (
              <div className="absolute bottom-full mb-1 left-0 bg-[#252525] border border-white/10 rounded-lg py-1 min-w-[200px] z-10">
                {filteredModels.map((m) => (
                  <button
                    key={m.model_id}
                    onClick={() => { setSelectedModel(m.model_id); setShowModelPicker(false); }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-white/5 transition ${
                      m.model_id === selectedModel ? "text-[#CCFF00]" : "text-white/70"
                    }`}
                  >
                    {m.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Resolution */}
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-white/5 text-sm text-white/70 outline-none border-none"
            disabled={isGenerating}
          >
            {RESOLUTIONS.map((r) => (
              <option key={r} value={r} className="bg-[#252525]">{r}</option>
            ))}
          </select>

          {/* Count */}
          <div className="flex items-center gap-1">
            {availableCounts.map((c) => (
              <button
                key={c}
                onClick={() => setCount(c)}
                className={`px-2 py-1 rounded text-xs font-medium transition ${
                  count === c
                    ? "bg-[#CCFF00]/20 text-[#CCFF00]"
                    : "bg-white/5 text-white/50 hover:text-white/70"
                }`}
                disabled={isGenerating}
              >
                {c}x
              </button>
            ))}
            {maxOutputs === 1 && (
              <span className="text-[10px] text-white/30 ml-1">{t("singleLimit")}</span>
            )}
          </div>

          <div className="flex-1" />

          {/* Price + Generate */}
          <div className="flex items-center gap-2">
            <span className={`text-xs tabular-nums ${insufficient ? "text-red-400" : "text-white/40"}`}>
              {priceLoading ? "..." : pricePreview !== null ? `${pricePreview} ${t("credits")}` : ""}
            </span>
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating || insufficient}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition disabled:opacity-40"
              style={{
                background: "radial-gradient(94.74% 157.5% at 50% 21.25%, rgb(26,26,26) 0%, rgb(101,103,102) 100%)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={14} className="text-[#CCFF00] animate-spin" />
                  <span className="text-white/70">{progress ?? "Generating..."}</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} className="text-[#CCFF00]" />
                  <span className="text-white">Generate</span>
                </>
              )}
            </button>
          </div>
        </div>

        {insufficient && (
          <p className="text-xs text-red-400 mt-2">
            {t("balanceNeeded", { needed: pricePreview, current: balance })}
          </p>
        )}
      </div>
    </div>
  );
}
