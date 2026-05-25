import zh from "./zh.json";

type NS = Record<string, unknown>;

function interpolate(str: string, params?: Record<string, unknown>): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

function makeLookup(ns: NS) {
  return (key: string, params?: Record<string, unknown>): string => {
    const val = ns[key];
    if (typeof val === "string") return interpolate(val, params);
    return key;
  };
}

export function useTranslations(namespace?: string) {
  const ns = namespace ? ((zh as NS)[namespace] as NS ?? {}) : (zh as NS);
  return makeLookup(ns);
}

export function useLocale() {
  return "zh-CN";
}

export function getTranslations(namespace?: string) {
  const ns = namespace ? ((zh as NS)[namespace] as NS ?? {}) : (zh as NS);
  return Promise.resolve(makeLookup(ns));
}
