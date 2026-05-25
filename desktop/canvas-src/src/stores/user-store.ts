import { create } from "zustand";

interface UserInfo {
  id: string;
  email: string;
  nickname: string;
  avatar_url: string | null;
  tier: string;
}

interface UserStore {
  user: UserInfo | null;
  loading: boolean;
  fetched: boolean;
  fetchUser: () => Promise<void>;
  setUser: (user: UserInfo | null) => void;
  clear: () => void;
}

export const useUserStore = create<UserStore>((set, get) => ({
  user: null,
  loading: false,
  fetched: false,
  fetchUser: async () => {
    if (get().fetched || get().loading) return;
    set({ loading: true });
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        set({ user: data.user ?? null, fetched: true });
      } else {
        set({ fetched: true });
      }
    } catch {
      set({ fetched: true });
    } finally {
      set({ loading: false });
    }
  },
  setUser: (user) => set({ user, fetched: true }),
  clear: () => set({ user: null, loading: false, fetched: false }),
}));
