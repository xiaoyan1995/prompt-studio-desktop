"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  ReactFlow,
  useReactFlow,
  type NodeTypes,
  type EdgeTypes,
  type Viewport,
  type FinalConnectionState,
  type NodeChange,
  type Connection,
} from "@xyflow/react";
import type { CanvasNode, CanvasEdge } from "@/types/canvas";
import "@xyflow/react/dist/style.css";
import { useCanvasStore } from "@/stores/canvas-store";
import { useEdgeHoverStore } from "@/stores/edge-hover-store";
import { useHandleProximityStore } from "@/stores/handle-proximity-store";
import { useCanvasDragStore } from "@/stores/canvas-drag-store";
import { useConnectionDragStore } from "@/stores/connection-drag-store";
import { isConnectionAllowed } from "@/lib/connection-rules";
import { NodeShell } from "./nodes/NodeShell";
import { GroupNode } from "./nodes/GroupNode";
import { CommentNode } from "./nodes/CommentNode";
import { AnimatedEdge } from "./edges/AnimatedEdge";
import { useCommentModeStore } from "@/stores/comment-mode-store";
import { AlignmentGuides } from "./AlignmentGuides";
import { CssDotsBackground } from "./CssDotsBackground";
import { CANVAS_MIN_ZOOM, CANVAS_MAX_ZOOM } from "./zoom-config";

const EDGE_HOVER_DELAY = 600;
const HANDLE_PROXIMITY_PX = 40;

const nodeTypes: NodeTypes = {
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

const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge,
  default: AnimatedEdge,
};

const DEFAULT_EDGE_OPTIONS = { type: "default" } as const;
const PRO_OPTIONS = { hideAttribution: true } as const;
const SNAP_GRID: [number, number] = [20, 20];
const SELECTION_KEY_CODE = ["Shift", "Meta", "Control"];

function isTypingContext(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return true;
  if (target.isContentEditable) return true;
  if (target.closest("[contenteditable='true']")) return true;
  if (target.closest(".ProseMirror")) return true;
  return false;
}

interface CanvasEditorProps {
  onContextMenu?: (x: number, y: number, target: { type: "node" | "edge" | "canvas"; id?: string }) => void;
  onPaneDoubleClick?: (screen: { x: number; y: number }, flow: { x: number; y: number }) => void;
  onPaneClick?: () => void;
  onNodeClick?: (nodeId: string) => void;
  onViewportChange?: (vp: Viewport) => void;
  onViewportMove?: (vp: Viewport) => void;
  onFileDrop?: (files: File[], flowX: number, flowY: number) => void;
  onPasteFiles?: (files: File[]) => void;
  onConnectionDrop?: (sourceNodeId: string, screenX: number, screenY: number) => void;
  onCommentPlace?: (flowX: number, flowY: number) => void;
  snapToGrid?: boolean;
  showGrid?: boolean;
  viewportRef?: MutableRefObject<Viewport>;
  defaultViewport?: Viewport;
  styleLiteEnabled?: boolean;
  interactionMode?: "select" | "pan";
}

export function CanvasEditor({
  onContextMenu,
  onPaneDoubleClick,
  onPaneClick,
  onNodeClick,
  onViewportChange,
  onViewportMove,
  onFileDrop,
  onPasteFiles,
  onConnectionDrop,
  onCommentPlace,
  snapToGrid = false,
  showGrid = true,
  viewportRef,
  defaultViewport,
  styleLiteEnabled = false,
  interactionMode = "select",
}: CanvasEditorProps) {
  const { screenToFlowPosition } = useReactFlow();
  const [isDragOver, setIsDragOver] = useState(false);
  const [colorMode, setColorMode] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const checkTheme = () => {
      const isDark = document.documentElement.classList.contains("dark") || document.body.classList.contains("dark");
      setColorMode(isDark ? "dark" : "light");
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

    const interval = setInterval(checkTheme, 500);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);

  const lastPaneClickRef = useRef(0);
  const edgeHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEdgeMouseEnter = useCallback(
    (event: React.MouseEvent, _edge: { id: string }) => {
      const { setHover, showScissor } = useEdgeHoverStore.getState();
      setHover(_edge.id, event.clientX, event.clientY);
      if (edgeHoverTimerRef.current) clearTimeout(edgeHoverTimerRef.current);
      edgeHoverTimerRef.current = setTimeout(() => {
        const { edgeId } = useEdgeHoverStore.getState();
        if (edgeId === _edge.id) showScissor();
      }, EDGE_HOVER_DELAY);
    },
    [],
  );

  const handleEdgeMouseMove = useCallback(
    (event: React.MouseEvent) => {
      useEdgeHoverStore.getState().updatePos(event.clientX, event.clientY);
    },
    [],
  );

  const handleEdgeMouseLeave = useCallback(() => {
    if (edgeHoverTimerRef.current) { clearTimeout(edgeHoverTimerRef.current); edgeHoverTimerRef.current = null; }
    useEdgeHoverStore.getState().clear();
  }, []);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const storeOnNodesChange = useCanvasStore((s) => s.onNodesChange);
  const onEdgesChange = useCanvasStore((s) => s.onEdgesChange);
  const focusEditActive = useCanvasStore((s) => s.focusEditState.active);

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      if (focusEditActive) {
        const filtered = changes.filter((c) => c.type !== "select");
        if (filtered.length > 0) storeOnNodesChange(filtered);
        return;
      }
      storeOnNodesChange(changes);
    },
    [focusEditActive, storeOnNodesChange],
  );
  const onConnect = useCanvasStore((s) => s.onConnect);

  const isValidConnection = useCallback(
    (connection: CanvasEdge | Connection) => {
      const source = connection.source;
      const target = connection.target;
      if (!source || !target) return false;
      const nodeMap = useCanvasStore.getState()._nodeMap;
      const sourceNode = nodeMap.get(source);
      const targetNode = nodeMap.get(target);
      if (!sourceNode || !targetNode) return false;
      const targetType = targetNode.data.nodeType as string;
      const sourceType = sourceNode.data.nodeType as string;
      return isConnectionAllowed(sourceType, targetType);
    },
    [],
  );
  const deleteSelected = useCanvasStore((s) => s.deleteSelected);
  const hasSelectedTextNode = useCanvasStore((s) => s.hasSelectedTextNode);

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: CanvasNode) => {
      event.preventDefault();
      onContextMenu?.(event.clientX, event.clientY, { type: "node", id: node.id });
    },
    [onContextMenu]
  );

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      onContextMenu?.(event.clientX, event.clientY, { type: "canvas" });
    },
    [onContextMenu]
  );

  const handleSelectionContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      onContextMenu?.(event.clientX, event.clientY, { type: "node" });
    },
    [onContextMenu]
  );

  const commentModeActive = useCommentModeStore((s) => s.active);

  const handlePaneClick = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      // Comment mode: place a comment node and exit
      if (commentModeActive) {
        const screen = { x: event.clientX, y: event.clientY };
        const flow = screenToFlowPosition(screen);
        onCommentPlace?.(flow.x, flow.y);
        return;
      }

      const now = Date.now();
      if (now - lastPaneClickRef.current < 300) {
        const screen = { x: event.clientX, y: event.clientY };
        const flow = screenToFlowPosition(screen);
        onPaneDoubleClick?.(screen, flow);
        lastPaneClickRef.current = 0;
      } else {
        lastPaneClickRef.current = now;
        onPaneClick?.();
      }
    },
    [onPaneDoubleClick, onPaneClick, onCommentPlace, screenToFlowPosition, commentModeActive]
  );

  const copySelected = useCanvasStore((s) => s.copySelected);
  const pasteClipboard = useCanvasStore((s) => s.pasteClipboard);
  const duplicateSelected = useCanvasStore((s) => s.duplicateSelected);
  const selectAll = useCanvasStore((s) => s.selectAll);

  // ─── Native paste handler: captures clipboard images (e.g. "Copy Image" from browser) ───
  const wrapperRef = useRef<HTMLDivElement>(null);
  const onPasteFilesRef = useRef(onPasteFiles);
  onPasteFilesRef.current = onPasteFiles;

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const handlePaste = (e: ClipboardEvent) => {
      if (isTypingContext(e.target as EventTarget)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        onPasteFilesRef.current?.(files);
      }
    };
    el.addEventListener("paste", handlePaste);
    return () => el.removeEventListener("paste", handlePaste);
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Escape exits comment mode
      if (event.key === "Escape" && commentModeActive) {
        useCommentModeStore.getState().exit();
        return;
      }

      if (isTypingContext(event.target)) return;

      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key === "a") { event.preventDefault(); selectAll(); return; }
      if (mod && event.key === "c") { event.preventDefault(); copySelected(); return; }
      if (mod && event.shiftKey && event.key === "v") { event.preventDefault(); duplicateSelected(); return; }
      if (mod && event.key === "v") {
        // If internal clipboard has content, use it; otherwise let native paste event handle external images
        const clip = useCanvasStore.getState().clipboard;
        if (clip && clip.nodes.length > 0) {
          event.preventDefault();
          pasteClipboard();
        }
        // Don't preventDefault — allow native paste event to fire for clipboard images
        return;
      }
      if (mod && event.key === "d") { event.preventDefault(); duplicateSelected(); return; }

      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (event.key === "Backspace" && hasSelectedTextNode) return;

      event.preventDefault();
      deleteSelected();
    },
    [deleteSelected, copySelected, pasteClipboard, duplicateSelected, selectAll, hasSelectedTextNode, commentModeActive]
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: CanvasNode) => {
      onNodeClick?.(node.id);
    },
    [onNodeClick],
  );

  const handleMoveStart = useCallback(() => {
    useCanvasDragStore.getState().setViewportMoving(true);
  }, []);

  const handleMoveEnd = useCallback(
    (_e: unknown, vp: Viewport) => {
      useCanvasDragStore.getState().setViewportMoving(false);
      if (viewportRef) viewportRef.current = vp;
      onViewportChange?.(vp);
    },
    [viewportRef, onViewportChange]
  );

  const handleMove = useCallback(
    (_e: unknown, vp: Viewport) => {
      onViewportMove?.(vp);
    },
    [onViewportMove],
  );

  const handleNodeDragStart = useCallback((_event: React.MouseEvent, _node: CanvasNode, draggedNodes: CanvasNode[]) => {
    useCanvasDragStore.getState().setNodeDragging(true);
    useCanvasStore.getState().captureDragStart(draggedNodes.map((n) => n.id));
  }, []);

  const handleNodeDragStop = useCallback(() => {
    useCanvasDragStore.getState().setNodeDragging(false);
    useCanvasStore.getState().commitDragEnd();
  }, []);

  const connectSourceRef = useRef<string | null>(null);

  const handleConnectStart = useCallback(
    (_event: MouseEvent | TouchEvent, params: { nodeId: string | null }) => {
      connectSourceRef.current = params.nodeId ?? null;
      if (params.nodeId) {
        const node = useCanvasStore.getState()._nodeMap.get(params.nodeId);
        if (node) useConnectionDragStore.getState().setSourceNodeType(node.data.nodeType as string);
      }
    },
    [],
  );

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState?: FinalConnectionState) => {
      const sourceId = connectSourceRef.current;
      connectSourceRef.current = null;
      useConnectionDragStore.getState().setSourceNodeType(null);

      if (!sourceId) return;
      if (connectionState?.isValid) return;

      let clientX: number, clientY: number;
      if ("clientX" in event) {
        clientX = event.clientX;
        clientY = event.clientY;
      } else if ("changedTouches" in event) {
        const touch = event.changedTouches[0];
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        return;
      }

      onConnectionDrop?.(sourceId, clientX, clientY);
    },
    [onConnectionDrop],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsDragOver(true);
    },
    [],
  );

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  // ─── Handle proximity: detect cursor near node left/right edges ───
  const proximityRaf = useRef<number>(0);
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (proximityRaf.current) return;          // throttle to 1 per rAF
      proximityRaf.current = requestAnimationFrame(() => {
        proximityRaf.current = 0;
        const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const allNodes = useCanvasStore.getState().nodes;
        const zoom = (document.querySelector('.react-flow__viewport') as HTMLElement)
          ?.style.transform?.match(/scale\(([^)]+)\)/)?.[1];
        const z = zoom ? parseFloat(zoom) : 1;
        const threshold = HANDLE_PROXIMITY_PX / Math.max(z, 0.15);

        let nearest: string | null = null;
        let bestDist = Infinity;
        for (const node of allNodes) {
          const nx = node.position.x;
          const ny = node.position.y;
          const nw = node.measured?.width ?? (node.width as number | undefined) ?? 300;
          const nh = node.measured?.height ?? (node.height as number | undefined) ?? 200;
          // vertical: cursor within node height ± threshold
          if (flow.y < ny - threshold || flow.y > ny + nh + threshold) continue;
          const distLeft = Math.abs(flow.x - nx);
          const distRight = Math.abs(flow.x - (nx + nw));
          const dist = Math.min(distLeft, distRight);
          if (dist <= threshold && dist < bestDist) {
            bestDist = dist;
            nearest = node.id;
          }
        }
        useHandleProximityStore.getState().setNear(nearest);
      });
    },
    [screenToFlowPosition],
  );

  const handlePointerLeave = useCallback(() => {
    useHandleProximityStore.getState().setNear(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onFileDrop?.(files, flow.x, flow.y);
    },
    [screenToFlowPosition, onFileDrop],
  );

  return (
    <div
      ref={wrapperRef}
      className={`absolute inset-0 ${styleLiteEnabled ? "xinyu-canvas-style-lite" : ""} ${commentModeActive ? "xinyu-comment-mode" : ""}`}
      onKeyDown={handleKeyDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      tabIndex={-1}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeContextMenu={handleNodeContextMenu}
        onSelectionContextMenu={handleSelectionContextMenu}
        onPaneContextMenu={handlePaneContextMenu}
        onPaneClick={handlePaneClick}
        onNodeClick={handleNodeClick}
        defaultViewport={defaultViewport}
        fitView={!defaultViewport}
        onMoveStart={handleMoveStart}
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        colorMode={colorMode}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        proOptions={PRO_OPTIONS}
        minZoom={CANVAS_MIN_ZOOM}
        maxZoom={CANVAS_MAX_ZOOM}
        snapToGrid={snapToGrid}
        snapGrid={SNAP_GRID}
        onlyRenderVisibleElements
        onEdgeMouseEnter={handleEdgeMouseEnter}
        onEdgeMouseMove={handleEdgeMouseMove}
        onEdgeMouseLeave={handleEdgeMouseLeave}
        connectionRadius={80}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        selectionOnDrag={interactionMode === "select"}
        panOnDrag={interactionMode === "select" ? [1, 2] : true}
        selectionKeyCode={SELECTION_KEY_CODE}
        multiSelectionKeyCode={SELECTION_KEY_CODE}
      >
        {showGrid && (
          <CssDotsBackground gap={20} size={1.2} color="var(--canvas-dots-color)" />
        )}
        {snapToGrid && <AlignmentGuides />}
      </ReactFlow>
      {isDragOver && (
        <div className="absolute inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="absolute inset-4 rounded-2xl border-2 border-dashed border-white/30 bg-white/[0.03]" />
        </div>
      )}
    </div>
  );
}
