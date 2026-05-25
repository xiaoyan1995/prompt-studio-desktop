import { create } from "zustand";

interface CanvasDragStore {
  nodeDragging: boolean;
  viewportMoving: boolean;
  setNodeDragging: (v: boolean) => void;
  setViewportMoving: (v: boolean) => void;
}

export const useCanvasDragStore = create<CanvasDragStore>((set) => ({
  nodeDragging: false,
  viewportMoving: false,
  setNodeDragging: (v) => set({ nodeDragging: v }),
  setViewportMoving: (v) => set({ viewportMoving: v }),
}));

export const useIsDragging = () =>
  useCanvasDragStore((s) => s.nodeDragging || s.viewportMoving);
