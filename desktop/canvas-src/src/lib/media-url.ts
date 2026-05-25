import type { NodeData } from "@/types/canvas";

export interface ThumbnailLevels {
  sm?: string;
  md?: string;
  lg?: string;
}

export type RenderTier = "sm" | "md" | "lg" | "display" | "fallback" | "missing";
export type DownloadSourceKind = "original" | "derived-original" | "display" | "missing";

export interface RenderSourceResult {
  url: string;
  tier: RenderTier;
}

export interface DownloadSourceResult {
  url: string;
  source: DownloadSourceKind;
}

export interface RenderMediaSourceInput {
  kind: "image" | "video";
  data?: DataLike;
  displayUrl?: string;
  thumbnailUrl?: string;
  thumbnailLevels?: ThumbnailLevels;
  preferredTier?: "sm" | "md" | "lg";
}

export interface DownloadMediaSourceInput {
  kind: "image" | "video";
  data?: DataLike;
  displayUrl?: string;
  originalUrl?: string;
}

export const PREVIEW_ZOOM_SMALL_MAX = 0.45;
export const PREVIEW_ZOOM_MEDIUM_MAX = 1.1;
const ORIGINAL_PROBE_CACHE = new Map<string, boolean>();

type DataLike = Partial<NodeData> | Record<string, unknown> | undefined | null;

function sanitizeUrl(url: string): string {
  const prefix = "/api/files/";
  if (url.startsWith(prefix) && (url.startsWith(prefix + "http://") || url.startsWith(prefix + "https://"))) {
    return url.slice(prefix.length);
  }
  return url;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return sanitizeUrl(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function normalizeLevelObject(raw: unknown): ThumbnailLevels {
  const rec = asRecord(raw);
  if (!rec) return {};
  return {
    sm: asNonEmptyString(rec.sm) ?? asNonEmptyString(rec.small),
    md: asNonEmptyString(rec.md) ?? asNonEmptyString(rec.medium),
    lg: asNonEmptyString(rec.lg) ?? asNonEmptyString(rec.large),
  };
}

function stripQueryAndHash(url: string): string {
  return url.split("#")[0].split("?")[0];
}

function deriveOriginalCandidatesFromDisplayUrl(displayUrl: string, isVideo: boolean): string[] {
  const clean = stripQueryAndHash(displayUrl);
  const match = clean.match(/^(.*)-display\.([^.]+)$/);
  if (!match) return [];
  const base = match[1];
  const ext = match[2].toLowerCase();
  if (isVideo) return [`${base}-original.mp4`];

  const extOrder = ext === "webp"
    ? ["webp", "png", "jpg", "jpeg"]
    : [ext, "webp", "png", "jpg", "jpeg"];
  return extOrder.map((e) => `${base}-original.${e}`);
}

async function urlExists(url: string): Promise<boolean> {
  if (!url) return false;
  const cached = ORIGINAL_PROBE_CACHE.get(url);
  if (typeof cached === "boolean") return cached;
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (head.ok) {
      ORIGINAL_PROBE_CACHE.set(url, true);
      return true;
    }
    if (head.status !== 405) {
      ORIGINAL_PROBE_CACHE.set(url, false);
      return false;
    }
    const get = await fetch(url, { method: "GET", cache: "no-store" });
    const ok = get.ok;
    ORIGINAL_PROBE_CACHE.set(url, ok);
    return ok;
  } catch {
    ORIGINAL_PROBE_CACHE.set(url, false);
    return false;
  }
}

export function getImageDisplayUrl(data: DataLike): string | undefined {
  if (!data) return undefined;
  return asNonEmptyString((data as Record<string, unknown>).imageUrl);
}

export function getImageOriginalUrl(data: DataLike): string | undefined {
  if (!data) return undefined;
  return asNonEmptyString((data as Record<string, unknown>).originalUrl) ?? getImageDisplayUrl(data);
}

export function getVideoDisplayUrl(data: DataLike): string | undefined {
  if (!data) return undefined;
  return asNonEmptyString((data as Record<string, unknown>).videoUrl);
}

export function getVideoOriginalUrl(data: DataLike): string | undefined {
  if (!data) return undefined;
  return asNonEmptyString((data as Record<string, unknown>).originalVideoUrl) ?? getVideoDisplayUrl(data);
}

export function getThumbnailLevels(
  data: DataLike,
  fallbackThumb?: string,
  fallbackDisplay?: string,
): ThumbnailLevels {
  if (!data) return {};
  const rec = data as Record<string, unknown>;
  const explicit = normalizeLevelObject(rec.thumbnailLevels);
  const legacy = {
    sm: asNonEmptyString(rec.thumbnailUrlSmall),
    md: asNonEmptyString(rec.thumbnailUrlMedium),
    lg: asNonEmptyString(rec.thumbnailUrlLarge),
  };
  const fallback = asNonEmptyString(fallbackThumb);
  const display = asNonEmptyString(fallbackDisplay);

  return {
    sm: explicit.sm ?? legacy.sm ?? fallback,
    md: explicit.md ?? legacy.md ?? fallback ?? display,
    lg: explicit.lg ?? legacy.lg ?? fallback ?? display,
  };
}

export function getThumbnailLevelsList(data: DataLike): ThumbnailLevels[] {
  if (!data) return [];
  const rec = data as Record<string, unknown>;
  const raw = rec.thumbnailLevelsList;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => normalizeLevelObject(item));
}

export function pickThumbnailByZoom(
  levels: ThumbnailLevels,
  zoom: number,
  fallbackThumb?: string,
  fallbackDisplay?: string,
): string {
  const fallback = asNonEmptyString(fallbackThumb) ?? asNonEmptyString(fallbackDisplay) ?? "";
  if (!Number.isFinite(zoom)) {
    return levels.md ?? levels.lg ?? levels.sm ?? fallback;
  }
  if (zoom <= PREVIEW_ZOOM_SMALL_MAX) {
    return levels.sm ?? levels.md ?? levels.lg ?? fallback;
  }
  if (zoom <= PREVIEW_ZOOM_MEDIUM_MAX) {
    return levels.md ?? levels.lg ?? levels.sm ?? fallback;
  }
  return levels.lg ?? asNonEmptyString(fallbackDisplay) ?? levels.md ?? levels.sm ?? fallback;
}

function preferredTierByZoom(zoom: number): "sm" | "md" | "lg" {
  if (!Number.isFinite(zoom)) return "md";
  if (zoom <= PREVIEW_ZOOM_SMALL_MAX) return "sm";
  if (zoom <= PREVIEW_ZOOM_MEDIUM_MAX) return "md";
  return "lg";
}

export function resolveRenderSource(zoom: number, media: RenderMediaSourceInput): RenderSourceResult {
  const data = media.data;
  const displayFromData = media.kind === "video" ? getVideoDisplayUrl(data) : getImageDisplayUrl(data);
  const display = asNonEmptyString(media.displayUrl) ?? displayFromData;
  const thumb = asNonEmptyString(media.thumbnailUrl)
    ?? (data ? asNonEmptyString((data as Record<string, unknown>).thumbnailUrl) : undefined);
  const levels = media.thumbnailLevels
    ?? getThumbnailLevels(data, thumb, media.kind === "image" ? display : undefined);
  const preferredTier = media.preferredTier ?? preferredTierByZoom(zoom);

  const readTier = (tier: "sm" | "md" | "lg"): string | undefined => {
    if (tier === "sm") return levels.sm;
    if (tier === "md") return levels.md;
    return levels.lg;
  };

  const fallback = media.kind === "image"
    ? (thumb ?? display ?? "")
    : (thumb ?? "");
  const displayCandidate = media.kind === "image" ? display : undefined;
  const orders: Record<"sm" | "md" | "lg", Array<"sm" | "md" | "lg" | "display" | "fallback">> = {
    sm: ["sm", "md", "lg", "display", "fallback"],
    md: ["md", "lg", "sm", "display", "fallback"],
    lg: ["lg", "display", "md", "sm", "fallback"],
  };

  for (const tier of orders[preferredTier]) {
    if (tier === "fallback") {
      if (fallback) return { url: fallback, tier: "fallback" };
      continue;
    }
    if (tier === "display") {
      if (displayCandidate) return { url: displayCandidate, tier: "display" };
      continue;
    }
    const value = readTier(tier);
    if (value) return { url: value, tier };
  }

  return { url: "", tier: "missing" };
}

export async function resolveDownloadSource(media: DownloadMediaSourceInput): Promise<DownloadSourceResult> {
  const data = media.data;
  if (media.kind === "video") {
    const explicitOriginal = asNonEmptyString(media.originalUrl)
      ?? (data ? asNonEmptyString((data as Record<string, unknown>).originalVideoUrl) : undefined);
    if (explicitOriginal) return { url: explicitOriginal, source: "original" };

    const display = asNonEmptyString(media.displayUrl) ?? getVideoDisplayUrl(data) ?? "";
    if (!display) return { url: "", source: "missing" };
    const [candidate] = deriveOriginalCandidatesFromDisplayUrl(display, true);
    if (candidate && await urlExists(candidate)) return { url: candidate, source: "derived-original" };
    return { url: display, source: "display" };
  }

  const explicitOriginal = asNonEmptyString(media.originalUrl)
    ?? (data ? asNonEmptyString((data as Record<string, unknown>).originalUrl) : undefined);
  if (explicitOriginal) return { url: explicitOriginal, source: "original" };

  const display = asNonEmptyString(media.displayUrl) ?? getImageDisplayUrl(data) ?? "";
  if (!display) return { url: "", source: "missing" };
  const candidates = deriveOriginalCandidatesFromDisplayUrl(display, false);
  for (const candidate of candidates) {
    if (await urlExists(candidate)) return { url: candidate, source: "derived-original" };
  }
  return { url: display, source: "display" };
}

export function resolveImagePreviewUrl(data: DataLike, zoom: number): string {
  return resolveRenderSource(zoom, { kind: "image", data }).url;
}

export function resolveVideoPosterUrl(data: DataLike, zoom: number): string {
  return resolveRenderSource(zoom, { kind: "video", data }).url;
}

export async function resolveBestImageOriginalUrl(
  data: DataLike,
  fallbackDisplay?: string,
): Promise<string> {
  const resolved = await resolveDownloadSource({
    kind: "image",
    data,
    displayUrl: asNonEmptyString(fallbackDisplay),
  });
  return resolved.url;
}

export async function resolveBestVideoOriginalUrl(
  data: DataLike,
  fallbackDisplay?: string,
): Promise<string> {
  const resolved = await resolveDownloadSource({
    kind: "video",
    data,
    displayUrl: asNonEmptyString(fallbackDisplay),
  });
  return resolved.url;
}

/**
 * Download a file by URL without exposing the raw URL to the user.
 * 1. For same-origin URLs: direct fetch → blob → download
 * 2. For cross-origin URLs: try direct fetch, if CORS blocks → proxy through /api/files/proxy-download
 * Returns true if download was initiated successfully.
 */
export async function downloadFile(url: string, fileName: string): Promise<boolean> {
  if (!url) return false;

  // Helper to trigger download from a blob
  const downloadBlob = (blob: Blob) => {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  };

  // Check if URL is same-origin (relative or matches current host)
  const isSameOrigin = url.startsWith("/") || (() => {
    try { return new URL(url).origin === window.location.origin; } catch { return false; }
  })();

  if (isSameOrigin) {
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      downloadBlob(await res.blob());
      return true;
    } catch {
      return false;
    }
  }

  // Cross-origin: try direct fetch first (works if CORS allows)
  try {
    const res = await fetch(url);
    if (res.ok) {
      downloadBlob(await res.blob());
      return true;
    }
  } catch {
    // CORS blocked — fall through to proxy
  }

  // Proxy through our server
  try {
    const res = await fetch("/api/files/proxy-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return false;
    downloadBlob(await res.blob());
    return true;
  } catch {
    return false;
  }
}
