"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { usePricingPromo, applyDiscount } from "@/hooks/use-pricing-promo";
import { PromptEditor } from "../PromptEditor";
import { useClickOutside, useAutoFlip, PanelShell, CreditsPill, GeminiIcon, OpenAIIcon, DeepSeekIcon, TEXT_MODELS, RefThumb } from "../panel-shared";
import type { ConnectedRefNode } from "../plugin-types";

export function TextGenPanel({
  prompt,
  modelId,
  onPromptChange,
  onModelChange,
  onGenerate,
  isGenerating,
  inverseZoom,
  imageNodes,
  onRemoveRef,
}: {
  prompt: string;
  modelId: string;
  onPromptChange: (v: string, json?: any) => void;
  onModelChange: (v: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  inverseZoom: number;
  imageNodes?: ConnectedRefNode[];
  onRemoveRef?: (url: string) => void;
}) {
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  useClickOutside(modelPickerRef, showModelPicker, () => setShowModelPicker(false));
  const [modelFlipUp, modelDropRef] = useAutoFlip(modelPickerRef, showModelPicker);
  const [pricingMap, setPricingMap] = useState<Record<string, number>>({});
  const t = useTranslations("canvas");
  const tm = useTranslations("textModels");
  const selectedModel = TEXT_MODELS.find((m) => m.id === modelId) || TEXT_MODELS[0];
  const modelLabel = selectedModel.name;
  const credits = pricingMap[selectedModel.id] ?? 0;
  const { discountPct } = usePricingPromo(selectedModel.id);
  const discountedCredits = applyDiscount(credits, discountPct);

  useEffect(() => {
    fetch("/api/generate/text/pricing")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.pricing) setPricingMap(d.pricing); })
      .catch(() => {});
  }, []);

  return (
    <PanelShell inverseZoom={inverseZoom} expanded={expanded} onExpand={() => setExpanded(true)} onCollapse={() => setExpanded(false)}>
      {/* ── Reference images row ── */}
      {imageNodes && imageNodes.length > 0 && (
        <div className="flex-1 px-3 pt-3 pb-1 flex gap-1.5 items-center overflow-x-auto nowheel nodrag">
          {imageNodes.map((node, i) => (
            <RefThumb
              key={node.nodeId || i}
              src={node.thumbnailUrl || node.url}
              label={node.label || `Image ${i + 1}`}
              onRemove={onRemoveRef ? () => onRemoveRef(node.url) : undefined}
            />
          ))}
        </div>
      )}

      {/* ── Prompt ── */}
      <div className={`relative flex justify-between flex-1 ${imageNodes && imageNodes.length > 0 ? "pt-1" : "pt-1"} nodrag nowheel`}>
        <PromptEditor
          content={prompt}
          onChange={onPromptChange}
          placeholder={t("promptPlaceholder")}
          style={{ minHeight: expanded ? 300 : 104, maxHeight: expanded ? "calc(80vh - 140px)" : 156 }}
        />
      </div>

      {/* ── Action bar ── */}
      <div className="flex items-center justify-between w-full p-2 h-14">
        {/* Left: model selector */}
        <div className="flex items-center gap-1">
          <div className="relative" ref={modelPickerRef}>
            <button
              className={`nodrag flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-300 ${showModelPicker ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setShowModelPicker(!showModelPicker); }}
            >
              {selectedModel.icon === "openai" ? <OpenAIIcon /> : selectedModel.icon === "deepseek" ? <DeepSeekIcon /> : <GeminiIcon />}
              <span className="whitespace-nowrap">{modelLabel}</span>
            </button>

            {showModelPicker && (
              <div
                ref={modelDropRef}
                className={`absolute ${modelFlipUp ? "bottom-full mb-2" : "top-full mt-2"} left-0 w-80 rounded-[20px] border border-zinc-200 dark:border-zinc-700/60 p-1.5 z-50 nodrag nowheel max-h-[400px] overflow-y-auto bg-white dark:bg-[#1c1c1c] text-zinc-800 dark:text-white shadow-xl`}
                onPointerDownCapture={(e) => e.stopPropagation()}
              >
                {TEXT_MODELS.map((m) => {
                  const isSelected = m.id === selectedModel.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`nodrag group w-full h-[52px] text-base rounded-xl p-2 transition-all duration-200 flex items-center gap-2 cursor-pointer ${
                        isSelected ? "bg-zinc-100 dark:bg-white/[0.06] text-zinc-900 dark:text-white" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onModelChange(m.id);
                        setShowModelPicker(false);
                      }}
                    >
                      <div className="h-full aspect-square rounded-md bg-zinc-100 dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                        {m.icon === "openai" ? <OpenAIIcon /> : m.icon === "deepseek" ? <DeepSeekIcon /> : <GeminiIcon />}
                      </div>

                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{m.name}</span>
                        <span className="text-[11px] text-zinc-500">{m.descKey ? tm(m.descKey) : ""}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: credits */}
        <div className="flex items-center gap-1">
          <CreditsPill credits={discountedCredits > 0 ? String(discountedCredits) : "–"} originalCredits={discountPct > 0 && credits > 0 ? String(credits) : undefined} onSend={() => { onGenerate(); setExpanded(false); }} disabled={isGenerating || !prompt.trim()} loading={isGenerating} />
        </div>
      </div>
    </PanelShell>
  );
}
