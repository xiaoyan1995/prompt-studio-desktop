import { create } from "zustand";

interface EdgeHoverState {
  edgeId: string | null;
  screenX: number;
  screenY: number;
  visible: boolean;
  setHover: (edgeId: string, screenX: number, screenY: number) => void;
  updatePos: (screenX: number, screenY: number) => void;
  showScissor: () => void;
  clear: () => void;
}

export const useEdgeHoverStore = create<EdgeHoverState>((set) => ({
  edgeId: null,
  screenX: 0,
  screenY: 0,
  visible: false,
  setHover: (edgeId, screenX, screenY) => set({ edgeId, screenX, screenY, visible: false }),
  updatePos: (screenX, screenY) => set({ screenX, screenY }),
  showScissor: () => set({ visible: true }),
  clear: () => set({ edgeId: null, visible: false }),
}));
