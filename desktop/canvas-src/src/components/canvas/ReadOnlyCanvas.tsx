"use client";

import { useEffect } from "react";
import {
  ReactFlowProvider,
  ReactFlow,
  type NodeTypes,
  type EdgeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCanvasStore } from "@/stores/canvas-store";
import { NodeShell } from "@/components/canvas/nodes/NodeShell";
import { GroupNode } from "@/components/canvas/nodes/GroupNode";
import { CommentNode } from "@/components/canvas/nodes/CommentNode";
import { AnimatedEdge } from "@/components/canvas/edges/AnimatedEdge";
import { CssDotsBackground } from "@/components/canvas/CssDotsBackground";
import { CanvasControls } from "@/components/canvas/CanvasControls";
import { CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM } from "@/components/canvas/zoom-config";
import type { SerializedCanvas } from "@/types/canvas";

const previewNodeTypes: NodeTypes = {
  text: NodeShell,
  prompt: NodeShell,
  "source-image": NodeShell,
  "source-audio": NodeShell,
  "image-gen": NodeShell,
  "video-gen": NodeShell,
  note: NodeShell,
  upscale: NodeShell,
  "video-upscale": NodeShell,
  rembg: NodeShell,
  "audio-gen": NodeShell,
  storyboard: NodeShell,
  group: GroupNode,
  comment: CommentNode,
};

const previewEdgeTypes: EdgeTypes = {
  animated: AnimatedEdge,
  default: AnimatedEdge,
};

const PRO_OPTIONS = { hideAttribution: true };

interface ReadOnlyCanvasProps {
  canvasData: SerializedCanvas;
}

export function ReadOnlyCanvas({ canvasData }: ReadOnlyCanvasProps) {
  const loadFromSerialized = useCanvasStore((s) => s.loadFromSerialized);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);

  useEffect(() => {
    loadFromSerialized(canvasData);
  }, [canvasData, loadFromSerialized]);

  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={previewNodeTypes}
        edgeTypes={previewEdgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        colorMode="dark"
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={CANVAS_MAX_ZOOM}
        proOptions={PRO_OPTIONS}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
      >
        <CssDotsBackground gap={20} size={1.2} color="rgba(255,255,255,0.12)" />
      </ReactFlow>
      <CanvasControls
        showGrid={false}
        snapToGrid={false}
        showMiniMap={true}
        onToggleGrid={() => {}}
        onToggleMiniMap={() => {}}
        interactionMode="select"
        onToggleInteractionMode={() => {}}
        onShowShortcuts={() => {}}
      />
    </ReactFlowProvider>
  );
}
