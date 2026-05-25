"use client";

import { memo } from "react";
import {
  getBezierPath,
  EdgeLabelRenderer,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { Scissors } from "lucide-react";
import { useCanvasStore } from "@/stores/canvas-store";
import { useEdgeHoverStore } from "@/stores/edge-hover-store";

function AnimatedEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  source,
  target,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const { screenToFlowPosition } = useReactFlow();
  const isHovered = useEdgeHoverStore((s) => s.edgeId === id && s.visible);
  const screenX = useEdgeHoverStore((s) => s.edgeId === id ? s.screenX : 0);
  const screenY = useEdgeHoverStore((s) => s.edgeId === id ? s.screenY : 0);

  const showScissors = isHovered;
  const singleSelectedNodeId = useCanvasStore((s) => {
    if (s.selectedNodeIds.size !== 1) return null;
    for (const nodeId of s.selectedNodeIds) return nodeId;
    return null;
  });
  const flowActive =
    !!singleSelectedNodeId &&
    (source === singleSelectedNodeId || target === singleSelectedNodeId);
  const flowGradientId = `xinyu-flow-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  let scissorX = (sourceX + targetX) / 2;
  let scissorY = (sourceY + targetY) / 2;
  if (isHovered && screenX && screenY) {
    const flow = screenToFlowPosition({ x: screenX, y: screenY });
    scissorX = flow.x;
    scissorY = flow.y;
  }

  return (
    <>
      {/* Wide invisible hit area so the <g> wrapper receives hover events */}
      <path
        d={edgePath}
        fill="none"
        stroke="rgba(255,255,255,0.001)"
        strokeWidth={5}
      />
      <path
        id={id}
        d={edgePath}
        fill="none"
        className="react-flow__edge-path"
        stroke={selected ? "rgba(204,255,0,0.45)" : "rgba(255,255,255,0.15)"}
        strokeWidth={selected ? 1.4 : 1}
      />
      {flowActive && (
        <>
          <defs>
            <linearGradient
              id={flowGradientId}
              gradientUnits="userSpaceOnUse"
              x1={sourceX}
              y1={sourceY}
              x2={targetX}
              y2={targetY}
            >
              <stop offset="0%" stopColor="rgba(204,255,0,0.08)">
                <animate attributeName="offset" values="-0.55;1" dur="6.5s" repeatCount="indefinite" />
              </stop>
              <stop offset="0%" stopColor="rgba(210,255,70,0.95)">
                <animate attributeName="offset" values="-0.25;1.3" dur="6.5s" repeatCount="indefinite" />
              </stop>
              <stop offset="0%" stopColor="rgba(204,255,0,0.08)">
                <animate attributeName="offset" values="0;1.55" dur="6.5s" repeatCount="indefinite" />
              </stop>
            </linearGradient>
          </defs>
          <path
            d={edgePath}
            fill="none"
            stroke={`url(#${flowGradientId})`}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <path
            d={edgePath}
            fill="none"
            stroke="rgba(210,255,70,0.25)"
            strokeWidth={2.8}
            strokeLinecap="round"
          />
        </>
      )}
      {showScissors && (
        <EdgeLabelRenderer>
          <ScissorsButton
            x={scissorX}
            y={scissorY}
            edgeId={id}
            fadeIn={isHovered && !selected}
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const ScissorsButton = memo(function ScissorsButton({
  x,
  y,
  edgeId,
  fadeIn,
}: {
  x: number;
  y: number;
  edgeId: string;
  fadeIn?: boolean;
}) {
  const deleteEdgeById = useCanvasStore((s) => s.deleteEdgeById);
  return (
    <div
      className="absolute"
      style={{ transform: `translate(${x}px, ${y}px)`, pointerEvents: "none" }}
    >
      <button
        className="nodrag nopan pointer-events-auto flex items-center justify-center
          w-7 h-7 rounded-full bg-zinc-800 border border-zinc-600
          text-zinc-400 hover:text-white hover:bg-zinc-700 hover:border-zinc-500
          shadow-lg cursor-pointer z-[100]"
        style={{
          transform: "translate(-50%, -50%)",
          animation: fadeIn ? "scissorFadeIn 0.2s ease-out forwards" : undefined,
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          deleteEdgeById(edgeId);
        }}
      >
        <Scissors size={14} />
      </button>
    </div>
  );
});

export const AnimatedEdge = memo(AnimatedEdgeComponent);
