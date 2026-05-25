import { existsSync, readdirSync } from "fs";
import { basename, dirname, join } from "path";

const UPLOAD_DIR = join(process.cwd(), "data", "uploads");

export function resolveOriginalLocalStorageKey(storageKey: string): string {
  if (!storageKey || !storageKey.includes("-display.")) return storageKey;

  const match = storageKey.match(/^(.*)-display\.[^.]+$/);
  if (!match) return storageKey;

  const prefixPath = match[1];
  const relativeDir = dirname(prefixPath);
  const basePrefix = basename(prefixPath);
  const scanDir = relativeDir === "." ? UPLOAD_DIR : join(UPLOAD_DIR, relativeDir);

  try {
    const entries = readdirSync(scanDir);
    const originalFile = entries.find((name) => name.startsWith(`${basePrefix}-original.`));
    if (!originalFile) return storageKey;
    const candidate = relativeDir === "." ? originalFile : join(relativeDir, originalFile);
    return existsSync(join(UPLOAD_DIR, candidate)) ? candidate : storageKey;
  } catch {
    return storageKey;
  }
}
