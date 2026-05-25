export function useRouter() {
  return {
    push: (_url: string) => {},
    replace: (_url: string) => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: (_url: string) => {},
  };
}

export function usePathname() { return "/"; }
export function useSearchParams() { return new URLSearchParams(); }
export function useParams() { return {}; }
