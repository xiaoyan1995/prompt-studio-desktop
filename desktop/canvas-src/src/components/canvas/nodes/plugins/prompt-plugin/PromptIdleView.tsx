"use client";

import { memo, useState } from "react";
import { useTranslations } from "next-intl";
import { NodeResizeControl, ResizeControlVariant } from "@xyflow/react";
import type { Editor } from "@tiptap/react";
import { NODE_TYPE_CONFIGS } from "@/types/canvas";
import { TipTapEditor } from "../../TipTapEditor";
import { ICON_MAP } from "../../node-constants";
import type { IdleViewProps } from "../../plugin-types";

const ERR_KEYS = new Set([
  "errContentSafety",
  "errBadParams",
  "errInsufficientBalance",
  "errConcurrency",
  "errTimeout",
  "errConnectionLost",
  "errRateLimit",
  "errGenericFailed",
]);

export const PromptIdleView = memo(function PromptIdleView({
  id,
  data,
  selected,
  soloSelected,
  updaters,
}: IdleViewProps) {
  const t = useTranslations("canvas");
  const config = NODE_TYPE_CONFIGS.prompt;
  const Icon = ICON_MAP.prompt;

  const [titleValue, setTitleValue] = useState(String(data.label ?? config?.label ?? ""));
  const [editingTitle, setEditingTitle] = useState(false);

  const textContent = String(data.content ?? "");

  const handleEditorReady = (e: Editor) => {
    window.dispatchEvent(
      new CustomEvent("xinyu:prompt-editor-ready", {
        detail: { nodeId: id, editor: e },
      }),
    );
  };

  return (
    <div className="relative flex flex-col" style={{ width: "100%", height: "100%", contain: "layout style" }}>
      {selected && (
        <NodeResizeControl
          position="bottom-right"
          variant={ResizeControlVariant.Handle}
          minWidth={240}
          minHeight={140}
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

      <div
        className="flex items-center gap-1.5 mb-1 px-0.5 text-zinc-400/70 overflow-hidden whitespace-nowrap"
        onClick={() => {
          if (selected && !editingTitle) setEditingTitle(true);
        }}
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
          <span className="text-sm truncate cursor-default">
            {titleValue || config?.label || t("untitled")}
          </span>
        )}
      </div>

      <div
        className={`rounded-xl border flex-1 flex flex-col overflow-hidden ${
          selected ? "border-zinc-400 dark:border-zinc-600" : "border-zinc-200 dark:border-zinc-800/50"
        } bg-white dark:bg-[#1c1c1c]`}
        style={{
          contentVisibility: "auto",
        }}
      >
        <div
          className="flex-1 overflow-y-auto"
        >
          {soloSelected ? (
            <TipTapEditor
              content={textContent}
              onUpdate={(html) => updaters.updateData({ content: html })}
              onEditorReady={handleEditorReady}
              placeholder={t("startCreating")}
              editable
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

        {data.status &&
          String(data.status) !== "idle" &&
          String(data.status) !== "succeeded" && (
            <div className="flex items-center gap-1.5 px-3 py-2 text-[10px] border-t border-zinc-800">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  String(data.status) === "running"
                    ? "bg-yellow-400"
                    : String(data.status) === "failed"
                      ? "bg-red-400"
                      : "bg-zinc-500"
                }`}
              />
              <span
                className={
                  String(data.status) === "failed" ? "text-red-400" : "text-zinc-400"
                }
              >
                {String(data.status) === "running"
                  ? t("generating")
                  : String(data.status) === "failed"
                    ? data.errorMessage
                      ? ERR_KEYS.has(String(data.errorMessage))
                        ? t(String(data.errorMessage))
                        : String(data.errorMessage)
                      : t("failed")
                    : String(data.status) === "queued"
                      ? t("queued")
                      : ""}
              </span>
            </div>
          )}
      </div>
    </div>
  );
});
