"use client";

import { memo, useMemo, useDeferredValue, useRef, useCallback, useState, useEffect, Suspense } from "react";
import { useTranslations } from "next-intl";
import { Handle, Position, type NodeProps, useStore } from "@xyflow/react";
import type { CanvasNode, NodeType } from "@/types/canvas";
import { CANVAS_OVERVIEW_ZOOM } from "../zoom-config";
import { NODE_TYPE_CONFIGS } from "@/types/canvas";
import { useCanvasStore } from "@/stores/canvas-store";
import { useHandleProximityStore } from "@/stores/handle-proximity-store";
import { useIsDragging } from "@/stores/canvas-drag-store";
import { useConnectionDragStore } from "@/stores/connection-drag-store";
import { isConnectionAllowed } from "@/lib/connection-rules";
import { useShallow } from "zustand/react/shallow";
import { getPlugin } from "./plugin-registry";
import type { ConnectedRefs, NodeUpdaters } from "./plugin-types";
import type { PromptEditorHandle, ElementRef } from "./PromptEditor";
import { MeteorShowerOverlay } from "./MeteorShowerOverlay";
import { FailedOverlay } from "./FailedOverlay";

import "./plugins/note-plugin";
import "./plugins/text-plugin";
import "./plugins/prompt-plugin";
import "./plugins/media-plugin";
import "./plugins/audio-plugin";
import "./plugins/storyboard-plugin";

const zoomSelector = (s: { transform: [number, number, number] }) => s.transform[2];

const HANDLE_PLUS_SVG = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="border-[2px] rounded-full text-zinc-500 border-zinc-500 transition-colors pointer-events-none">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

function NodeHandle({
  type,
  position,
  handleId,
  selected,
  nodeId,
}: {
  type: "source" | "target";
  position: Position;
  handleId: string;
  selected: boolean;
  nodeId: string;
}) {
  const isLeft = position === Position.Left;
  const hitRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const wasSelectedOnDown = useRef(false);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = hitRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setOffset({ x: e.clientX - cx, y: e.clientY - cy });
  }, []);

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setHovering(true);
    const el = hitRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setOffset({ x: e.clientX - cx, y: e.clientY - cy });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHovering(false);
    setOffset({ x: 0, y: 0 });
    downPos.current = null;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    downPos.current = { x: e.clientX, y: e.clientY };
    wasSelectedOnDown.current = selected;
  }, [selected]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    const dp = downPos.current;
    downPos.current = null;
    if (!dp) return;
    const dist = Math.hypot(e.clientX - dp.x, e.clientY - dp.y);
    if (dist > 5) return;

    // Undo node selection if it wasn't selected before the click
    if (!wasSelectedOnDown.current) {
      setTimeout(() => {
        useCanvasStore.getState().onNodesChange([{ id: nodeId, type: "select", selected: false }]);
      }, 0);
    }

    window.dispatchEvent(
      new CustomEvent("xinyu:handle-plus-click", {
        detail: { nodeId, screenX: e.clientX, screenY: e.clientY },
      })
    );
  }, [nodeId]);

  const isNear = useHandleProximityStore((s) => s.nearNodeId === nodeId);
  const showIcon = hovering || selected || isNear;

  return (
    <Handle
      type={type}
      position={position}
      id={handleId}
      className="!size-0 !bg-transparent !border-none"
      style={{ top: "50%" }}
    >
      <div
        ref={hitRef}
        className={`xinyu-handle-hitarea absolute top-1/2 -translate-y-1/2 h-20 w-20 rounded-full flex justify-center items-center ${
          isLeft ? "right-0" : "left-0"
        }`}
        style={isNear ? { pointerEvents: "auto" } : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        <div
          className="will-change-transform pointer-events-none"
          style={{
            transform: hovering ? `translate(${offset.x}px, ${offset.y}px)` : "translate(0px, 0px)",
            opacity: showIcon ? 1 : 0,
            transition: hovering ? "none" : "opacity 150ms ease, transform 200ms ease",
          }}
        >
          {HANDLE_PLUS_SVG}
        </div>
      </div>
    </Handle>
  );
}

const HAS_REF_IN = new Set<NodeType>(
  (Object.entries(NODE_TYPE_CONFIGS) as [NodeType, (typeof NODE_TYPE_CONFIGS)[keyof typeof NODE_TYPE_CONFIGS]][])
    .filter(([, cfg]) => cfg.ports.some((p) => p.direction === "input"))
    .map(([t]) => t)
);

function NodeShellComponent({ id, data, selected }: NodeProps<CanvasNode>) {
  const t = useTranslations("canvas");

  // Invisible placeholder used as edge anchor while connection drop menu is open
  if (data._placeholder) {
    return (
      <div style={{ width: 1, height: 1, opacity: 0, pointerEvents: "none" }}>
        <Handle type="target" position={Position.Left} id="ref-in" style={{ opacity: 0 }} />
        <Handle type="source" position={Position.Right} id="out" style={{ opacity: 0 }} />
      </div>
    );
  }

  const nodeType = data.nodeType as NodeType;
  const plugin = getPlugin(nodeType);
  const config = NODE_TYPE_CONFIGS[nodeType];

  const zoom = useStore(zoomSelector);
  const isZoomedOut = zoom < 0.3;
  const isOverviewMode = zoom < CANVAS_OVERVIEW_ZOOM;
  const isMultiSelected = useCanvasStore((s) => s.selectedNodeIds.size > 1);
  const soloSelected = selected && !isMultiSelected;
  const isDragging = useIsDragging();

  // Blur incompatible nodes during connection drag
  const connDragSource = useConnectionDragStore((s) => s.sourceNodeType);
  const isIncompatibleTarget = connDragSource
    ? !isConnectionAllowed(connDragSource, nodeType)
    : false;
  const shellRef = useRef<HTMLDivElement>(null);
  const overviewSelected = soloSelected;
  useEffect(() => {
    const rfNode = shellRef.current?.closest(".react-flow__node") as HTMLElement | null;
    if (!rfNode) return;
    if (isIncompatibleTarget) {
      rfNode.style.filter = "blur(3px)";
      rfNode.style.opacity = "0.35";
      rfNode.style.pointerEvents = "none";
      rfNode.style.transition = "filter 0.2s, opacity 0.2s";
    } else {
      rfNode.style.filter = "";
      rfNode.style.opacity = "";
      rfNode.style.pointerEvents = "";
      rfNode.style.transition = "filter 0.2s, opacity 0.2s";
    }
    if (overviewSelected) {
      rfNode.style.zIndex = "10";
    }
  }, [isIncompatibleTarget, overviewSelected]);

  const storeActions = useCanvasStore(
    useShallow((s) => ({
      updateNodeData: s.updateNodeData,
      updateNodeSize: s.updateNodeSize,
      addNodeWithData: s.addNodeWithData,
      addEdgeById: s.addEdgeById,
      deleteEdgeById: s.deleteEdgeById,
    }))
  );

  const updaters: NodeUpdaters = useMemo(() => ({
    updateData: (d) => storeActions.updateNodeData(id, d),
    updateSize: (w, h) => storeActions.updateNodeSize(id, w, h),
    addNodeWithData: storeActions.addNodeWithData,
    addEdgeById: storeActions.addEdgeById,
    deleteEdgeById: storeActions.deleteEdgeById,
  }), [id, storeActions]);

  const needsRefs = HAS_REF_IN.has(nodeType);

  const _refKeyRaw = useCanvasStore((s) => {
    if (!needsRefs || !soloSelected) return "|||||||";
    const myEdges = s._edgesByTarget.get(id) ?? [];
    const imgs: string[] = [];
    const thumbs: string[] = [];
    const imgMeta: string[] = [];
    const vids: string[] = [];
    const vidMeta: string[] = [];
    const auds: string[] = [];
    const audMeta: string[] = [];
    const txts: string[] = [];
    for (const e of myEdges) {
      const src = s._nodeMap.get(e.source);
      if (!src) continue;
      if (src.data?.audioUrl) {
        auds.push(String(src.data.audioUrl));
        audMeta.push(`${src.id}\x00${String(src.data.label ?? "")}`);
      }
      else if (src.data?.videoUrl) {
        vids.push(String(src.data.videoUrl));
        vidMeta.push(`${src.id}\x00${String(src.data.label ?? "")}`);
      }
      else if (src.data?.imageUrl) {
        imgs.push(String(src.data.imageUrl));
        thumbs.push(String(src.data.thumbnailUrl ?? src.data.imageUrl));
        imgMeta.push(`${src.id}\x00${String(src.data.label ?? "")}`);
      }
      else if (
        (src.data?.nodeType === "text" || src.data?.nodeType === "prompt")
        && src.data?.content
      ) {
        txts.push(`${src.id}\x00${String(src.data.label ?? "")}\x00${String(src.data.content ?? "")}`);
      }
    }
    return `${imgs.join("\t")}|${vids.join("\t")}|${txts.join("\t")}|${thumbs.join("\t")}|${imgMeta.join("\t")}|${vidMeta.join("\t")}|${auds.join("\t")}|${audMeta.join("\t")}`;
  });
  const _refKey = useDeferredValue(_refKeyRaw);
  const connectedRefs: ConnectedRefs = useMemo(() => {
    const [imgPart, vidPart, txtPart, thumbPart, imgMetaPart, vidMetaPart, audPart, audMetaPart] = _refKey.split("|");
    const imgUrls = imgPart ? imgPart.split("\t").filter(Boolean) : [];
    const thumbUrls = thumbPart ? thumbPart.split("\t").filter(Boolean) : [];
    const vidUrls = vidPart ? vidPart.split("\t").filter(Boolean) : [];
    const audUrls = audPart ? audPart.split("\t").filter(Boolean) : [];
    const imgMetaArr = imgMetaPart ? imgMetaPart.split("\t").filter(Boolean) : [];
    const vidMetaArr = vidMetaPart ? vidMetaPart.split("\t").filter(Boolean) : [];
    const audMetaArr = audMetaPart ? audMetaPart.split("\t").filter(Boolean) : [];
    return {
      images: imgUrls,
      thumbnails: thumbUrls,
      videos: vidUrls,
      audios: audUrls,
      imageNodes: imgUrls.map((url, i) => {
        const [nodeId, label] = (imgMetaArr[i] ?? "").split("\x00");
        return { nodeId: nodeId ?? "", url, thumbnailUrl: thumbUrls[i] ?? url, label: label ?? "" };
      }),
      videoNodes: vidUrls.map((url, i) => {
        const [nodeId, label] = (vidMetaArr[i] ?? "").split("\x00");
        return { nodeId: nodeId ?? "", url, thumbnailUrl: url, label: label ?? "" };
      }),
      audioNodes: audUrls.map((url, i) => {
        const [nodeId, label] = (audMetaArr[i] ?? "").split("\x00");
        return { nodeId: nodeId ?? "", url, thumbnailUrl: "", label: label ?? "" };
      }),
      textNodes: txtPart ? txtPart.split("\t").filter(Boolean).map((s) => {
        const [nid, label, content] = s.split("\x00");
        return { id: nid, label, content };
      }) : [],
    };
  }, [_refKey]);

  const promptEditorRef = useRef<PromptEditorHandle>(null);
  const elementRefsRef = useRef<ElementRef[]>([]);

  if (!plugin) return null;

  const { IdleView, ActiveView } = plugin;
  const ports = config?.ports ?? [];
  const hasInput = nodeType !== "prompt" && ports.some((p) => p.direction === "input");
  const hasOutput = ports.some((p) => p.direction === "output");

  const flowGradientId = `xinyu-node-glow-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <>
      <div ref={shellRef} style={{ display: "none" }} />
      <IdleView
        id={id}
        data={data}
        selected={selected}
        soloSelected={soloSelected}
        isZoomedOut={isZoomedOut}
        zoom={zoom}
        updaters={updaters}
      />
      {(String(data.status) === "running" || String(data.status) === "queued" || String(data.status) === "uploading") && (
        <>
          <MeteorShowerOverlay startTime={data.generationStartedAt as number | undefined} label={String(data.status) === "uploading" ? t("uploading") : undefined} />
          {/* Pulsing border glow for running state */}
          <svg
            className="pointer-events-none"
            style={{ position: "absolute", inset: -2, width: "calc(100% + 4px)", height: "calc(100% + 4px)", overflow: "visible", zIndex: 4 }}
          >
            <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="13" ry="13"
              fill="none" stroke="rgba(204,255,0,0.4)" strokeWidth="1.5">
              <animate attributeName="stroke-opacity" values="0.2;0.6;0.2" dur="2s" repeatCount="indefinite" />
            </rect>
            <rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="13" ry="13"
              fill="none" stroke="rgba(204,255,0,0.15)" strokeWidth="4">
              <animate attributeName="stroke-opacity" values="0.05;0.2;0.05" dur="2s" repeatCount="indefinite" />
            </rect>
          </svg>
        </>
      )}
      {String(data.status) === "failed" && (
        <FailedOverlay errorMessage={data.errorMessage as string | undefined} />
      )}
      {overviewSelected && (
        <svg
          className="pointer-events-none"
          style={{ position: "absolute", inset: -3, width: "calc(100% + 6px)", height: "calc(100% + 6px)", overflow: "visible" }}
        >
          <defs>
            <linearGradient id={flowGradientId} gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(204,255,0,0.06)">
                <animate attributeName="offset" values="-0.5;1" dur="4s" repeatCount="indefinite" />
              </stop>
              <stop offset="0%" stopColor="rgba(210,255,70,0.9)">
                <animate attributeName="offset" values="-0.2;1.3" dur="4s" repeatCount="indefinite" />
              </stop>
              <stop offset="0%" stopColor="rgba(204,255,0,0.06)">
                <animate attributeName="offset" values="0;1.5" dur="4s" repeatCount="indefinite" />
              </stop>
            </linearGradient>
          </defs>
          <rect x="1.5" y="1.5" width="calc(100% - 3px)" height="calc(100% - 3px)" rx="14" ry="14"
            fill="none" stroke={`url(#${flowGradientId})`} strokeWidth="2.5" />
          <rect x="1.5" y="1.5" width="calc(100% - 3px)" height="calc(100% - 3px)" rx="14" ry="14"
            fill="none" stroke="rgba(204,255,0,0.15)" strokeWidth="3" />
        </svg>
      )}
      {soloSelected && ActiveView && !isDragging && !isOverviewMode && (
        <Suspense fallback={null}>
          <ActiveView
            id={id}
            data={data}
            updaters={updaters}
            connectedRefs={connectedRefs}
            promptEditorRef={promptEditorRef}
            elementRefsRef={elementRefsRef}
          />
        </Suspense>
      )}
      {hasInput && <NodeHandle type="target" position={Position.Left} handleId="ref-in" selected={soloSelected} nodeId={id} />}
      {hasOutput && <NodeHandle type="source" position={Position.Right} handleId="out" selected={soloSelected} nodeId={id} />}
    </>
  );
}

export const NodeShell = memo(NodeShellComponent);
