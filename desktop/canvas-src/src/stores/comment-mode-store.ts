import { create } from "zustand";

interface CommentModeStore {
  active: boolean;
  enter: () => void;
  exit: () => void;
  toggle: () => void;
}

export const useCommentModeStore = create<CommentModeStore>((set, get) => ({
  active: false,
  enter: () => set({ active: true }),
  exit: () => set({ active: false }),
  toggle: () => set({ active: !get().active }),
}));
