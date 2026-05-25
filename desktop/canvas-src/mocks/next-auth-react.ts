export function signOut(_opts?: { callbackUrl?: string; redirect?: boolean }) {
  return Promise.resolve();
}
export function signIn() { return Promise.resolve(); }
export function useSession() { return { data: null, status: "unauthenticated" }; }
export function SessionProvider({ children }: { children: React.ReactNode }) { return children; }
