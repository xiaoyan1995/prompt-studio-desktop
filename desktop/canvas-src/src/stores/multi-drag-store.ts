import { create } from "zustand";

interface MultiDragState {
  isDragging: boolean;
  /** Lines stay visible after drag ends while menu is open */
  isPinned: boolean;
  sourceNodeIds: string[];
  cursorX: number;
  cursorY: number;
  /** Node id the cursor is hovering over during drag */
  hoveredNodeId: string | null;
  startDrag: (nodeIds: string[], x: number, y: number) => void;
  updateCursor: (x: number, y: number) => void;
  setHoveredNode: (nodeId: string | null) => void;
  /** Freeze lines in place (cursor stops updating, lines persist for menu) */
  pinDrag: () => void;
  /** Fully clear all state (called when menu closes) */
  endDrag: () => void;
}

export const useMultiDragStore = create<MultiDragState>((set) => ({
  isDragging: false,
  isPinned: false,
  sourceNodeIds: [],
  cursorX: 0,
  cursorY: 0,
  hoveredNodeId: null,
  startDrag: (nodeIds, x, y) => set({ isDragging: true, isPinned: false, sourceNodeIds: nodeIds, cursorX: x, cursorY: y, hoveredNodeId: null }),
  updateCursor: (x, y) => set({ cursorX: x, cursorY: y }),
  setHoveredNode: (nodeId) => set({ hoveredNodeId: nodeId }),
  pinDrag: () => set({ isDragging: false, isPinned: true }),
  endDrag: () => set({ isDragging: false, isPinned: false, sourceNodeIds: [], cursorX: 0, cursorY: 0, hoveredNodeId: null }),
}));
