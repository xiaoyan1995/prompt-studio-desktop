"use client";

import { memo, useState, useCallback } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { NodeData } from "@/types/canvas";
import { useCanvasStore } from "@/stores/canvas-store";

const GROUP_COLORS = [
  "#6b7280", "#ef4444", "#f97316", "#eab308",
  "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899",
];

function GroupNodeComponent({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(String(data.label ?? "组合"));
  const color = String((data as NodeData).groupColor ?? "#6b7280");

  const handleTitleBlur = useCallback(() => {
    setEditingTitle(false);
    if (titleValue.trim()) updateNodeData(id, { label: titleValue.trim() });
  }, [id, titleValue, updateNodeData]);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={150}
        lineStyle={{ display: "none" }}
        handleStyle={{ borderColor: color, backgroundColor: color, width: 8, height: 8 }}
      />
      <div
        className="w-full h-full rounded-xl"
        style={{
          border: selected ? `1.5px solid ${color}` : `1.5px dashed ${color}30`,
          boxShadow: selected ? `0 0 0 1px ${color}, 0 0 16px ${color}50, 0 0 32px ${color}20` : "none",
          backgroundColor: `${color}08`,
          contain: "layout style",
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3 rounded-t-xl"
          style={{ height: 36, backgroundColor: `${color}12` }}
        >
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          {editingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => { if (e.key === "Enter") handleTitleBlur(); }}
              className="bg-transparent text-sm font-medium text-white/80 outline-none border-none w-full nodrag"
            />
          ) : (
            <span
              className="text-sm font-medium text-white/70 truncate cursor-text nodrag"
              onDoubleClick={() => setEditingTitle(true)}
            >
              {String(data.label ?? "组合")}
            </span>
          )}
        </div>
      </div>
    </>
  );
}

export const GroupNode = memo(GroupNodeComponent);
