import type { ComponentType } from "react";
import type { NodeData, NodeType } from "@/types/canvas";
import type { PromptEditorHandle, ElementRef } from "./PromptEditor";

export interface ConnectedRefNode {
  nodeId: string;
  url: string;
  thumbnailUrl: string;
  label: string;
}

export interface ConnectedRefs {
  images: string[];
  thumbnails: string[];
  videos: string[];
  audios: string[];
  imageNodes: ConnectedRefNode[];
  videoNodes: ConnectedRefNode[];
  audioNodes: ConnectedRefNode[];
  textNodes: { id: string; label: string; content: string }[];
}

export interface NodeUpdaters {
  updateData: (data: Partial<NodeData>) => void;
  updateSize: (width: number, height: number) => void;
  addNodeWithData: (type: NodeType, x: number, y: number, data: Partial<NodeData>, size?: { w: number; h: number }) => string;
  addEdgeById: (sourceId: string, targetId: string) => void;
  deleteEdgeById: (edgeId: string) => void;
}

export interface IdleViewProps {
  id: string;
  data: NodeData;
  selected: boolean;
  soloSelected: boolean;
  isZoomedOut: boolean;
  zoom: number;
  updaters: NodeUpdaters;
}

export interface ActiveViewProps {
  id: string;
  data: NodeData;
  updaters: NodeUpdaters;
  connectedRefs: ConnectedRefs;
  promptEditorRef?: React.RefObject<PromptEditorHandle | null>;
  elementRefsRef?: React.MutableRefObject<ElementRef[]>;
}

export interface NodePlugin {
  type: NodeType | NodeType[];
  IdleView: ComponentType<IdleViewProps>;
  ActiveView?: ComponentType<ActiveViewProps>;
}
