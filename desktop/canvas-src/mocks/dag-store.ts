import { create } from "zustand";
export const useDagStore = create(() => ({
  currentRun: null,
  isExecuting: false,
  error: null,
  cancelRun: () => {},
  executeGraph: () => {},
}));
