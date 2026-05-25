"use client";

import { memo } from "react";
import { useReactFlow } from "@xyflow/react";
import { useMultiDragStore } from "@/stores/multi-drag-store";
import { useCanvasStore } from "@/stores/canvas-store";

function MultiDragLinesComponent() {
  const isDragging = useMultiDragStore((s) => s.isDragging);
  const isPinned = useMultiDragStore((s) => s.isPinned);
  const sourceNodeIds = useMultiDragStore((s) => s.sourceNodeIds);
  const cursorX = useMultiDragStore((s) => s.cursorX);
  const cursorY = useMultiDragStore((s) => s.cursorY);
  const hoveredNodeId = useMultiDragStore((s) => s.hoveredNodeId);
  const nodes = useCanvasStore((s) => s.nodes);
  const { flowToScreenPosition } = useReactFlow();

  // Show lines while dragging OR while pinned (menu open)
  if ((!isDragging && !isPinned) || sourceNodeIds.length === 0) return null;

  const lines: { sx: number; sy: number; tx: number; ty: number }[] = [];

  for (const nodeId of sourceNodeIds) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) continue;
    const w = Number(node.style?.width ?? node.width ?? 280);
    const h = Number(node.style?.height ?? node.height ?? 200);
    const handleFlowX = node.position.x + w;
    const handleFlowY = node.position.y + h / 2;
    const screen = flowToScreenPosition({ x: handleFlowX, y: handleFlowY });
    lines.push({ sx: screen.x, sy: screen.y, tx: cursorX, ty: cursorY });
  }

  // When hovering near a left handle, snap line endpoints to the handle position
  let snapTarget: { x: number; y: number } | null = null;
  if (isDragging && hoveredNodeId) {
    const hNode = nodes.find((n) => n.id === hoveredNodeId);
    if (hNode) {
      const hh = hNode.measured?.height ?? Number(hNode.style?.height ?? hNode.height ?? 200);
      // Left handle = left edge, vertical center
      const handleFlowX = hNode.position.x;
      const handleFlowY = hNode.position.y + hh / 2;
      const screenPos = flowToScreenPosition({ x: handleFlowX, y: handleFlowY });
      snapTarget = { x: screenPos.x, y: screenPos.y };
    }
  }

  return (
    <svg
      className="fixed inset-0 z-[999] pointer-events-none"
      width="100vw"
      height="100vh"
      style={{ width: "100vw", height: "100vh" }}
    >
      {lines.map((l, i) => {
        // When snapped to a handle, redirect line endpoints to the handle position
        const tx = snapTarget ? snapTarget.x : l.tx;
        const ty = snapTarget ? snapTarget.y : l.ty;
        const dx = tx - l.sx;
        const cpOffset = Math.min(Math.abs(dx) * 0.6, 150);
        const d = `M ${l.sx} ${l.sy} C ${l.sx + cpOffset} ${l.sy}, ${tx - cpOffset} ${ty}, ${tx} ${ty}`;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={snapTarget ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.35)"}
            strokeWidth={2}
            strokeDasharray={snapTarget ? "none" : "6 4"}
          />
        );
      })}
      {/* Snap indicator circle on target handle */}
      {isDragging && snapTarget && (
        <circle cx={snapTarget.x} cy={snapTarget.y} r={6} fill="rgba(59,130,246,0.8)" stroke="white" strokeWidth={2} />
      )}
      {/* Show + cursor only while actively dragging and NOT snapped */}
      {isDragging && !snapTarget && (
        <>
          <circle cx={cursorX} cy={cursorY} r={14} fill="rgba(100,100,100,0.8)" stroke="rgba(255,255,255,0.5)" strokeWidth={2} />
          <line x1={cursorX - 6} y1={cursorY} x2={cursorX + 6} y2={cursorY} stroke="white" strokeWidth={2} strokeLinecap="round" />
          <line x1={cursorX} y1={cursorY - 6} x2={cursorX} y2={cursorY + 6} stroke="white" strokeWidth={2} strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export const MultiDragLines = memo(MultiDragLinesComponent);
