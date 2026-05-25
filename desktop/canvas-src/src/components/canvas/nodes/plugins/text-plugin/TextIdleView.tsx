"use client";

import { memo, useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { NodeResizeControl, ResizeControlVariant } from "@xyflow/react";
import type { Editor } from "@tiptap/react";
import { NODE_TYPE_CONFIGS } from "@/types/canvas";
import { TipTapEditor } from "../../TipTapEditor";
import { ICON_MAP } from "../../node-constants";
import type { IdleViewProps } from "../../plugin-types";

const ERR_KEYS = new Set([
  "errContentSafety", "errBadParams", "errInsufficientBalance",
  "errConcurrency", "errTimeout", "errConnectionLost",
  "errRateLimit", "errGenericFailed",
]);

export const TextIdleView = memo(function TextIdleView({ id, data, selected, soloSelected, updaters }: IdleViewProps) {
  const t = useTranslations("canvas");
  const config = NODE_TYPE_CONFIGS["text"];
  const Icon = ICON_MAP["text"];

  const [titleValue, setTitleValue] = useState(String(data.label ?? config?.label ?? ""));
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingContent, setEditingContent] = useState(false);

  useEffect(() => {
    if (!soloSelected) setEditingContent(false);
  }, [soloSelected]);

  const textContent = String(data.content ?? "");

  const handleEditorReady = useCallback((e: Editor) => {
    window.dispatchEvent(new CustomEvent("xinyu:text-editor-ready", { detail: { nodeId: id, editor: e } }));
  }, [id]);

  return (
    <div className="relative flex flex-col" style={{ width: "100%", height: "100%", contain: "layout style" }}>
      {selected && (
        <NodeResizeControl
          position="bottom-right"
          variant={ResizeControlVariant.Handle}
          minWidth={200}
          minHeight={120}
          onResizeEnd={(_event, params) => {
            updaters.updateSize(params.width, params.height);
          }}
          className="xinyu-text-resize-control"
          style={{
            ["--xinyu-arc-color" as string]: "rgba(255,255,255,0.9)",
            width: 24,
            height: 24,
            background: "transparent",
            border: "none",
            borderRadius: 0,
            overflow: "visible",
            zIndex: 1001,
          }}
        >
          <div className="xinyu-text-resize-arc" />
        </NodeResizeControl>
      )}

      {/* Floating title above card (matches image node pattern) */}
      <div
        className="absolute -translate-y-full left-1 -top-0 pb-2 w-full text-zinc-400/70 overflow-hidden whitespace-nowrap flex items-center gap-1.5"
        onClick={() => { if (selected && !editingTitle) setEditingTitle(true); }}
      >
        <Icon size={14} className="shrink-0" />
        {editingTitle && selected ? (
          <input
            autoFocus
            className="bg-transparent text-sm text-zinc-400 border-none outline-none p-0 w-full placeholder:text-zinc-600 nodrag nowheel"
            placeholder={t("enterTitle")}
            value={titleValue}
            onChange={(e) => {
              setTitleValue(e.target.value);
              updaters.updateData({ label: e.target.value });
            }}
            onPointerDownCapture={(e) => e.stopPropagation()}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") setEditingTitle(false);
            }}
          />
        ) : (
          <span className="text-sm truncate cursor-default">{titleValue || config?.label || t("untitled")}</span>
        )}
      </div>

      {/* Card body */}
      <div
        className={`rounded-xl border flex-1 flex flex-col overflow-hidden ${
          selected ? "border-zinc-400 dark:border-zinc-600" : "border-zinc-200 dark:border-zinc-800/50"
        } bg-white dark:bg-[#1c1c1c]`}
        style={{ contentVisibility: "auto" }}
      >
        <div
          className="flex-1 overflow-y-auto"
          onClick={() => { if (soloSelected && !editingContent) setEditingContent(true); }}
        >
          {soloSelected ? (
            <TipTapEditor
              content={textContent}
              onUpdate={(html) => updaters.updateData({ content: html })}
              onEditorReady={handleEditorReady}
              placeholder={t("startCreating")}
              editable={editingContent}
            />
          ) : (
            <div className="flex flex-col w-full h-full min-h-0 relative p-3 px-4 cursor-default">
              {textContent ? (
                <div
                  className="xinyu-text-preview"
                  dangerouslySetInnerHTML={{ __html: textContent }}
                />
              ) : (
                <p className="text-zinc-500 text-sm">{t("startCreating")}</p>
              )}
            </div>
          )}
        </div>

        {/* Status indicators moved to NodeShell overlays (MeteorShowerOverlay for running/queued, FailedOverlay for failed) */}
      </div>
    </div>
  );
});
