import { create } from "zustand";

interface ConnectionDragStore {
  /** The nodeType of the source node being dragged, or null if no drag in progress */
  sourceNodeType: string | null;
  setSourceNodeType: (type: string | null) => void;
}

export const useConnectionDragStore = create<ConnectionDragStore>((set) => ({
  sourceNodeType: null,
  setSourceNodeType: (type) => set({ sourceNodeType: type }),
}));
