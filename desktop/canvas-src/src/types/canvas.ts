import type { Node, Edge, Viewport } from "@xyflow/react";
import type {
  StoryboardDirectorPlan,
  ShotRow,
  StoryboardParseStrategy,
  StoryboardParseStatus,
  StoryboardSourceSummary,
  StoryboardViewMode,
} from "./storyboard";

// ─── Node Types ──────────────────────────────
export type NodeType =
  | "text"
  | "prompt"
  | "source-image"
  | "source-audio"
  | "image-gen"
  | "video-gen"
  | "note"
  | "upscale"
  | "video-upscale"
  | "rembg"
  | "audio-gen"
  | "storyboard"
  | "group"
  | "comment";

export interface NodeData extends Record<string, unknown> {
  label: string;
  nodeType: NodeType;
  content?: string;
  prompt?: string;
  promptMode?: string;
  promptRuleLevel?: "lite" | "full";
  promptSubject?: string;
  promptScene?: string;
  promptAction?: string;
  promptStyle?: string;
  promptCamera?: string;
  promptLighting?: string;
  promptMotion?: string;
  promptMood?: string;
  promptNegative?: string;
  promptMaterialNotes?: Array<{ id: string; type: "image" | "video" | "audio"; note: string }>;
  prompt_json?: unknown;
  model_id?: string;
  resolution?: string;
  aspect_ratio?: string;
  image_size?: string;
  style_preset?: string;
  count?: number;
  imageUrl?: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  thumbnailLevels?: { sm?: string; md?: string; lg?: string };
  thumbnailLevelsList?: Array<{ sm?: string; md?: string; lg?: string }>;
  videoUrl?: string;
  originalVideoUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  duration_s?: number;
  generate_audio?: boolean;
  video_ref_mode?: "startEnd" | "imageRef" | "videoEdit" | "videoRef";
  video_ref_order?: number[];
  camera_motion?: string;
  imageUrls?: string[];
  originalImageUrls?: string[];
  thumbnailUrls?: string[];
  primaryImageIndex?: number;
  sourceImageUrl?: string;
  maskDataUrl?: string;
  status?: "idle" | "queued" | "running" | "uploading" | "succeeded" | "failed";
  generationStartedAt?: number;
  generationProgress?: string;

  /** storyboard node — rows live in canvas JSON (no base64). */
  rows?: ShotRow[];
  viewMode?: StoryboardViewMode;
  parseStatus?: StoryboardParseStatus;
  parseJobId?: string;
  errorMessage?: string;
  sourceSummary?: StoryboardSourceSummary;
  /** T8Star Gemini 模型 id，用于「解析为分镜」 */
  parseModelId?: string;
  parseMaxShots?: number;
  parseStrategy?: StoryboardParseStrategy;
  directorRules?: string;
  directorPlan?: StoryboardDirectorPlan;
}

export type CanvasNode = Node<NodeData>;
export type CanvasEdge = Edge;
export { Viewport };

// ─── DB Serialization Format (backward-compatible with DAG engine) ──
export interface SerializedNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  data: Record<string, unknown>;
  ports: PortDef[];
}

export interface SerializedEdge {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

export interface PortDef {
  id: string;
  label: string;
  dataType: "text" | "image" | "video" | "any";
  direction: "input" | "output";
}

export interface SerializedCanvas {
  nodes: SerializedNode[];
  edges: SerializedEdge[];
  viewport: { x: number; y: number; zoom: number };
}

// ─── Node Type Config ──────────────────────────
export interface NodeTypeConfig {
  type: NodeType;
  label: string;
  defaultWidth: number;
  defaultHeight: number;
  color: string;
  iconLabel: string;
  ports: PortDef[];
}

// ─── Conversion helpers ──────────────────────────

const API_FILES_HTTP_RE = /^\/api\/files\/(https?:\/\/)/;
function sanitizeNodeUrls(data: Record<string, unknown>): Record<string, unknown> {
  const urlKeys = [
    "imageUrl", "originalUrl", "videoUrl", "originalVideoUrl",
    "thumbnailUrl", "audioUrl", "sourceImageUrl",
  ];
  let changed = false;
  const patched: Record<string, unknown> = {};
  for (const key of urlKeys) {
    const val = data[key];
    if (typeof val === "string" && API_FILES_HTTP_RE.test(val)) {
      patched[key] = val.replace(API_FILES_HTTP_RE, "$1");
      changed = true;
    }
  }
  const arrKeys = ["imageUrls", "originalImageUrls", "thumbnailUrls"];
  for (const key of arrKeys) {
    const arr = data[key];
    if (Array.isArray(arr)) {
      const fixed = arr.map((v: unknown) =>
        typeof v === "string" && API_FILES_HTTP_RE.test(v) ? v.replace(API_FILES_HTTP_RE, "$1") : v,
      );
      if (fixed.some((v: unknown, i: number) => v !== arr[i])) {
        patched[key] = fixed;
        changed = true;
      }
    }
  }
  return changed ? { ...data, ...patched } : data;
}

export function toReactFlowNode(sn: any): CanvasNode {
  const nodeType = sn.type || sn.nodeType || "text";
  const rawData = sn.data || sn;
  const cleanData = sanitizeNodeUrls(rawData);
  const label = sn.label || rawData.label || NODE_TYPE_CONFIGS[nodeType as NodeType]?.label || "";
  return {
    id: sn.id,
    type: nodeType === "group" ? "group" : nodeType === "comment" ? "comment" : nodeType,
    position: { x: sn.x || 0, y: sn.y || 0 },
    data: {
      ...cleanData,
      label,
      nodeType: nodeType as NodeType,
    },
    style: {
      width: sn.width,
      height: sn.height,
    },
    ...(nodeType === "group" ? { zIndex: -1 } : {}),
  };
}

function toSizeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function toSerializedNode(n: CanvasNode): SerializedNode {
  const { label, nodeType, ...rest } = n.data;
  const config = NODE_TYPE_CONFIGS[nodeType];
  const width =
    toSizeNumber(n.style?.width) ??
    toSizeNumber(n.width) ??
    toSizeNumber(n.measured?.width) ??
    config?.defaultWidth ??
    280;
  const height =
    toSizeNumber(n.style?.height) ??
    toSizeNumber(n.height) ??
    toSizeNumber(n.measured?.height) ??
    config?.defaultHeight ??
    200;
  return {
    id: n.id,
    type: nodeType,
    x: n.position.x,
    y: n.position.y,
    width,
    height,
    label: label,
    data: rest,
    ports: config?.ports ?? [],
  };
}

export function toReactFlowEdge(se: SerializedEdge): CanvasEdge {
  return {
    id: se.id,
    source: se.sourceNodeId,
    target: se.targetNodeId,
    sourceHandle: se.sourcePortId,
    targetHandle: se.targetPortId,
    type: "default",
  };
}

export function toSerializedEdge(e: CanvasEdge): SerializedEdge {
  return {
    id: e.id,
    sourceNodeId: e.source,
    sourcePortId: e.sourceHandle ?? "out",
    targetNodeId: e.target,
    targetPortId: e.targetHandle ?? "ref-in",
  };
}

// ─── Node Type Registry ──────────────────────────

export const NODE_TYPE_CONFIGS: Record<NodeType, NodeTypeConfig> = {
  "text": {
    type: "text",
    label: "Text",
    defaultWidth: 240,
    defaultHeight: 200,
    color: "#a3a3a3",
    iconLabel: "TXT",
    ports: [
      { id: "ref-in", label: "输入", dataType: "any", direction: "input" },
      { id: "out", label: "输出", dataType: "text", direction: "output" },
    ],
  },
  "prompt": {
    type: "prompt",
    label: "提示词",
    defaultWidth: 300,
    defaultHeight: 220,
    color: "#38bdf8",
    iconLabel: "PRM",
    ports: [
      { id: "ref-in", label: "参考", dataType: "any", direction: "input" },
      { id: "out", label: "输出", dataType: "text", direction: "output" },
    ],
  },
  "source-image": {
    type: "source-image",
    label: "源图片",
    defaultWidth: 280,
    defaultHeight: 280,
    color: "#3b82f6",
    iconLabel: "IMG",
    ports: [
      { id: "out", label: "输出", dataType: "image", direction: "output" },
    ],
  },
  "source-audio": {
    type: "source-audio",
    label: "源音频",
    defaultWidth: 320,
    defaultHeight: 260,
    color: "#ec4899",
    iconLabel: "AUD",
    ports: [
      { id: "out", label: "输出", dataType: "any", direction: "output" },
    ],
  },
  "image-gen": {
    type: "image-gen",
    label: "图片生成",
    defaultWidth: 280,
    defaultHeight: 280,
    color: "#8b5cf6",
    iconLabel: "AI",
    ports: [
      { id: "ref-in", label: "参考", dataType: "any", direction: "input" },
      { id: "out", label: "输出", dataType: "image", direction: "output" },
    ],
  },
  "video-gen": {
    type: "video-gen",
    label: "视频生成",
    defaultWidth: 280,
    defaultHeight: 280,
    color: "#10b981",
    iconLabel: "VID",
    ports: [
      { id: "ref-in", label: "参考", dataType: "any", direction: "input" },
      { id: "out", label: "输出", dataType: "video", direction: "output" },
    ],
  },
  "note": {
    type: "note",
    label: "便签",
    defaultWidth: 200,
    defaultHeight: 160,
    color: "#eab308",
    iconLabel: "NOTE",
    ports: [],
  },
  "upscale": {
    type: "upscale",
    label: "超分辨率",
    defaultWidth: 280,
    defaultHeight: 280,
    color: "#f97316",
    iconLabel: "UP",
    ports: [
      { id: "ref-in", label: "输入图片", dataType: "image", direction: "input" },
      { id: "out", label: "输出", dataType: "image", direction: "output" },
    ],
  },
  "video-upscale": {
    type: "video-upscale",
    label: "视频增强",
    defaultWidth: 280,
    defaultHeight: 280,
    color: "#f97316",
    iconLabel: "VUP",
    ports: [
      { id: "ref-in", label: "输入视频", dataType: "video", direction: "input" },
      { id: "out", label: "输出", dataType: "video", direction: "output" },
    ],
  },
  "rembg": {
    type: "rembg",
    label: "去背景",
    defaultWidth: 280,
    defaultHeight: 280,
    color: "#06b6d4",
    iconLabel: "BG",
    ports: [
      { id: "ref-in", label: "输入图片", dataType: "image", direction: "input" },
      { id: "out", label: "输出", dataType: "image", direction: "output" },
    ],
  },
  "audio-gen": {
    type: "audio-gen",
    label: "音频生成",
    defaultWidth: 280,
    defaultHeight: 280,
    color: "#ec4899",
    iconLabel: "AUD",
    ports: [
      { id: "ref-in", label: "参考", dataType: "any", direction: "input" },
      { id: "out", label: "输出", dataType: "any", direction: "output" },
    ],
  },
  storyboard: {
    type: "storyboard",
    label: "分镜表",
    defaultWidth: 520,
    defaultHeight: 420,
    color: "#a3a3a3",
    iconLabel: "SB",
    ports: [
      { id: "ref-in", label: "参考", dataType: "any", direction: "input" },
    ],
  },
  "group": {
    type: "group",
    label: "组合",
    defaultWidth: 400,
    defaultHeight: 300,
    color: "#6b7280",
    iconLabel: "GRP",
    ports: [],
  },
  "comment": {
    type: "comment",
    label: "评论",
    defaultWidth: 300,
    defaultHeight: 120,
    color: "#CCFF00",
    iconLabel: "CMT",
    ports: [],
  },
};

// ─── Command (undo/redo) ──────────────────────────
export type CommandType =
  | "add-node"
  | "remove-node"
  | "move-node"
  | "add-edge"
  | "remove-edge"
  | "batch";

export interface Command {
  type: CommandType;
  execute: () => void;
  undo: () => void;
}
