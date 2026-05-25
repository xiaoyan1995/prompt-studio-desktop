"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useStore } from "@xyflow/react";
import type { Editor } from "@tiptap/react";
import { Settings2, Trash2 } from "lucide-react";
import { usePricingPromo, applyDiscount } from "@/hooks/use-pricing-promo";
import { PromptEditor, type RefSuggestion } from "../../PromptEditor";
import {
  CreditsPill,
  GeminiIcon,
  PanelShell,
  TEXT_MODELS,
  useAutoFlip,
  useClickOutside,
} from "../../panel-shared";
import { useCanvasStore } from "@/stores/canvas-store";
import type { ActiveViewProps } from "../../plugin-types";
import {
  PROMPT_MODE_PRESETS,
  normalizePromptModeId,
  type PromptModePreset,
} from "./prompt-modes";
import {
  buildCompactEnhancedPrompt,
  type PromptEnhancerRuleLevel,
} from "./prompt-enhancer";

const zoomSelector = (s: { transform: [number, number, number] }) => s.transform[2];

function toErrorKey(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("safety") || lower.includes("blocked") || lower.includes("content policy")) return "errContentSafety";
  if (lower.includes("insufficient_balance") || lower.includes("余额不足")) return "errInsufficientBalance";
  if (lower.includes("concurrency")) return "errConcurrency";
  if (lower.includes("timeout") || lower.includes("timed out")) return "errTimeout";
  if (lower.includes("sse connection lost")) return "errConnectionLost";
  if (lower.includes("rate limit") || lower.includes("too many requests")) return "errRateLimit";
  return "errGenericFailed";
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim();
}

function resolvePromptTextFromJson({
  promptJson,
  fallbackText,
  textNodes,
}: {
  promptJson: unknown;
  fallbackText: string;
  textNodes: Array<{ id: string; label: string; content: string }>;
}): string {
  const doc = promptJson as { content?: unknown[] } | null | undefined;
  if (!doc || !Array.isArray(doc.content)) return fallbackText;

  const textIdMap = new Map(
    textNodes.map((tn) => [tn.id, stripHtml(String(tn.content ?? ""))]),
  );

  const walk = (node: any): string => {
    if (!node) return "";
    if (node.type === "text") return String(node.text ?? "");
    if (node.type === "hardBreak") return "\n";
    if ((node.type === "refMention" || node.type === "mention") && node.attrs) {
      const label = String(node.attrs.label ?? node.attrs.id ?? "");
      const mentionId = String(node.attrs.id ?? "");
      const refType = String(node.attrs.refType ?? "");
      if (refType === "text" || mentionId.startsWith("text-")) {
        const nodeId = mentionId.startsWith("text-") ? mentionId.slice(5) : mentionId;
        return textIdMap.get(nodeId) ?? `@${label}`;
      }
      return `@${label}`;
    }
    if (Array.isArray(node.content)) return node.content.map(walk).join("");
    return "";
  };

  const text = doc.content.map(walk).join("\n").trim();
  return text || fallbackText;
}

function formatInputRange(min: number, max: number): string {
  if (max <= 0) return "0";
  if (min === max) return String(max);
  return `${min}-${max}`;
}

type PromptMaterialType = "image" | "video" | "audio";

interface PromptMaterialNote {
  id: string;
  type: PromptMaterialType;
  note: string;
}

const MATERIAL_MAX_COUNT: Record<PromptMaterialType, number> = {
  image: 9,
  video: 3,
  audio: 3,
};
const MATERIAL_MAX_TOTAL = 12;

function createMaterialNoteId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `material-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parsePromptMaterialNotes(value: unknown): PromptMaterialNote[] {
  if (!Array.isArray(value)) return [];
  const parsed = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as { id?: unknown; type?: unknown; note?: unknown };
      const type = raw.type;
      if (type !== "image" && type !== "video" && type !== "audio") return null;
      const id = typeof raw.id === "string" && raw.id.trim() ? raw.id : createMaterialNoteId();
      return {
        id,
        type,
        note: typeof raw.note === "string" ? raw.note : "",
      } satisfies PromptMaterialNote;
    })
    .filter((item): item is PromptMaterialNote => !!item);
  const counts: Record<PromptMaterialType, number> = { image: 0, video: 0, audio: 0 };
  const normalized: PromptMaterialNote[] = [];
  for (const item of parsed) {
    if (normalized.length >= MATERIAL_MAX_TOTAL) break;
    if (counts[item.type] >= MATERIAL_MAX_COUNT[item.type]) continue;
    counts[item.type] += 1;
    normalized.push(item);
  }
  return normalized;
}

function countMaterialByType(items: PromptMaterialNote[], type: PromptMaterialType): number {
  return items.reduce((acc, item) => (item.type === type ? acc + 1 : acc), 0);
}

function buildMaterialNotesFromPreset(preset: PromptModePreset): PromptMaterialNote[] {
  const entries: PromptMaterialNote[] = [];
  const imageCount = Math.max(0, Math.min(MATERIAL_MAX_COUNT.image, preset.inputs.images.min));
  const videoCount = Math.max(0, Math.min(MATERIAL_MAX_COUNT.video, preset.inputs.videos.min));
  const audioCount = Math.max(0, Math.min(MATERIAL_MAX_COUNT.audio, preset.inputs.audios.min));

  for (let i = 0; i < imageCount; i += 1) {
    entries.push({ id: createMaterialNoteId(), type: "image", note: "" });
  }
  for (let i = 0; i < videoCount; i += 1) {
    entries.push({ id: createMaterialNoteId(), type: "video", note: "" });
  }
  for (let i = 0; i < audioCount; i += 1) {
    entries.push({ id: createMaterialNoteId(), type: "audio", note: "" });
  }
  return entries;
}

function applyMaterialCount(
  items: PromptMaterialNote[],
  type: PromptMaterialType,
  targetCount: number,
): PromptMaterialNote[] {
  let safeTarget = Math.max(0, Math.min(MATERIAL_MAX_COUNT[type], targetCount));
  const current = countMaterialByType(items, type);
  if (safeTarget === current) return items;

  if (safeTarget > current) {
    const maxByTotal = Math.max(0, MATERIAL_MAX_TOTAL - (items.length - current));
    safeTarget = Math.min(safeTarget, maxByTotal);
    if (safeTarget <= current) return items;
    const appended = Array.from({ length: safeTarget - current }, () => ({
      id: createMaterialNoteId(),
      type,
      note: "",
    }));
    return [...items, ...appended];
  }

  let remove = current - safeTarget;
  const next = [...items];
  for (let i = next.length - 1; i >= 0 && remove > 0; i -= 1) {
    if (next[i].type === type) {
      next.splice(i, 1);
      remove -= 1;
    }
  }
  return next;
}

function ensureRequiredMentions(text: string, requiredMentions: string[]): string {
  if (!text.trim() || requiredMentions.length === 0) return text;
  const missing = requiredMentions.filter((token) => token && !text.includes(token));
  if (missing.length === 0) return text;
  return `${missing.join(" ")}\n${text}`.trim();
}

export function PromptActiveView({ id, data, updaters, connectedRefs }: ActiveViewProps) {
  const t = useTranslations("canvas");
  const tm = useTranslations("textModels");
  const localeRaw = useLocale();
  const locale: "zh" | "en" = localeRaw.startsWith("zh") ? "zh" : "en";
  const inverseZoom = 1 / useStore(zoomSelector);

  const [expanded, setExpanded] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showModePicker, setShowModePicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isGenerating, setIsGenerating] = useState(String(data.status) === "running");
  const [outputEditorInstance, setOutputEditorInstance] = useState<Editor | null>(null);
  const [pricingMap, setPricingMap] = useState<Record<string, number>>({});

  const modelPickerRef = useRef<HTMLDivElement>(null);
  const modePickerRef = useRef<HTMLDivElement>(null);
  const [modelFlipUp, modelDropRef] = useAutoFlip(modelPickerRef, showModelPicker);
  const [modeFlipUp, modeDropRef] = useAutoFlip(modePickerRef, showModePicker);
  const abortRef = useRef<AbortController | null>(null);
  useClickOutside(modelPickerRef, showModelPicker, () => setShowModelPicker(false));
  useClickOutside(modePickerRef, showModePicker, () => setShowModePicker(false));

  useEffect(() => {
    fetch("/api/generate/text/pricing")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.pricing) setPricingMap(d.pricing);
      })
      .catch(() => {});
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { nodeId: string; editor: Editor };
      if (detail.nodeId === id) setOutputEditorInstance(detail.editor);
    };
    window.addEventListener("xinyu:prompt-editor-ready", handler);
    return () => window.removeEventListener("xinyu:prompt-editor-ready", handler);
  }, [id]);

  const modeOptions = useMemo(
    () =>
      PROMPT_MODE_PRESETS.map((preset) => {
        const imageRange = formatInputRange(preset.inputs.images.min, preset.inputs.images.max);
        const videoRange = formatInputRange(preset.inputs.videos.min, preset.inputs.videos.max);
        const audioRange = formatInputRange(preset.inputs.audios.min, preset.inputs.audios.max);
        return {
          value: preset.id,
          label: t(preset.labelKey),
          guide: t(preset.guideKey),
          recipe: t(preset.recipeKey),
          inputSummary: t("promptModeInputSummary", {
            images: imageRange,
            videos: videoRange,
            audios: audioRange,
          }),
          preset,
        };
      }),
    [t],
  );

  const normalizedModeValue = normalizePromptModeId(data.promptMode);
  useEffect(() => {
    if (data.promptMode !== normalizedModeValue) {
      updaters.updateData({ promptMode: normalizedModeValue });
    }
  }, [data.promptMode, normalizedModeValue, updaters]);

  const selectedMode = modeOptions.find((m) => m.value === normalizedModeValue) ?? modeOptions[0];
  const selectedPreset = selectedMode.preset;
  const selectedModeLabel = selectedMode.label;
  const modeGuide = selectedMode.guide;
  const modeRecipe = selectedMode.recipe;
  const modeInputSummary = selectedMode.inputSummary;
  const ruleLevel: PromptEnhancerRuleLevel = data.promptRuleLevel === "full" ? "full" : "lite";

  const instructionPrompt = String(data.prompt ?? "");
  const negative = String(data.promptNegative ?? "");
  const materialNotes = useMemo(
    () => parsePromptMaterialNotes(data.promptMaterialNotes),
    [data.promptMaterialNotes],
  );

  const materialRows = useMemo(() => {
    const counters: Record<PromptMaterialType, number> = { image: 0, video: 0, audio: 0 };
    return materialNotes.map((item) => {
      counters[item.type] += 1;
      const index = counters[item.type];
      if (item.type === "image") {
        return {
          ...item,
          label: t("promptMaterialAliasImage", { n: index }),
          placeholder: t("promptMaterialPlaceholderImage"),
        };
      }
      if (item.type === "video") {
        return {
          ...item,
          label: t("promptMaterialAliasVideo", { n: index }),
          placeholder: t("promptMaterialPlaceholderVideo"),
        };
      }
      return {
        ...item,
        label: t("promptMaterialAliasAudio", { n: index }),
        placeholder: t("promptMaterialPlaceholderAudio"),
      };
    });
  }, [materialNotes, t]);

  const materialUsageText = useMemo(
    () =>
      materialRows
        .map((item) => ({ label: item.label, note: item.note.trim() }))
        .filter((item) => item.note.length > 0)
        .map((item) => `${item.label}: ${item.note}`)
        .join("\n"),
    [materialRows],
  );
  const materialCounts = useMemo(
    () => ({
      image: countMaterialByType(materialNotes, "image"),
      video: countMaterialByType(materialNotes, "video"),
      audio: countMaterialByType(materialNotes, "audio"),
    }),
    [materialNotes],
  );
  const materialTotalCount = materialCounts.image + materialCounts.video + materialCounts.audio;

  const modelId = String(data.model_id || selectedPreset.defaultModelId);
  const selectedModel =
    TEXT_MODELS.find((m) => m.id === modelId) || TEXT_MODELS[0];
  const credits = pricingMap[selectedModel.id] ?? 0;
  const { discountPct } = usePricingPromo(selectedModel.id);
  const discountedCredits = applyDiscount(credits, discountPct);

  const updateMaterialNotes = useCallback(
    (next: PromptMaterialNote[]) => {
      updaters.updateData({ promptMaterialNotes: parsePromptMaterialNotes(next) });
    },
    [updaters],
  );

  const handleAdjustMaterialCount = useCallback(
    (type: PromptMaterialType, delta: number) => {
      const nextCount = materialCounts[type] + delta;
      updateMaterialNotes(applyMaterialCount(materialNotes, type, nextCount));
    },
    [materialCounts, materialNotes, updateMaterialNotes],
  );

  const handleChangeMaterial = useCallback(
    (id: string, note: string) => {
      updateMaterialNotes(materialNotes.map((item) => (item.id === id ? { ...item, note } : item)));
    },
    [materialNotes, updateMaterialNotes],
  );

  const handleDeleteMaterial = useCallback(
    (id: string) => {
      updateMaterialNotes(materialNotes.filter((item) => item.id !== id));
    },
    [materialNotes, updateMaterialNotes],
  );

  const suggestions = useMemo<RefSuggestion[]>(() => {
    const imageSuggestions = connectedRefs.images.map((url, i) => ({
      id: `img-${i + 1}`,
      label: t("mentionImage", { n: i + 1 }),
      type: "image" as const,
      thumbnailUrl: connectedRefs.thumbnails[i] ?? url,
    }));
    const videoSuggestions = connectedRefs.videos.map((url, i) => ({
      id: `video-${i + 1}`,
      label: t("mentionVideo", { n: i + 1 }),
      type: "video" as const,
      thumbnailUrl: url,
    }));
    const textSuggestions = connectedRefs.textNodes.map((node, i) => ({
      id: `text-${node.id}`,
      label: t("mentionText", { n: i + 1 }),
      type: "text" as const,
      preview: stripHtml(node.content ?? ""),
    }));
    return [...imageSuggestions, ...videoSuggestions, ...textSuggestions];
  }, [
    connectedRefs.images,
    connectedRefs.thumbnails,
    connectedRefs.videos,
    connectedRefs.textNodes,
    t,
  ]);

  const mediaPayload = useMemo(
    () => [
      ...(selectedPreset.inputs.images.enabled && materialCounts.image > 0
        ? connectedRefs.images
            .slice(0, Math.min(materialCounts.image, MATERIAL_MAX_COUNT.image))
            .map((url) => ({ url, type: "image" as const }))
        : []),
      ...(selectedPreset.inputs.videos.enabled && materialCounts.video > 0
        ? connectedRefs.videos
            .slice(0, Math.min(materialCounts.video, MATERIAL_MAX_COUNT.video))
            .map((url) => ({ url, type: "video" as const }))
        : []),
    ],
    [connectedRefs.images, connectedRefs.videos, materialCounts.image, materialCounts.video, selectedPreset],
  );

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;

    const resolvedInstruction = resolvePromptTextFromJson({
      promptJson: data.prompt_json,
      fallbackText: instructionPrompt,
      textNodes: connectedRefs.textNodes,
    }).trim();

    if (!resolvedInstruction && !negative.trim() && !materialUsageText.trim()) return;
    const requiredMentions = Array.from(
      new Set(
        (`${resolvedInstruction}\n${materialUsageText}`.match(/@[^\s,，。;；:：()\[\]{}<>]+/g) ?? []),
      ),
    );

    const promptForModel = buildCompactEnhancedPrompt({
      locale,
      ruleLevel,
      modeLabel: selectedModeLabel,
      modeGuide,
      modeRecipe,
      inputSummary: modeInputSummary,
      materialUsages: materialUsageText.trim(),
      requiredMentions,
      instruction: resolvedInstruction,
      negative: negative.trim(),
    });

    setIsGenerating(true);
    updaters.updateData({
      status: "running",
      errorMessage: undefined,
      model_id: selectedModel.id,
    });
    if (outputEditorInstance) outputEditorInstance.commands.clearContent();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/generate/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel.id,
          prompt: promptForModel,
          media: mediaPayload.length > 0 ? mediaPayload : undefined,
          projectId: useCanvasStore.getState().projectId,
          nodeId: id,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;

          try {
            const parsed = JSON.parse(payload) as { text?: string };
            if (parsed.text && accumulated.length < 3000) {
              accumulated += parsed.text;
              if (accumulated.length > 3000) accumulated = accumulated.slice(0, 3000);
              updaters.updateData({ content: accumulated });
              if (outputEditorInstance) outputEditorInstance.commands.setContent(accumulated);
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }

      const finalized = ensureRequiredMentions(accumulated, requiredMentions);
      updaters.updateData({ content: finalized, status: "succeeded" });
      if (outputEditorInstance) outputEditorInstance.commands.setContent(finalized);
      window.dispatchEvent(new Event("xinyu:balance-changed"));
      window.dispatchEvent(new Event("xinyu:save-now"));
      setExpanded(false);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        updaters.updateData({ status: "idle" });
      } else {
        const errKey = err instanceof Error ? toErrorKey(err.message) : "errGenericFailed";
        updaters.updateData({ status: "failed", errorMessage: errKey });
        window.dispatchEvent(new Event("xinyu:balance-changed"));
        window.dispatchEvent(new Event("xinyu:save-now"));
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [
    connectedRefs.textNodes,
    data.prompt_json,
    instructionPrompt,
    isGenerating,
    locale,
    mediaPayload,
    modeGuide,
    modeInputSummary,
    modeRecipe,
    materialUsageText,
    negative,
    outputEditorInstance,
    selectedModeLabel,
    selectedModel.id,
    ruleLevel,
    updaters,
  ]);
  const hasPromptInput =
    instructionPrompt.trim().length > 0 ||
    negative.trim().length > 0 ||
    materialUsageText.trim().length > 0;
  const sendDisabled = isGenerating || !hasPromptInput;

  return (
    <PanelShell
      inverseZoom={inverseZoom}
      expanded={expanded}
      onExpand={() => setExpanded(true)}
      onCollapse={() => setExpanded(false)}
    >

      <div className="px-2 pt-0.5 pb-1">
        <PromptEditor
          content={instructionPrompt}
          contentJson={data.prompt_json}
          onChange={(text, json) => updaters.updateData({ prompt: text, prompt_json: json })}
          suggestions={suggestions}
          placeholder={t("promptNodeBasePlaceholder")}
          style={{
            minHeight: expanded ? 200 : 88,
            maxHeight: expanded ? "calc(80vh - 220px)" : 142,
          }}
        />
      </div>

      <div className="flex items-center justify-between w-full p-2 h-14">
        <div className="flex items-center gap-1">
          <div className="relative" ref={modelPickerRef}>
            <button
              className={`nodrag flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 transition-colors text-zinc-300 ${
                showModelPicker ? "bg-zinc-800" : ""
              }`}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                setShowModePicker(false);
                setShowModelPicker(!showModelPicker);
              }}
            >
              <GeminiIcon />
              <span className="whitespace-nowrap">{selectedModel.name}</span>
            </button>

            {showModelPicker && (
              <div
                ref={modelDropRef}
                className={`absolute ${
                  modelFlipUp ? "bottom-full mb-2" : "top-full mt-2"
                } left-0 w-80 rounded-[20px] border border-zinc-700/60 p-1.5 z-30 nodrag nowheel max-h-[400px] overflow-y-auto`}
                style={{ background: "#1c1c1c" }}
                onPointerDownCapture={(e) => e.stopPropagation()}
              >
                {TEXT_MODELS.map((m) => {
                  const isSelected = m.id === selectedModel.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`nodrag group w-full h-[52px] text-base rounded-xl p-2 transition-all duration-200 flex items-center gap-2 cursor-pointer ${
                        isSelected ? "bg-white/[0.06]" : "hover:bg-zinc-800"
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        updaters.updateData({ model_id: m.id });
                        setShowModelPicker(false);
                      }}
                    >
                      <div className="h-full aspect-square rounded-md bg-white/[0.06] flex items-center justify-center shrink-0">
                        <GeminiIcon />
                      </div>
                      <div className="flex-1 h-full flex flex-col justify-start gap-1 overflow-hidden">
                        <span
                          className={`font-medium text-sm text-zinc-200 leading-none flex items-center gap-2 transition-transform duration-200 ${
                            isSelected
                              ? "translate-y-0"
                              : "translate-y-[10px] group-hover:translate-y-0"
                          }`}
                        >
                          <span className="truncate">{m.name}</span>
                        </span>
                        <p
                          className={`text-xs text-zinc-500 leading-none truncate transition-all duration-200 text-left ${
                            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          }`}
                        >
                          {m.descKey ? tm(m.descKey) : ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="w-px h-5 bg-zinc-700 mx-0.5" />

          <div className="relative" ref={modePickerRef}>
            <button
              className={`nodrag flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 transition-colors text-zinc-300 ${
                showModePicker ? "bg-zinc-800" : ""
              }`}
              title={modeGuide}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                setShowModelPicker(false);
                setShowModePicker(!showModePicker);
              }}
            >
              <span className="text-[11px] text-zinc-500">{t("promptNodeMode")}</span>
              <span className="whitespace-nowrap">{selectedModeLabel}</span>
            </button>

            {showModePicker && (
              <div
                ref={modeDropRef}
                className={`absolute ${
                  modeFlipUp ? "bottom-full mb-2" : "top-full mt-2"
                } left-0 w-72 rounded-[20px] border border-zinc-700/60 p-1.5 z-30 nodrag nowheel max-h-[360px] overflow-y-auto`}
                style={{ background: "#1c1c1c" }}
                onPointerDownCapture={(e) => e.stopPropagation()}
              >
                {modeOptions.map((mode) => {
                  const isSelected = mode.value === normalizedModeValue;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      className={`nodrag w-full rounded-xl p-2.5 transition-colors text-left ${
                        isSelected ? "bg-white/[0.06]" : "hover:bg-zinc-800"
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        updaters.updateData({
                          promptMode: mode.value,
                          model_id: mode.preset.defaultModelId,
                          promptMaterialNotes: buildMaterialNotesFromPreset(mode.preset),
                        });
                        setShowModePicker(false);
                      }}
                    >
                      <div className="text-sm text-zinc-200 truncate">{mode.label}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                        {mode.guide}
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-0.5 leading-relaxed">
                        {mode.recipe}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">{mode.inputSummary}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-zinc-700" />
          <button
            className="nodrag flex items-center justify-center rounded-lg px-2.5 py-2.5 hover:bg-zinc-800 active:bg-white/[0.1] transition-colors"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              e.preventDefault();
              setShowAdvanced((v) => {
                if (!v) {
                  setShowModelPicker(false);
                  setShowModePicker(false);
                }
                return !v;
              });
            }}
          >
            <Settings2 size={16} className={showAdvanced ? "text-white" : "text-zinc-300"} />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <CreditsPill
            credits={discountedCredits > 0 ? String(discountedCredits) : "–"}
            originalCredits={discountPct > 0 && credits > 0 ? String(credits) : undefined}
            onSend={handleGenerate}
            disabled={sendDisabled}
            loading={isGenerating}
          />
        </div>
      </div>

      <div className={`nodrag overflow-hidden transition-all duration-300 ${showAdvanced ? "max-h-[640px]" : "max-h-0"}`}>
        <div className="px-2 pb-2">
          <div className="text-[11px] text-zinc-500 mb-1.5">{t("promptEnhanceRuleLevelLabel")}</div>
          <div className="inline-flex rounded-md border border-zinc-700 bg-white/[0.03] p-0.5 mb-2">
            <button
              type="button"
              className={`nodrag h-7 px-3 rounded text-xs transition-colors ${
                ruleLevel === "lite"
                  ? "bg-white/[0.12] text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
              }`}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                updaters.updateData({ promptRuleLevel: "lite" });
              }}
            >
              {t("promptEnhanceRuleLite")}
            </button>
            <button
              type="button"
              className={`nodrag h-7 px-3 rounded text-xs transition-colors ${
                ruleLevel === "full"
                  ? "bg-white/[0.12] text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
              }`}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                updaters.updateData({ promptRuleLevel: "full" });
              }}
            >
              {t("promptEnhanceRuleFull")}
            </button>
          </div>
          <div className="text-[10px] text-zinc-600 mb-2">
            {ruleLevel === "full"
              ? t("promptEnhanceRuleFullHint")
              : t("promptEnhanceRuleLiteHint")}
          </div>

          <div className="text-[11px] text-zinc-500 mb-1.5">{t("promptMaterialUsageTitle")}</div>
          <div className="flex items-center gap-2 mb-2">
            <button
              className="nodrag h-8 px-3 rounded-md border border-zinc-700 bg-white/[0.03] text-xs text-zinc-200 hover:bg-white/[0.08] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={materialCounts.image >= MATERIAL_MAX_COUNT.image || materialTotalCount >= MATERIAL_MAX_TOTAL}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAdjustMaterialCount("image", 1);
              }}
            >
              {t("promptMaterialCountImage")} {materialCounts.image}
            </button>
            <button
              className="nodrag h-8 px-3 rounded-md border border-zinc-700 bg-white/[0.03] text-xs text-zinc-200 hover:bg-white/[0.08] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={materialCounts.video >= MATERIAL_MAX_COUNT.video || materialTotalCount >= MATERIAL_MAX_TOTAL}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAdjustMaterialCount("video", 1);
              }}
            >
              {t("promptMaterialCountVideo")} {materialCounts.video}
            </button>
            <button
              className="nodrag h-8 px-3 rounded-md border border-zinc-700 bg-white/[0.03] text-xs text-zinc-200 hover:bg-white/[0.08] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={materialCounts.audio >= MATERIAL_MAX_COUNT.audio || materialTotalCount >= MATERIAL_MAX_TOTAL}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                handleAdjustMaterialCount("audio", 1);
              }}
            >
              {t("promptMaterialCountAudio")} {materialCounts.audio}
            </button>
          </div>

          {materialRows.length === 0 && (
            <div className="text-[10px] text-zinc-600 mb-2">{t("promptMaterialUsageEmpty")}</div>
          )}

          <div className="space-y-2 mb-3">
            {materialRows.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <div
                  className={`text-[11px] w-14 shrink-0 ${item.type === "image" ? "text-violet-400" : item.type === "video" ? "text-sky-400" : "text-emerald-400"}`}
                >
                  {item.label}
                </div>
                <input
                  className="nodrag nowheel flex-1 h-8 rounded-md bg-white/[0.04] border border-zinc-700 px-2 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-zinc-500 focus:bg-white/[0.06] transition-colors"
                  placeholder={item.placeholder}
                  value={item.note}
                  onChange={(e) => handleChangeMaterial(item.id, e.target.value)}
                  onPointerDownCapture={(e) => e.stopPropagation()}
                />
                <button
                  className="nodrag size-8 rounded-md border border-zinc-700 bg-white/[0.03] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08] transition-colors flex items-center justify-center"
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleDeleteMaterial(item.id);
                  }}
                  title={t("delete")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="text-[11px] text-zinc-500 mb-1">{t("promptNodeNegative")}</div>
          <input
            className="nodrag nowheel w-full h-8 rounded-md bg-white/[0.04] border border-zinc-700 px-2 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-zinc-500 focus:bg-white/[0.06] transition-colors"
            placeholder={t("promptNodeNegativePlaceholder")}
            value={negative}
            onChange={(e) => updaters.updateData({ promptNegative: e.target.value })}
            onPointerDownCapture={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    </PanelShell>
  );
}
