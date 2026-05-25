import { create } from "zustand";

interface HandleProximityState {
  /** Node ID whose left/right edge is close to the cursor (null = none) */
  nearNodeId: string | null;
  setNear: (nodeId: string | null) => void;
}

export const useHandleProximityStore = create<HandleProximityState>((set, get) => ({
  nearNodeId: null,
  setNear: (nodeId) => { if (get().nearNodeId !== nodeId) set({ nearNodeId: nodeId }); },
}));
