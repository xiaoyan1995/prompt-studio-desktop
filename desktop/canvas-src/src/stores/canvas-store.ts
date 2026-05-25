import { create } from "zustand";
import type { OnNodesChange, OnEdgesChange, OnConnect, Connection } from "@xyflow/react";
import { applyNodeChanges, applyEdgeChanges, addEdge as rfAddEdge } from "@xyflow/react";
import type { CanvasNode, CanvasEdge, NodeData, SerializedCanvas, Command } from "@/types/canvas";
import {
  toReactFlowNode,
  toReactFlowEdge,
  toSerializedNode,
  toSerializedEdge,
  NODE_TYPE_CONFIGS,
  type NodeType,
} from "@/types/canvas";
import { createEmptyShotRow } from "@/types/storyboard";
import { DEFAULT_STORYBOARD_PARSE_MODEL_ID } from "@/lib/storyboard/parse-models";

interface Clipboard {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  externalEdges: CanvasEdge[];
}

interface LastNodeSettings {
  model_id: string;
  [key: string]: string | number | boolean;
}

interface FocusEditState {
  active: boolean;
  sourceNodeId: string | null;
}

export interface DetailViewPayload {
  imageUrl?: string;
  originalUrl?: string;
  videoUrl?: string;
  isVideo?: boolean;
  nodeId?: string;
  data: Record<string, unknown>;
}

type AlignDirection = "left" | "center-h" | "right" | "top" | "center-v" | "bottom";

const UNDO_STACK_LIMIT = 50;

interface CanvasStore {
  projectId: string | null;
  setProjectId: (id: string) => void;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  _nodeMap: Map<string, CanvasNode>;
  _edgesByTarget: Map<string, CanvasEdge[]>;
  isDirty: boolean;
  _mutationVersion: number;
  clipboard: Clipboard | null;
  lastSettings: Record<string, LastNodeSettings>;

  _undoStack: Command[];
  _redoStack: Command[];
  pushCommand: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  _dragStartPositions: Map<string, { x: number; y: number }> | null;
  captureDragStart: (nodeIds: string[]) => void;
  commitDragEnd: () => void;

  focusEditState: FocusEditState;
  enterFocusEdit: (sourceNodeId: string) => void;
  exitFocusEdit: () => void;

  onNodesChange: OnNodesChange<CanvasNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;

  addNode: (type: NodeType, x: number, y: number) => void;
  addNodeWithData: (type: NodeType, x: number, y: number, data: Partial<NodeData>, size?: { w: number; h: number }) => string;
  addEdgeById: (sourceId: string, targetId: string) => void;
  updateNodeData: (id: string, data: Partial<NodeData>) => void;
  updateNodeSize: (id: string, width: number, height: number) => void;
  deleteSelected: () => void;
  deleteNodeById: (nodeId: string) => void;
  deleteEdgeById: (edgeId: string) => void;
  selectAll: () => void;
  copySelected: () => void;
  pasteClipboard: () => void;
  duplicateSelected: () => void;

  groupSelected: () => void;
  ungroupNode: (groupId: string) => void;
  deleteGroup: (groupId: string) => void;
  alignSelected: (direction: AlignDirection) => void;
  distributeSelected: (axis: "horizontal" | "vertical") => void;
  layoutGroupHorizontal: (groupId: string) => void;
  layoutGroupGrid: (groupId: string) => void;

  markClean: (savedAtVersion?: number) => void;
  getSerializableState: (viewport?: { x: number; y: number; zoom: number }) => SerializedCanvas;
  loadFromSerialized: (data: SerializedCanvas) => void;

  lastSavedSnapshot: SerializedCanvas | null;
  setLastSavedSnapshot: (snapshot: SerializedCanvas) => void;

  selectedNodeIds: Set<string>;
  hasSelectedTextNode: boolean;

  detailView: DetailViewPayload | null;
  openDetailView: (payload: DetailViewPayload) => void;
  closeDetailView: () => void;
}

function fitGroupToChildren(nodes: CanvasNode[], groupId: string): CanvasNode[] {
  const children = nodes.filter((n) => n.data.groupId === groupId);
  if (children.length === 0) return nodes;

  const padding = 40;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of children) {
    const w = Number(c.style?.width ?? c.width ?? 280);
    const h = Number(c.style?.height ?? c.height ?? 200);
    minX = Math.min(minX, c.position.x);
    minY = Math.min(minY, c.position.y);
    maxX = Math.max(maxX, c.position.x + w);
    maxY = Math.max(maxY, c.position.y + h);
  }

  const gx = minX - padding;
  const gy = minY - padding - 40;
  const gw = maxX - minX + padding * 2;
  const gh = maxY - minY + padding * 2 + 40;

  return nodes.map((n) =>
    n.id === groupId
      ? { ...n, position: { x: gx, y: gy }, style: { ...n.style, width: gw, height: gh } }
      : n
  );
}

function isNodeGenerating(n: CanvasNode): boolean {
  const s = String(n.data.status ?? "");
  return s === "running" || s === "queued";
}

let pasteCounter = 0;

function buildNodeMap(nodes: CanvasNode[]): Map<string, CanvasNode> {
  const m = new Map<string, CanvasNode>();
  for (const n of nodes) m.set(n.id, n);
  return m;
}

function buildEdgesByTarget(edges: CanvasEdge[]): Map<string, CanvasEdge[]> {
  const m = new Map<string, CanvasEdge[]>();
  for (const e of edges) {
    const arr = m.get(e.target);
    if (arr) arr.push(e);
    else m.set(e.target, [e]);
  }
  return m;
}

function createCanvasStore() {
  return create<CanvasStore>((__set, get) => {
  const set: typeof __set = (partial, replace) => {
    __set((prev) => {
      const raw = typeof partial === "function" ? partial(prev) : partial;
      if (!raw || typeof raw !== "object") return raw as any;
      const next = { ...(raw as Record<string, unknown>) };
      if ("nodes" in next && next.nodes !== prev.nodes)
        next._nodeMap = buildNodeMap(next.nodes as CanvasNode[]);
      if ("edges" in next && next.edges !== prev.edges)
        next._edgesByTarget = buildEdgesByTarget(next.edges as CanvasEdge[]);
      return next as Partial<CanvasStore>;
    }, replace as any);
  };

  return {
  projectId: null,
  setProjectId: (id: string) => __set({ projectId: id }),
  nodes: [],
  edges: [],
  _nodeMap: new Map(),
  _edgesByTarget: new Map(),
  isDirty: false,
  _mutationVersion: 0,
  clipboard: null,
  selectedNodeIds: new Set(),
  hasSelectedTextNode: false,

  _undoStack: [],
  _redoStack: [],
  _dragStartPositions: null,

  pushCommand: (cmd) => {
    set((s) => ({
      _undoStack: [...s._undoStack.slice(-(UNDO_STACK_LIMIT - 1)), cmd],
      _redoStack: [],
    }));
  },

  undo: () => {
    const s = get();
    if (s._undoStack.length === 0) return;
    const cmd = s._undoStack[s._undoStack.length - 1];
    cmd.undo();
    set((prev) => ({
      _undoStack: prev._undoStack.slice(0, -1),
      _redoStack: [...prev._redoStack, cmd],
    }));
  },

  redo: () => {
    const s = get();
    if (s._redoStack.length === 0) return;
    const cmd = s._redoStack[s._redoStack.length - 1];
    cmd.execute();
    set((prev) => ({
      _redoStack: prev._redoStack.slice(0, -1),
      _undoStack: [...prev._undoStack, cmd],
    }));
  },

  canUndo: () => get()._undoStack.length > 0,
  canRedo: () => get()._redoStack.length > 0,

  captureDragStart: (nodeIds) => {
    const s = get();
    const positions = new Map<string, { x: number; y: number }>();
    for (const id of nodeIds) {
      const node = s._nodeMap.get(id);
      if (node) positions.set(id, { ...node.position });
    }
    set({ _dragStartPositions: positions });
  },

  commitDragEnd: () => {
    const s = get();
    const startPositions = s._dragStartPositions;
    if (!startPositions || startPositions.size === 0) {
      set({ _dragStartPositions: null });
      return;
    }
    const endPositions = new Map<string, { x: number; y: number }>();
    let hasMoved = false;
    for (const [id] of startPositions) {
      const node = s._nodeMap.get(id);
      if (node) {
        endPositions.set(id, { ...node.position });
        const sp = startPositions.get(id)!;
        if (Math.abs(node.position.x - sp.x) > 0.5 || Math.abs(node.position.y - sp.y) > 0.5) {
          hasMoved = true;
        }
      }
    }
    set({ _dragStartPositions: null });
    if (!hasMoved) return;

    const cmd: Command = {
      type: "move-node",
      execute: () => {
        set((prev) => ({
          nodes: prev.nodes.map((n) => {
            const ep = endPositions.get(n.id);
            return ep ? { ...n, position: ep } : n;
          }),
          isDirty: true, _mutationVersion: get()._mutationVersion + 1,
        }));
      },
      undo: () => {
        set((prev) => ({
          nodes: prev.nodes.map((n) => {
            const sp = startPositions.get(n.id);
            return sp ? { ...n, position: sp } : n;
          }),
          isDirty: true, _mutationVersion: get()._mutationVersion + 1,
        }));
      },
    };
    get().pushCommand(cmd);
  },
  focusEditState: { active: false, sourceNodeId: null },
  enterFocusEdit: (sourceNodeId) => set({ focusEditState: { active: true, sourceNodeId } }),
  exitFocusEdit: () => set({ focusEditState: { active: false, sourceNodeId: null } }),

  detailView: null,
  openDetailView: (payload) => set({ detailView: payload }),
  closeDetailView: () => set({ detailView: null }),
  lastSettings: {
    "text":      { model_id: "deepseek/deepseek-v3.2" },
    "image-gen": { model_id: "nano-banana-2", image_size: "2K", aspect_ratio: "16:9" },
    "video-gen": { model_id: "seedance-2", aspect_ratio: "16:9", duration_s: 5, generate_audio: true, video_ref_mode: "startEnd", resolution: "720p", fps: "25" },
    "audio-gen": { model_id: "" },
  },

  onNodesChange: (changes) => {
    set((s) => {
      let hasGroup = false;
      let hasPos = false;
      let hasDim = false;
      let hasSel = false;
      for (const c of changes) {
        if (c.type === "position" && (c as any).position != null) hasPos = true;
        else if (c.type === "dimensions") hasDim = true;
        else if (c.type === "select" || c.type === "remove" || c.type === "add") hasSel = true;
      }

      let nodes = applyNodeChanges(changes, s.nodes);

      if (hasSel) {
        nodes = nodes.map((n) =>
          n.data?.nodeType === "group" ? { ...n, zIndex: -1 } : n
        );
      }

      if (hasPos) {
        const groupDeltas = new Map<string, { dx: number; dy: number }>();
        for (const c of changes) {
          if (c.type !== "position" || !(c as any).position) continue;
          const pc = c as { id: string; position: { x: number; y: number } };
          const node = s._nodeMap.get(pc.id);
          if (node?.data?.nodeType === "group") {
            hasGroup = true;
            groupDeltas.set(pc.id, {
              dx: pc.position.x - node.position.x,
              dy: pc.position.y - node.position.y,
            });
          }
        }
        if (hasGroup && groupDeltas.size > 0) {
          nodes = nodes.map((n) => {
            const gid = n.data?.groupId as string | undefined;
            if (!gid) return n;
            const delta = groupDeltas.get(gid);
            if (!delta || (delta.dx === 0 && delta.dy === 0)) return n;
            return { ...n, position: { x: n.position.x + delta.dx, y: n.position.y + delta.dy } };
          });
        }
      }

      if (hasDim) {
        const sizeById = new Map<string, { width: number; height: number }>();
        for (const c of changes) {
          if (c.type !== "dimensions") continue;
          const d = (c as any).dimensions;
          if (typeof d?.width === "number" && typeof d?.height === "number")
            sizeById.set(c.id, d);
        }
        if (sizeById.size > 0) {
          nodes = nodes.map((node) => {
            const size = sizeById.get(node.id);
            if (!size) return node;
            return { ...node, style: { ...node.style, width: size.width, height: size.height } };
          });
        }
      }

      if (hasSel) {
        const selectedNodeIds = new Set(
          nodes.filter((n) => n.selected).map((n) => n.id)
        );
        const hasSelectedTextNode = nodes.some(
          (n) => n.selected && n.data.nodeType === "text"
        );
        return { nodes, isDirty: true, _mutationVersion: get()._mutationVersion + 1, selectedNodeIds, hasSelectedTextNode };
      }

      return { nodes, isDirty: true, _mutationVersion: get()._mutationVersion + 1 };
    });
  },

  onEdgesChange: (changes) => {
    set((s) => ({
      edges: applyEdgeChanges(changes, s.edges),
      isDirty: true, _mutationVersion: get()._mutationVersion + 1,
    }));
  },

  onConnect: (connection: Connection) => {
    const newEdge = { ...connection, type: "default" } as CanvasEdge;
    set((s) => ({
      edges: rfAddEdge(newEdge, s.edges),
      isDirty: true, _mutationVersion: get()._mutationVersion + 1,
    }));
    const addedEdge = get().edges.find(
      (e) => e.source === connection.source && e.target === connection.target
        && e.sourceHandle === connection.sourceHandle && e.targetHandle === connection.targetHandle
    );
    if (addedEdge) {
      const edgeId = addedEdge.id;
      const snapshot = { ...addedEdge };
      get().pushCommand({
        type: "add-edge",
        execute: () => set((s) => ({
          edges: [...s.edges, snapshot],
          isDirty: true, _mutationVersion: get()._mutationVersion + 1,
        })),
        undo: () => set((s) => ({
          edges: s.edges.filter((e) => e.id !== edgeId),
          isDirty: true, _mutationVersion: get()._mutationVersion + 1,
        })),
      });
    }
  },

  addNode: (type, x, y) => {
    const config = NODE_TYPE_CONFIGS[type];
    if (type === "storyboard") {
      const newNode: CanvasNode = {
        id: crypto.randomUUID(),
        type,
        position: { x: x - config.defaultWidth / 2, y: y - config.defaultHeight / 2 },
        width: config.defaultWidth,
        height: config.defaultHeight,
        data: {
          label: config.label,
          nodeType: type,
          rows: [createEmptyShotRow(1)],
          viewMode: "table",
          parseStatus: "idle",
          parseModelId: DEFAULT_STORYBOARD_PARSE_MODEL_ID,
        },
        style: {
          width: config.defaultWidth,
          height: config.defaultHeight,
        },
      };
      set((s) => ({ nodes: [...s.nodes, newNode], isDirty: true, _mutationVersion: get()._mutationVersion + 1 }));
      return;
    }
    const saved = get().lastSettings[type];
    const modelId = saved?.model_id || (type === "text" ? "deepseek/deepseek-v3.2" : type === "image-gen" ? "nano-banana-pro" : type === "video-gen" ? "seedance-2" : undefined);
    const newNode: CanvasNode = {
      id: crypto.randomUUID(),
      type,
      position: { x: x - config.defaultWidth / 2, y: y - config.defaultHeight / 2 },
      width: config.defaultWidth,
      height: config.defaultHeight,
      data: {
        label: config.label,
        nodeType: type,
        prompt: "",
        model_id: modelId,
        ...(type === "image-gen" ? { aspect_ratio: String(saved?.aspect_ratio || "16:9"), image_size: String(saved?.image_size || "2K") } : {}),
        ...(type === "video-gen" ? {
          aspect_ratio: String(saved?.aspect_ratio || "16:9"),
          duration_s: Number(saved?.duration_s) || 5,
          generate_audio: saved?.generate_audio !== undefined ? String(saved.generate_audio) === "true" : true,
          video_ref_mode: (String(saved?.video_ref_mode || "startEnd")) as "startEnd" | "imageRef" | "videoEdit" | "videoRef",
          fps: String(saved?.fps || "25"),
        } : {}),
        resolution: type === "video-gen" ? String(saved?.resolution || "720p") : "1024x1024",
        count: 1,
        status: "idle",
      },
      style: {
        width: config.defaultWidth,
        ...(type === "text" ? { height: config.defaultHeight } : {}),
      },
    };
    set((s) => ({ nodes: [...s.nodes, newNode], isDirty: true, _mutationVersion: get()._mutationVersion + 1 }));
  },

  addNodeWithData: (type, x, y, extraData, size) => {
    const config = NODE_TYPE_CONFIGS[type];
    const w = size?.w ?? config.defaultWidth;
    const h = size?.h ?? config.defaultHeight;
    const id = crypto.randomUUID();

    // Nudge position rightward to avoid overlapping existing nodes
    const GAP = 40;
    const MAX_ATTEMPTS = 20;
    let nx = x;
    const existingNodes = get().nodes;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const hasOverlap = existingNodes.some((n) => {
        const nw = Number(n.width ?? n.style?.width ?? 200);
        const nh = Number(n.height ?? n.style?.height ?? 200);
        return nx < n.position.x + nw && nx + w > n.position.x && y < n.position.y + nh && y + h > n.position.y;
      });
      if (!hasOverlap) break;
      // Find the rightmost edge of overlapping nodes and place after it
      let maxRight = nx;
      for (const n of existingNodes) {
        const nw = Number(n.width ?? n.style?.width ?? 200);
        const nh = Number(n.height ?? n.style?.height ?? 200);
        if (nx < n.position.x + nw && nx + w > n.position.x && y < n.position.y + nh && y + h > n.position.y) {
          maxRight = Math.max(maxRight, n.position.x + nw);
        }
      }
      nx = maxRight + GAP;
    }

    if (type === "storyboard") {
      const newNode: CanvasNode = {
        id,
        type,
        position: { x: nx, y },
        width: w,
        height: h,
        data: {
          label: config.label,
          nodeType: type,
          rows: [createEmptyShotRow(1)],
          viewMode: "table",
          parseStatus: "idle",
          parseModelId: DEFAULT_STORYBOARD_PARSE_MODEL_ID,
          ...extraData,
        },
        style: { width: w, height: h },
      };
      set((s) => ({ nodes: [...s.nodes, newNode], isDirty: true, _mutationVersion: get()._mutationVersion + 1 }));
      return id;
    }
    const saved = get().lastSettings[type];
    const modelId = saved?.model_id || (type === "text" ? "deepseek/deepseek-v3.2" : type === "image-gen" ? "nano-banana-pro" : type === "video-gen" ? "seedance-2" : undefined);
    const newNode: CanvasNode = {
      id,
      type,
      position: { x: nx, y },
      width: w,
      height: h,
      data: {
        label: config.label,
        nodeType: type,
        prompt: "",
        model_id: modelId,
        ...(type === "image-gen" ? { aspect_ratio: String(saved?.aspect_ratio || "16:9"), image_size: String(saved?.image_size || "2K") } : {}),
        ...(type === "video-gen" ? {
          aspect_ratio: String(saved?.aspect_ratio || "16:9"),
          duration_s: Number(saved?.duration_s) || 5,
          generate_audio: saved?.generate_audio !== undefined ? String(saved.generate_audio) === "true" : true,
          video_ref_mode: (String(saved?.video_ref_mode || "startEnd")) as "startEnd" | "imageRef" | "videoEdit" | "videoRef",
          fps: String(saved?.fps || "25"),
        } : {}),
        resolution: type === "video-gen" ? String(saved?.resolution || "720p") : "1024x1024",
        count: 1,
        status: "idle",
        ...extraData,
      },
      style: { width: w, height: h },
      ...(type === "group" ? { zIndex: -1 } : {}),
    };
    set((s) => ({ nodes: [...s.nodes, newNode], isDirty: true, _mutationVersion: get()._mutationVersion + 1 }));
    return id;
  },

  addEdgeById: (sourceId, targetId) => {
    const edge: CanvasEdge = {
      id: `e-${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      sourceHandle: "out",
      targetHandle: "ref-in",
      type: "default",
    };
    set((s) => ({ edges: [...s.edges, edge], isDirty: true, _mutationVersion: get()._mutationVersion + 1 }));
  },

  updateNodeData: (id, data) => {
    const node = get()._nodeMap.get(id);
    const nodeType = node?.data?.nodeType as string | undefined;
    const trackable = new Set(["text", "image-gen", "video-gen", "audio-gen"]);
    const trackKeys = ["model_id", "image_size", "aspect_ratio", "duration_s", "generate_audio", "video_ref_mode", "resolution", "fps"];

    let settingsPatch: Record<string, string> | null = null;
    if (nodeType && trackable.has(nodeType)) {
      for (const k of trackKeys) {
        if (data[k] !== undefined) {
          if (!settingsPatch) settingsPatch = {};
          settingsPatch[k] = String(data[k]);
        }
      }
    }

    // Auto-set generationStartedAt when status transitions to running/queued
    let mergedData = data;
    if (data.status === "running" || data.status === "queued") {
      const prevStatus = node?.data?.status;
      if (prevStatus !== "running" && prevStatus !== "queued") {
        mergedData = { ...data, generationStartedAt: Date.now() };
      }
    } else if (data.status) {
      mergedData = { ...data, generationStartedAt: undefined };
    }

    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...mergedData } } : n
      ),
      isDirty: true, _mutationVersion: get()._mutationVersion + 1,
      ...(settingsPatch && nodeType
        ? { lastSettings: { ...s.lastSettings, [nodeType]: { ...s.lastSettings[nodeType], ...settingsPatch } } }
        : {}),
    }));
  },

  updateNodeSize: (id, width, height) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? { ...n, width, height, style: { ...n.style, width, height } }
          : n
      ),
      isDirty: true, _mutationVersion: get()._mutationVersion + 1,
    }));
  },

  deleteSelected: () => {
    const s = get();
    const selectedNodeIds = new Set(s.nodes.filter((n) => n.selected).map((n) => n.id));
    const selectedEdgeIds = new Set(s.edges.filter((e) => e.selected).map((e) => e.id));
    for (const n of s.nodes) {
      if (n.data.groupId && selectedNodeIds.has(String(n.data.groupId))) selectedNodeIds.add(n.id);
    }
    const removedNodes = s.nodes.filter((n) => selectedNodeIds.has(n.id));
    const removedEdges = s.edges.filter(
      (e) => selectedEdgeIds.has(e.id) || selectedNodeIds.has(e.source) || selectedNodeIds.has(e.target)
    );
    if (removedNodes.length === 0 && removedEdges.length === 0) return;

    set({
      nodes: s.nodes.filter((n) => !selectedNodeIds.has(n.id)),
      edges: s.edges.filter(
        (e) => !selectedEdgeIds.has(e.id) && !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target)
      ),
      isDirty: true, _mutationVersion: get()._mutationVersion + 1,
      selectedNodeIds: new Set(),
      hasSelectedTextNode: false,
    });

    const removedNodeIds = new Set(removedNodes.map((n) => n.id));
    const removedEdgeIds = new Set(removedEdges.map((e) => e.id));
    get().pushCommand({
      type: "batch",
      execute: () => set((prev) => ({
        nodes: prev.nodes.filter((n) => !removedNodeIds.has(n.id)),
        edges: prev.edges.filter((e) => !removedEdgeIds.has(e.id) && !removedNodeIds.has(e.source) && !removedNodeIds.has(e.target)),
        isDirty: true, _mutationVersion: get()._mutationVersion + 1,
        selectedNodeIds: new Set(),
        hasSelectedTextNode: false,
      })),
      undo: () => set((prev) => ({
        nodes: [...prev.nodes, ...removedNodes],
        edges: [...prev.edges, ...removedEdges],
        isDirty: true, _mutationVersion: get()._mutationVersion + 1,
      })),
    });
  },

  deleteNodeById: (nodeId) => {
    const s = get();
    const removedNode = s._nodeMap.get(nodeId);
    if (!removedNode) return;
    const removedEdges = s.edges.filter((e) => e.source === nodeId || e.target === nodeId);

    set((prev) => ({
      nodes: prev.nodes.filter((n) => n.id !== nodeId),
      edges: prev.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      isDirty: true, _mutationVersion: get()._mutationVersion + 1,
    }));

    get().pushCommand({
      type: "remove-node",
      execute: () => set((prev) => ({
        nodes: prev.nodes.filter((n) => n.id !== nodeId),
        edges: prev.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
        isDirty: true, _mutationVersion: get()._mutationVersion + 1,
      })),
      undo: () => set((prev) => ({
        nodes: [...prev.nodes, removedNode],
        edges: [...prev.edges, ...removedEdges],
        isDirty: true, _mutationVersion: get()._mutationVersion + 1,
      })),
    });
  },

  deleteEdgeById: (edgeId) => {
    const s = get();
    const removedEdge = s.edges.find((e) => e.id === edgeId);
    if (!removedEdge) return;

    set((prev) => ({
      edges: prev.edges.filter((e) => e.id !== edgeId),
      isDirty: true, _mutationVersion: get()._mutationVersion + 1,
    }));

    get().pushCommand({
      type: "remove-edge",
      execute: () => set((prev) => ({
        edges: prev.edges.filter((e) => e.id !== edgeId),
        isDirty: true, _mutationVersion: get()._mutationVersion + 1,
      })),
      undo: () => set((prev) => ({
        edges: [...prev.edges, removedEdge],
        isDirty: true, _mutationVersion: get()._mutationVersion + 1,
      })),
    });
  },

  selectAll: () => {
    set((s) => ({
      nodes: s.nodes.map((n) => ({ ...n, selected: true })),
      selectedNodeIds: new Set(s.nodes.map((n) => n.id)),
      hasSelectedTextNode: s.nodes.some((n) => n.data.nodeType === "text"),
    }));
  },

  copySelected: () => {
    const s = get();
    const selected = s.nodes.filter((n) => n.selected && !isNodeGenerating(n));
    if (selected.length === 0) return;
    const selectedIds = new Set(selected.map((n) => n.id));
    const relatedEdges = s.edges.filter(
      (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
    );
    const externalEdges = s.edges.filter(
      (e) =>
        (selectedIds.has(e.source) && !selectedIds.has(e.target)) ||
        (!selectedIds.has(e.source) && selectedIds.has(e.target))
    );
    set({ clipboard: { nodes: selected, edges: relatedEdges, externalEdges } });
    pasteCounter = 0;
  },

  pasteClipboard: () => {
    const s = get();
    if (!s.clipboard || s.clipboard.nodes.length === 0) return;
    pasteCounter++;
    const offset = pasteCounter * 40;
    const idMap = new Map<string, string>();
    s.clipboard.nodes.forEach((n) => idMap.set(n.id, crypto.randomUUID()));

    const newNodes: CanvasNode[] = s.clipboard.nodes.map((n) => ({
      ...n,
      id: idMap.get(n.id)!,
      position: { x: n.position.x + offset, y: n.position.y + offset },
      selected: true,
    }));

    const newEdges: CanvasEdge[] = s.clipboard.edges.map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
    }));

    const existingNodeIds = new Set(s.nodes.map((n) => n.id));
    const extEdges: CanvasEdge[] = (s.clipboard.externalEdges ?? [])
      .filter((e) => {
        const externalId = idMap.has(e.source) ? e.target : e.source;
        return existingNodeIds.has(externalId);
      })
      .map((e) => ({
        ...e,
        id: crypto.randomUUID(),
        source: idMap.get(e.source) ?? e.source,
        target: idMap.get(e.target) ?? e.target,
      }));

    set({
      nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
      edges: [...s.edges, ...newEdges, ...extEdges],
      isDirty: true, _mutationVersion: get()._mutationVersion + 1,
      selectedNodeIds: new Set(newNodes.map((n) => n.id)),
    });
  },

  duplicateSelected: () => {
    const s = get();
    const selected = s.nodes.filter((n) => n.selected && !isNodeGenerating(n));
    if (selected.length === 0) return;
    const selectedIds = new Set(selected.map((n) => n.id));
    const relatedEdges = s.edges.filter(
      (e) => selectedIds.has(e.source) && selectedIds.has(e.target)
    );
    const externalEdges = s.edges.filter(
      (e) =>
        (selectedIds.has(e.source) && !selectedIds.has(e.target)) ||
        (!selectedIds.has(e.source) && selectedIds.has(e.target))
    );
    const idMap = new Map<string, string>();
    selected.forEach((n) => idMap.set(n.id, crypto.randomUUID()));

    const newNodes: CanvasNode[] = selected.map((n) => ({
      ...n,
      id: idMap.get(n.id)!,
      position: { x: n.position.x + 40, y: n.position.y + 40 },
      selected: true,
    }));

    const newEdges: CanvasEdge[] = relatedEdges.map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
    }));

    const extEdges: CanvasEdge[] = externalEdges.map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      source: idMap.get(e.source) ?? e.source,
      target: idMap.get(e.target) ?? e.target,
    }));

    set({
      nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
      edges: [...s.edges, ...newEdges, ...extEdges],
      isDirty: true, _mutationVersion: get()._mutationVersion + 1,
      selectedNodeIds: new Set(newNodes.map((n) => n.id)),
    });
  },

  groupSelected: () => {
    const s = get();
    const selected = s.nodes.filter((n) => n.selected && n.data.nodeType !== "group");
    if (selected.length < 2) return;

    const groupId = crypto.randomUUID();
    const selectedIds = new Set(selected.map((n) => n.id));

    const updatedNodes = s.nodes.map((n) => {
      if (!selectedIds.has(n.id)) return { ...n, selected: false };
      return { ...n, data: { ...n.data, groupId }, selected: false };
    });

    const groupNode: CanvasNode = {
      id: groupId,
      type: "group",
      position: { x: 0, y: 0 },
      data: { label: "组合", nodeType: "group" as NodeType, groupColor: "#6b7280" },
      style: { width: 0, height: 0 },
      zIndex: -1,
    };

    const allNodes = [groupNode, ...updatedNodes];
    const fitted = fitGroupToChildren(allNodes, groupId);

    set({
      nodes: fitted,
      isDirty: true, _mutationVersion: get()._mutationVersion + 1,
      selectedNodeIds: new Set([groupId]),
    });
  },

  ungroupNode: (groupId) => {
    const s = get();
    const groupNode = s._nodeMap.get(groupId);
    if (!groupNode || groupNode.data.nodeType !== "group") return;

    const updatedNodes = s.nodes
      .filter((n) => n.id !== groupId)
      .map((n) => {
        if (n.data.groupId !== groupId) return n;
        const { groupId: _, ...restData } = n.data;
        return { ...n, data: restData };
      });

    set({ nodes: updatedNodes, isDirty: true, _mutationVersion: get()._mutationVersion + 1 });
  },

  deleteGroup: (groupId) => {
    const s = get();
    const removeIds = new Set(
      s.nodes.filter((n) => n.id === groupId || n.data.groupId === groupId).map((n) => n.id)
    );
    set({
      nodes: s.nodes.filter((n) => !removeIds.has(n.id)),
      edges: s.edges.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target)),
      isDirty: true, _mutationVersion: get()._mutationVersion + 1,
      selectedNodeIds: new Set(),
      hasSelectedTextNode: false,
    });
  },

  alignSelected: (direction) => {
    const s = get();
    const selected = s.nodes.filter((n) => n.selected);
    if (selected.length < 2) return;

    const getW = (n: CanvasNode) => Number(n.style?.width ?? n.width ?? 280);
    const getH = (n: CanvasNode) => Number(n.style?.height ?? n.height ?? 200);
    const ANTI_OVERLAP_GAP = 24;

    let updatedPositions: Map<string, { x: number; y: number }>;

    switch (direction) {
      case "left": {
        const target = Math.min(...selected.map((n) => n.position.x));
        updatedPositions = new Map(selected.map((n) => [n.id, { x: target, y: n.position.y }]));
        break;
      }
      case "right": {
        const target = Math.max(...selected.map((n) => n.position.x + getW(n)));
        updatedPositions = new Map(selected.map((n) => [n.id, { x: target - getW(n), y: n.position.y }]));
        break;
      }
      case "center-h": {
        const minX = Math.min(...selected.map((n) => n.position.x));
        const maxX = Math.max(...selected.map((n) => n.position.x + getW(n)));
        const cx = (minX + maxX) / 2;
        updatedPositions = new Map(selected.map((n) => [n.id, { x: cx - getW(n) / 2, y: n.position.y }]));
        break;
      }
      case "top": {
        const target = Math.min(...selected.map((n) => n.position.y));
        updatedPositions = new Map(selected.map((n) => [n.id, { x: n.position.x, y: target }]));
        break;
      }
      case "bottom": {
        const target = Math.max(...selected.map((n) => n.position.y + getH(n)));
        updatedPositions = new Map(selected.map((n) => [n.id, { x: n.position.x, y: target - getH(n) }]));
        break;
      }
      case "center-v": {
        const minY = Math.min(...selected.map((n) => n.position.y));
        const maxY = Math.max(...selected.map((n) => n.position.y + getH(n)));
        const cy = (minY + maxY) / 2;
        updatedPositions = new Map(selected.map((n) => [n.id, { x: n.position.x, y: cy - getH(n) / 2 }]));
        break;
      }
    }

    // Anti-overlap: after alignment, check perpendicular axis for overlaps and redistribute if needed
    const isHorizontalAlign = direction === "left" || direction === "right" || direction === "center-h";
    if (isHorizontalAlign) {
      // Sort by original Y position, check vertical overlap
      const sorted = [...selected].sort((a, b) => a.position.y - b.position.y);
      let hasOverlap = false;
      for (let i = 1; i < sorted.length; i++) {
        const prevPos = updatedPositions.get(sorted[i - 1].id)!;
        const curPos = updatedPositions.get(sorted[i].id)!;
        const prevBottom = prevPos.y + getH(sorted[i - 1]);
        if (curPos.y < prevBottom + ANTI_OVERLAP_GAP) {
          hasOverlap = true;
          break;
        }
      }
      if (hasOverlap) {
        let y = updatedPositions.get(sorted[0].id)!.y;
        for (const n of sorted) {
          const pos = updatedPositions.get(n.id)!;
          updatedPositions.set(n.id, { x: pos.x, y });
          y += getH(n) + ANTI_OVERLAP_GAP;
        }
      }
    } else {
      // Sort by original X position, check horizontal overlap
      const sorted = [...selected].sort((a, b) => a.position.x - b.position.x);
      let hasOverlap = false;
      for (let i = 1; i < sorted.length; i++) {
        const prevPos = updatedPositions.get(sorted[i - 1].id)!;
        const curPos = updatedPositions.get(sorted[i].id)!;
        const prevRight = prevPos.x + getW(sorted[i - 1]);
        if (curPos.x < prevRight + ANTI_OVERLAP_GAP) {
          hasOverlap = true;
          break;
        }
      }
      if (hasOverlap) {
        let x = updatedPositions.get(sorted[0].id)!.x;
        for (const n of sorted) {
          const pos = updatedPositions.get(n.id)!;
          updatedPositions.set(n.id, { x, y: pos.y });
          x += getW(n) + ANTI_OVERLAP_GAP;
        }
      }
    }

    // Capture original positions for undo
    const originalPositions = new Map(selected.map((n) => [n.id, { ...n.position }]));

    const applyPositions = (positions: Map<string, { x: number; y: number }>) => {
      set((prev) => ({
        nodes: prev.nodes.map((n) => {
          const pos = positions.get(n.id);
          return pos ? { ...n, position: pos } : n;
        }),
        isDirty: true, _mutationVersion: get()._mutationVersion + 1,
      }));
    };

    applyPositions(updatedPositions);

    const cmd: Command = {
      type: "move-node",
      execute: () => applyPositions(updatedPositions),
      undo: () => applyPositions(originalPositions),
    };
    get().pushCommand(cmd);
  },

  distributeSelected: (axis) => {
    const s = get();
    const selected = s.nodes.filter((n) => n.selected);
    if (selected.length < 3) return;

    const getW = (n: CanvasNode) => Number(n.style?.width ?? n.width ?? 280);
    const getH = (n: CanvasNode) => Number(n.style?.height ?? n.height ?? 200);
    const MIN_GAP = 24;

    const updatedPositions = new Map<string, { x: number; y: number }>();

    if (axis === "horizontal") {
      const sorted = [...selected].sort((a, b) => a.position.x - b.position.x);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalSpan = (last.position.x + getW(last)) - first.position.x;
      const totalNodeWidth = sorted.reduce((sum, n) => sum + getW(n), 0);
      const gap = Math.max(MIN_GAP, (totalSpan - totalNodeWidth) / (sorted.length - 1));
      let x = first.position.x;
      for (const n of sorted) {
        updatedPositions.set(n.id, { x, y: n.position.y });
        x += getW(n) + gap;
      }
    } else {
      const sorted = [...selected].sort((a, b) => a.position.y - b.position.y);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalSpan = (last.position.y + getH(last)) - first.position.y;
      const totalNodeHeight = sorted.reduce((sum, n) => sum + getH(n), 0);
      const gap = Math.max(MIN_GAP, (totalSpan - totalNodeHeight) / (sorted.length - 1));
      let y = first.position.y;
      for (const n of sorted) {
        updatedPositions.set(n.id, { x: n.position.x, y });
        y += getH(n) + gap;
      }
    }

    // Capture original positions for undo
    const originalPositions = new Map(selected.map((n) => [n.id, { ...n.position }]));

    const applyPositions = (positions: Map<string, { x: number; y: number }>) => {
      set((prev) => ({
        nodes: prev.nodes.map((n) => {
          const pos = positions.get(n.id);
          return pos ? { ...n, position: pos } : n;
        }),
        isDirty: true, _mutationVersion: get()._mutationVersion + 1,
      }));
    };

    applyPositions(updatedPositions);

    const cmd: Command = {
      type: "move-node",
      execute: () => applyPositions(updatedPositions),
      undo: () => applyPositions(originalPositions),
    };
    get().pushCommand(cmd);
  },

  layoutGroupHorizontal: (groupId) => {
    const s = get();
    const children = s.nodes.filter((n) => n.data.groupId === groupId);
    if (children.length === 0) return;

    const getW = (n: CanvasNode) => Number(n.style?.width ?? n.width ?? 280);
    const getH = (n: CanvasNode) => Number(n.style?.height ?? n.height ?? 200);
    const GAP_X = 60;
    const GAP_Y = 40;

    const childIds = new Set(children.map((n) => n.id));
    const groupEdges = s.edges.filter((e) => childIds.has(e.source) && childIds.has(e.target));

    // Build adjacency and in-degree for topological sort
    const adj = new Map<string, string[]>();
    const inDeg = new Map<string, number>();
    for (const c of children) { adj.set(c.id, []); inDeg.set(c.id, 0); }
    for (const e of groupEdges) {
      adj.get(e.source)?.push(e.target);
      inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    }

    // Kahn's algorithm — assign layers
    const layers: string[][] = [];
    const layerOf = new Map<string, number>();
    let queue = children.filter((n) => (inDeg.get(n.id) ?? 0) === 0).map((n) => n.id);
    // Fallback: if no roots found (cycle), treat all as layer 0
    if (queue.length === 0) queue = children.map((n) => n.id);

    while (queue.length > 0) {
      layers.push([...queue]);
      for (const id of queue) layerOf.set(id, layers.length - 1);
      const next: string[] = [];
      for (const id of queue) {
        for (const t of (adj.get(id) ?? [])) {
          const d = (inDeg.get(t) ?? 1) - 1;
          inDeg.set(t, d);
          if (d === 0 && !layerOf.has(t)) next.push(t);
        }
      }
      queue = next;
    }
    // Place unvisited nodes (cycles) in a final layer
    const unvisited = children.filter((n) => !layerOf.has(n.id));
    if (unvisited.length > 0) {
      layers.push(unvisited.map((n) => n.id));
      for (const n of unvisited) layerOf.set(n.id, layers.length - 1);
    }

    const nodeMap = new Map(children.map((n) => [n.id, n]));
    // Compute positions: each layer is a column, nodes stacked vertically
    const anchor = children.reduce(
      (best, n) => (n.position.x < best.x || (n.position.x === best.x && n.position.y < best.y) ? { x: n.position.x, y: n.position.y } : best),
      { x: Infinity, y: Infinity },
    );
    let curX = anchor.x;
    const updatedPositions = new Map<string, { x: number; y: number }>();
    for (const layer of layers) {
      // Sort within layer by original Y position for stable ordering
      layer.sort((a, b) => (nodeMap.get(a)!.position.y - nodeMap.get(b)!.position.y));
      let maxW = 0;
      let curY = anchor.y;
      for (const id of layer) {
        const n = nodeMap.get(id)!;
        updatedPositions.set(id, { x: curX, y: curY });
        curY += getH(n) + GAP_Y;
        maxW = Math.max(maxW, getW(n));
      }
      curX += maxW + GAP_X;
    }

    const updated = s.nodes.map((n) => {
      const pos = updatedPositions.get(n.id);
      return pos ? { ...n, position: pos } : n;
    });
    set({
      nodes: fitGroupToChildren(updated, groupId),
      isDirty: true, _mutationVersion: get()._mutationVersion + 1,
    });
  },

  layoutGroupGrid: (groupId) => {
    const s = get();
    const children = s.nodes.filter((n) => n.data.groupId === groupId);
    if (children.length === 0) return;

    const getW = (n: CanvasNode) => Number(n.style?.width ?? n.width ?? 280);
    const getH = (n: CanvasNode) => Number(n.style?.height ?? n.height ?? 200);
    const GAP = 30;

    // Sort by original position: top-to-bottom, left-to-right
    const sorted = [...children].sort((a, b) => {
      const dy = a.position.y - b.position.y;
      return Math.abs(dy) > 50 ? dy : a.position.x - b.position.x;
    });

    const cols = Math.ceil(Math.sqrt(sorted.length));
    const anchor = sorted.reduce(
      (best, n) => ({ x: Math.min(best.x, n.position.x), y: Math.min(best.y, n.position.y) }),
      { x: Infinity, y: Infinity },
    );

    // Compute max width per column and max height per row
    const colWidths: number[] = new Array(cols).fill(0);
    const rowCount = Math.ceil(sorted.length / cols);
    const rowHeights: number[] = new Array(rowCount).fill(0);
    for (let i = 0; i < sorted.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      colWidths[col] = Math.max(colWidths[col], getW(sorted[i]));
      rowHeights[row] = Math.max(rowHeights[row], getH(sorted[i]));
    }

    const updatedPositions = new Map<string, { x: number; y: number }>();
    for (let i = 0; i < sorted.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = anchor.x + colWidths.slice(0, col).reduce((s, w) => s + w + GAP, 0);
      const y = anchor.y + rowHeights.slice(0, row).reduce((s, h) => s + h + GAP, 0);
      updatedPositions.set(sorted[i].id, { x, y });
    }

    const updated = s.nodes.map((n) => {
      const pos = updatedPositions.get(n.id);
      return pos ? { ...n, position: pos } : n;
    });
    set({
      nodes: fitGroupToChildren(updated, groupId),
      isDirty: true, _mutationVersion: get()._mutationVersion + 1,
    });
  },

  lastSavedSnapshot: null,
  setLastSavedSnapshot: (snapshot) => set({ lastSavedSnapshot: snapshot }),

  markClean: (savedAtVersion?: number) => set((s) => {
    if (savedAtVersion !== undefined && savedAtVersion !== s._mutationVersion) return {};
    return { isDirty: false };
  }),

  getSerializableState: (viewport) => {
    const s = get();
    return {
      nodes: s.nodes.map(toSerializedNode),
      edges: s.edges.map(toSerializedEdge),
      viewport: viewport ?? { x: 0, y: 0, zoom: 1 },
    };
  },

  loadFromSerialized: (data) => {
    const loaded = (data.nodes ?? []).map(toReactFlowNode);
    loaded.sort((a, b) => (a.type === "group" ? -1 : 0) - (b.type === "group" ? -1 : 0));
    // Auto-fix stale "running"/"queued" states from previous sessions
    for (const node of loaded) {
      if (node.data && (node.data.status === "running" || node.data.status === "queued")) {
        node.data = { ...node.data, status: "idle", jobId: undefined };
      }
    }
    set({
      nodes: loaded,
      edges: (data.edges ?? []).map(toReactFlowEdge),
      isDirty: false,
      selectedNodeIds: new Set(),
      hasSelectedTextNode: false,
    });
  },
}; });
}

export const useCanvasStore = createCanvasStore();

if (typeof window !== "undefined") {
  (window as any).__ZUSTAND_CANVAS_STORE__ = useCanvasStore;
}
