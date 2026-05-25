"use client";

import { useState, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { ImageIcon, VideoIcon } from "lucide-react";
import {
  useClickOutside,
  useAutoFlip,
  PanelShell,
  CreditsPill,
  GeminiIcon,
  TEXT_MODELS,
  RefThumb,
} from "../../panel-shared";
import { PromptEditor } from "../../PromptEditor";
import type { RefSuggestion } from "../../PromptEditor";
import type { ConnectedRefs } from "../../plugin-types";
import { STORYBOARD_PARSE_MODEL_ID_SET } from "@/lib/storyboard/parse-models";

function clampShots(v: number) {
  return Math.max(1, Math.min(120, Math.round(v)));
}

export function StoryboardParsePanel({
  scriptText,
  onScriptChange,
  scriptJson,
  onScriptJsonChange,
  modelId,
  onModelChange,
  directorRules,
  onDirectorRulesChange,
  maxShots,
  onMaxShotsChange,
  onParse,
  onParseImages,
  onParseVideo,
  onFillFromEdges,
  isParsing,
  hasConnectedText,
  connectedImageCount,
  connectedVideoCount,
  inverseZoom,
  connectedRefs,
}: {
  scriptText: string;
  onScriptChange: (v: string) => void;
  scriptJson?: unknown;
  onScriptJsonChange?: (json: unknown) => void;
  modelId: string;
  onModelChange: (v: string) => void;
  directorRules: string;
  onDirectorRulesChange: (value: string) => void;
  maxShots: number | null;
  onMaxShotsChange: (v: number | null) => void;
  onParse: () => void;
  onParseImages: () => void;
  onParseVideo: () => void;
  onFillFromEdges: () => void;
  isParsing: boolean;
  hasConnectedText: boolean;
  connectedImageCount: number;
  connectedVideoCount: number;
  inverseZoom: number;
  connectedRefs?: ConnectedRefs;
}) {
  const t = useTranslations("canvas");
  const tm = useTranslations("textModels");

  const [expanded, setExpanded] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  useClickOutside(modelPickerRef, showModelPicker, () => setShowModelPicker(false));
  const [modelFlipUp, modelDropRef] = useAutoFlip(modelPickerRef, showModelPicker);

  const isAutoShots = maxShots === null;
  const [shotsInput, setShotsInput] = useState(maxShots !== null ? String(maxShots) : "");
  const shotsInputRef = useRef<HTMLInputElement>(null);

  const storyboardModels = TEXT_MODELS.filter((m) => STORYBOARD_PARSE_MODEL_ID_SET.has(m.id));
  const selectedModel = storyboardModels.find((m) => m.id === modelId) || storyboardModels[0];

  const suggestions = useMemo<RefSuggestion[]>(() => {
    if (!connectedRefs) return [];
    const items: RefSuggestion[] = [];
    (connectedRefs.imageNodes ?? []).forEach((n, i) => {
      items.push({ id: n.nodeId, label: t("mentionImage", { n: i + 1 }), type: "image", thumbnailUrl: n.thumbnailUrl || n.url });
    });
    (connectedRefs.videoNodes ?? []).forEach((n, i) => {
      items.push({ id: n.nodeId, label: t("mentionVideo", { n: i + 1 }), type: "video", thumbnailUrl: n.thumbnailUrl || n.url });
    });
    (connectedRefs.textNodes ?? []).forEach((tn, idx) => {
      const preview = (tn.content || "").replace(/<[^>]*>/g, "").slice(0, 40);
      items.push({ id: `text-${tn.id}`, label: t("mentionText", { n: idx + 1 }), type: "text", preview });
    });
    return items;
  }, [connectedRefs, t]);

  return (
    <PanelShell
      inverseZoom={inverseZoom}
      expanded={expanded}
      onExpand={() => setExpanded(true)}
      onCollapse={() => setExpanded(false)}
    >
      {/* Reference image thumbnails */}
      {connectedRefs && connectedRefs.images.length > 0 && (
        <div className="flex-shrink-0 px-3 pt-3 pb-1 flex gap-1.5 items-center overflow-x-auto nowheel nodrag">
          {connectedRefs.images.map((url, i) => (
            <RefThumb key={i} src={url} label={t("mentionImage", { n: i + 1 })} />
          ))}
          <span className="text-[11px] text-zinc-500 ml-0.5 shrink-0">{connectedRefs.images.length}</span>
        </div>
      )}

      {/* Script input with @mention support */}
      <div className="relative flex flex-col flex-1 pt-1 nodrag nowheel">
        <PromptEditor
          content={scriptText}
          contentJson={scriptJson}
          onChange={(text, json) => { onScriptChange(text); onScriptJsonChange?.(json); }}
          suggestions={suggestions}
          placeholder={t("storyboardParseScriptPlaceholder")}
          style={{
            minHeight: expanded ? 200 : 80,
            maxHeight: expanded ? "calc(80vh - 200px)" : 120,
          }}
        />
      </div>

      {/* Director rules */}
      <div className="px-2 pb-1.5">
        <input
          className="nodrag nowheel w-full h-7 rounded-md bg-white/[0.04] border border-zinc-700 px-2 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-zinc-500 focus:bg-white/[0.06] transition-colors"
          placeholder={t("storyboardDirectorRulesPlaceholder")}
          value={directorRules}
          onChange={(e) => onDirectorRulesChange(e.target.value)}
          onPointerDownCapture={(e) => e.stopPropagation()}
        />
      </div>

      {/* Action bar — matches TextGenPanel: p-2 h-14 */}
      <div className="flex items-center justify-between w-full p-2 h-14">
        <div className="flex items-center gap-1">
          {/* Model picker — same as TextGenPanel */}
          <div className="relative" ref={modelPickerRef}>
            <button
              className={`nodrag flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 transition-colors text-zinc-300 ${showModelPicker ? "bg-zinc-800" : ""}`}
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => { e.preventDefault(); setShowModelPicker(!showModelPicker); }}
            >
              <GeminiIcon />
              <span className="whitespace-nowrap">{selectedModel.name}</span>
            </button>

            {showModelPicker && (
              <div
                ref={modelDropRef}
                className={`absolute ${modelFlipUp ? "bottom-full mb-2" : "top-full mt-2"} left-0 w-80 rounded-[20px] border border-zinc-700/60 p-1.5 z-30 nodrag nowheel max-h-[400px] overflow-y-auto`}
                style={{ background: "#1c1c1c" }}
                onPointerDownCapture={(e) => e.stopPropagation()}
              >
                {storyboardModels.map((m) => {
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
                        onModelChange(m.id);
                        setShowModelPicker(false);
                      }}
                    >
                      <div className="h-full aspect-square rounded-md bg-white/[0.06] flex items-center justify-center shrink-0">
                        <GeminiIcon />
                      </div>
                      <div className="flex-1 h-full flex flex-col justify-start gap-1 overflow-hidden">
                        <span className={`font-medium text-sm text-zinc-200 leading-none flex items-center gap-2 transition-transform duration-200 ${
                          isSelected ? "translate-y-0" : "translate-y-[10px] group-hover:translate-y-0"
                        }`}>
                          <span className="truncate">{m.name}</span>
                        </span>
                        <p className={`text-xs text-zinc-500 leading-none truncate transition-all duration-200 text-left ${
                          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        }`}>
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

          {/* Max shots — auto pill or bordered number input */}
          {isAutoShots ? (
            <button
              type="button"
              className="nodrag px-2 py-1.5 text-sm rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors whitespace-nowrap"
              onPointerDownCapture={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                onMaxShotsChange(20);
                setShotsInput("20");
                requestAnimationFrame(() => shotsInputRef.current?.select());
              }}
            >
              {t("storyboardShotsAuto")}
            </button>
          ) : (
            <div className="nodrag flex items-center gap-1.5">
              <input
                ref={shotsInputRef}
                type="number"
                min={1}
                max={120}
                className="nodrag nowheel w-10 h-7 rounded-md bg-white/[0.04] border border-zinc-700 text-sm text-zinc-200 text-center tabular-nums outline-none focus:border-zinc-500 focus:bg-white/[0.06] transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={shotsInput}
                onChange={(e) => setShotsInput(e.target.value)}
                onBlur={() => {
                  const raw = Number(shotsInput);
                  if (!raw || raw <= 0) {
                    onMaxShotsChange(null);
                    setShotsInput("");
                    return;
                  }
                  const v = clampShots(raw);
                  setShotsInput(String(v));
                  onMaxShotsChange(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") {
                    onMaxShotsChange(null);
                    setShotsInput("");
                  }
                }}
                onPointerDownCapture={(e) => e.stopPropagation()}
              />
              <span
                className="text-sm text-zinc-500 hover:text-zinc-300 whitespace-nowrap cursor-pointer transition-colors"
                onClick={() => { onMaxShotsChange(null); setShotsInput(""); }}
                title={t("storyboardShotsAuto")}
              >
                {t("storyboardShotsUnit")}
              </span>
            </div>
          )}

          <div className="w-px h-5 bg-zinc-700 mx-0.5" />

          {/* Fill from connected text */}
          <button
            type="button"
            className="nodrag px-2 py-1.5 text-sm rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 transition-colors"
            onClick={onFillFromEdges}
            disabled={!hasConnectedText}
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.preventDefault()}
          >
            {t("storyboardParseFromEdges")}
          </button>

          {/* Parse from connected images */}
          {connectedImageCount > 0 && (
            <>
              <div className="w-px h-5 bg-zinc-700 mx-0.5" />
              <button
                type="button"
                className="nodrag flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 transition-colors"
                onClick={() => { onParseImages(); setExpanded(false); }}
                disabled={isParsing}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.preventDefault()}
              >
                <ImageIcon size={14} />
                {t("storyboardParseFromImages", { n: connectedImageCount })}
              </button>
            </>
          )}

          {/* Parse from connected video */}
          {connectedVideoCount > 0 && (
            <>
              <div className="w-px h-5 bg-zinc-700 mx-0.5" />
              <button
                type="button"
                className="nodrag flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-30 transition-colors"
                onClick={() => { onParseVideo(); setExpanded(false); }}
                disabled={isParsing}
                onPointerDownCapture={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.preventDefault()}
              >
                <VideoIcon size={14} />
                {t("storyboardParseFromVideo")}
              </button>
            </>
          )}
        </div>

        {/* Right: send button */}
        <div className="flex items-center gap-1">
          <CreditsPill
            credits="–"
            onSend={() => { onParse(); setExpanded(false); }}
            disabled={isParsing || !scriptText.trim()}
            loading={isParsing}
          />
        </div>
      </div>
    </PanelShell>
  );
}
