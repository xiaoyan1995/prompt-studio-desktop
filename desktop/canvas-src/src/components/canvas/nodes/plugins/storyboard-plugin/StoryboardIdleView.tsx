"use client";

import { memo, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { NodeResizeControl, ResizeControlVariant } from "@xyflow/react";
import { Clapperboard } from "lucide-react";
import type { IdleViewProps } from "../../plugin-types";
import { getStoryboardState } from "@/types/storyboard";
import { ShotTable } from "./ShotTable";
import { ShotCreativeGrid } from "./ShotCreativeGrid";

const noop = () => {};

export const StoryboardIdleView = memo(function StoryboardIdleView({
  data,
  selected,
  soloSelected,
  isZoomedOut,
  updaters,
}: IdleViewProps) {
  const t = useTranslations("canvas");
  const { rows, viewMode } = getStoryboardState(data);
  const [titleValue, setTitleValue] = useState(String(data.label ?? ""));

  useEffect(() => {
    setTitleValue(String(data.label ?? ""));
  }, [data.label]);

  return (
    <div
      className={`group relative flex flex-col overflow-visible rounded-[12px] border border-zinc-200 dark:border-transparent bg-white dark:bg-[#1c1c1c] ${selected ? "ring-1 ring-zinc-400 dark:ring-zinc-600" : ""}`}
      style={{ width: "100%", height: "100%", contain: "layout style" }}
    >
      {selected && !soloSelected && (
        <NodeResizeControl
          position="bottom-right"
          variant={ResizeControlVariant.Handle}
          minWidth={280}
          minHeight={160}
          onResizeEnd={(_event, params) => {
            updaters.updateSize(params.width, params.height);
          }}
          className="xinyu-text-resize-control"
          style={{
            ["--xinyu-arc-color" as string]: "rgba(255, 255, 255, 0.9)",
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

      <div className="absolute -translate-y-full left-1 -top-0 pb-2 w-full text-zinc-400/70 overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-1">
        <span className="shrink-0 flex items-center">
          <Clapperboard size={14} className="text-zinc-400/70" />
        </span>
        <div className="flex items-center relative w-full">
          <input
            className="nodrag nowheel bg-transparent text-sm text-zinc-400 border-none outline-none p-0 w-full h-auto overflow-hidden text-ellipsis whitespace-nowrap placeholder:text-zinc-600 focus:ring-0"
            placeholder={t("enterTitle")}
            value={titleValue}
            onChange={(e) => {
              setTitleValue(e.target.value);
              updaters.updateData({ label: e.target.value });
            }}
            onPointerDownCapture={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      {!soloSelected && (
        <div className="absolute inset-0 w-full h-full rounded-[12px]">
          {rows.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Clapperboard className="text-zinc-600" size={40} strokeWidth={1.25} />
            </div>
          ) : (
            <div className="h-full w-full pointer-events-none">
              {viewMode === "creative" ? (
                <ShotCreativeGrid rows={rows} onChange={noop} />
              ) : (
                <ShotTable rows={rows} onChange={noop} preview />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
