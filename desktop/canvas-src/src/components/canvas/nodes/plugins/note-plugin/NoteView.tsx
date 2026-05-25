"use client";

import { memo, useState } from "react";
import { useTranslations } from "next-intl";
import { NodeResizeControl, ResizeControlVariant } from "@xyflow/react";
import { StickyNote } from "lucide-react";
import type { IdleViewProps } from "../../plugin-types";

export const NoteView = memo(function NoteView({ id, data, selected, updaters }: IdleViewProps) {
  const t = useTranslations("canvas");
  const [titleValue, setTitleValue] = useState(String(data.label ?? ""));
  const textContent = String(data.content ?? "");

  return (
    <div className="relative flex flex-col" style={{ width: "100%", height: "100%", contain: "layout style" }}>
      {selected && (
        <NodeResizeControl
          position="bottom-right"
          variant={ResizeControlVariant.Handle}
          minWidth={140}
          minHeight={80}
          onResizeEnd={(_event, params) => {
            updaters.updateSize(params.width, params.height);
          }}
          className="xinyu-text-resize-control"
          style={{
            ["--xinyu-arc-color" as string]: "rgba(234,179,8,0.7)",
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

      <div className="flex items-center gap-1.5 mb-1 px-0.5 text-yellow-500/60 overflow-hidden whitespace-nowrap">
        <StickyNote size={14} className="shrink-0" />
        <span className="text-sm truncate cursor-default">{titleValue || t("note")}</span>
      </div>

      <div
        className={`rounded-xl border flex-1 flex flex-col overflow-y-auto ${
          selected ? "border-yellow-600/40" : "border-yellow-900/20"
        }`}
        style={{ background: "rgba(234,179,8,0.06)", contentVisibility: "auto" }}
      >
        <textarea
          className="nodrag nowheel flex-1 w-full resize-none bg-transparent p-3 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
          placeholder={t("writeNote")}
          value={textContent}
          onChange={(e) => updaters.updateData({ content: e.target.value })}
          onPointerDownCapture={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
});
