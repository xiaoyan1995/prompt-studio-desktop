import { access, readFile } from "fs/promises";
import { extname, join } from "path";
import sharp from "sharp";
import { ensurePublicUrl } from "./t8star-video";
import { callAtlasCloudNanoBanana, useAtlasCloudForNanoBanana } from "./atlascloud";
import {
  uploadToKieStorage,
  uploadBlobToPublicUrl,
  waitForKieImageTask,
  useKieForGptImage2,
  callKieGptImage2,
  callKieGptImage2T2I,
  callKieGptImage2Edit,
  useKieForSeedream,
  useKieForSeedreamEdit,
  callKieSeedream,
  callKieSeedreamEdit,
} from "./kie-image";
import {
  useDuomiForGptImage2,
  callDuomiGptImage2,
  callDuomiGptImage2Edit,
  pollDuomiTask,
  useDuomiForNanoBanana,
  callDuomiNanoBanana,
  callDuomiNanoBananaEdit,
  pollDuomiNanoBananaTask,
} from "./duomi-image";
import {
  isOpenCrowImageConfigured,
  callOpenCrowSeedream,
  callOpenCrowSeedreamEdit,
} from "./opencrow-image";
export {
  uploadToKieStorage,
  uploadBlobToPublicUrl,
  waitForKieImageTask,
  useKieForGptImage2,
  callKieGptImage2,
  callKieGptImage2T2I,
  callKieGptImage2Edit,
  useKieForSeedream,
  useKieForSeedreamEdit,
  callKieSeedream,
  callKieSeedreamEdit,
};
export {
  useDuomiForGptImage2,
  callDuomiGptImage2,
  callDuomiGptImage2Edit,
  pollDuomiTask,
  useDuomiForNanoBanana,
  callDuomiNanoBanana,
  callDuomiNanoBananaEdit,
  pollDuomiNanoBananaTask,
};

const UPLOAD_DIR = join(process.cwd(), "data", "uploads");
const T8STAR_BASE_URL = "https://ai.t8star.cn";
const T8STAR_GPT_IMAGE2_API_KEY = process.env.T8STAR_GPT_IMAGE2_API_KEY || "";
const T8STAR_FAL_API_KEY = process.env.T8STAR_FAL_API_KEY || "";
const T8STAR_FAL_BASE_URL = "https://ai.t8star.org/fal-ai";
const DEFAULT_MAX_REFERENCE_IMAGES = 8;
export const MODEL_REFERENCE_IMAGE_LIMITS: Record<string, number> = {
  "nano-banana-2": 14,
  "nano-banana-pro": 14,
  "gpt-image-2-lite": 16,
};
const MAX_REFERENCE_IMAGE_BYTES = 700 * 1024; // 700KB
const MAX_REFERENCE_IMAGE_WIDTH = 1280;
const LOCAL_FILE_URL_PATTERN = /^\/api\/files\/(.+)$/i;
const LOCAL_FILE_VARIANT_PATTERN = /^([0-9a-f-]{36})-(original|display|thumb)\.[a-z0-9]+$/i;
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export const GPT_IMAGE_2_MODELS = new Set(["gpt-image-2-lite"]);

export const NANO_BANANA_MODELS = new Set(["nano-banana-2", "nano-banana-pro", "nano-banana-pro-ultra"]);

/** Key priority: GPT_IMAGE2 key → Gemini premium key → default key.
 *  nano-banana 4K has no available channel in default group, so it uses premium/gemini key. */
export function getT8StarApiKey(baseModel: string, quality?: string): string {
  if (GPT_IMAGE_2_MODELS.has(baseModel)) {
    return process.env.T8STAR_GPT_IMAGE2_API_KEY || "";
  }
  if (NANO_BANANA_MODELS.has(baseModel)) {
    if (quality === "4K") return process.env.T8STAR_GEMINI_API_KEY || process.env.T8STAR_API_KEY || "";
    return process.env.T8STAR_GPT_IMAGE2_API_KEY || process.env.T8STAR_GEMINI_API_KEY || process.env.T8STAR_API_KEY || "";
  }
  return process.env.T8STAR_GEMINI_API_KEY || process.env.T8STAR_API_KEY || "";
}

export const SEEDREAM_MODELS = new Set([
  "doubao-seedream-4-5-251128",
  "doubao-seedream-5-0-260128",
]);

export const ALLOWED_BASE_MODELS = new Set([
  "nano-banana-2", "nano-banana-pro", "nano-banana-pro-ultra",
  "grok-imagine", "z-image-turbo",
  "gpt-image-2", "gpt-image-2-lite",
  "wan-2.7",
  "doubao-seedream-4-5-251128",
  "doubao-seedream-5-0-260128",
]);

export const SUPPORTED_RATIOS = new Set([
  "1:1", "4:3", "3:4", "16:9", "9:16",
  "3:2", "2:3", "5:4", "4:5", "21:9",
]);

export const MODEL_QUALITY_PRICE: Record<string, Record<string, number>> = {
  "nano-banana-2": { "512": 5, "1K": 9, "2K": 14, "4K": 20 },
  "nano-banana-pro": { "1K": 15, "2K": 15, "4K": 26 },
  "grok-imagine": { "1K": 3 },
  "z-image-turbo": { "1K": 2 },
  "gpt-image-2": { "1K": 7, "2K": 7, "4K": 13 },
  "gpt-image-2-lite": { "1K": 4, "2K": 6, "4K": 9 },
  "wan-2.7": { "1K": 4, "2K": 9 },
  "doubao-seedream-4-5-251128": { "2K": 6, "4K": 6 },
  "doubao-seedream-5-0-260128": { "2K": 6, "4K": 6 },
};

// 2D pricing for models with output_quality dimension: model → size → outputQuality → xins
export const MODEL_OUTPUT_QUALITY_PRICE: Record<string, Record<string, Record<string, number>>> = {
  "gpt-image-2": {
    "1K":  { low: 1, medium: 7,  high: 27 },
    "2K":  { low: 1, medium: 7,  high: 28 },
    "4K":  { low: 2, medium: 13, high: 50 },
  },
};

export const MODEL_QUALITY_PRICE_I2I: Record<string, Record<string, number>> = {
  "grok-imagine": { "1K": 4 },
};

const T8STAR_MODEL_MAP: Record<string, Record<string, string>> = {
  "nano-banana-2": {
    "512": "gemini-3.1-flash-image-preview-512px",
    "1K": "gemini-3.1-flash-image-preview",
    "2K": "gemini-3.1-flash-image-preview-2k",
    "4K": "gemini-3.1-flash-image-preview-4k",
  },
};

export function buildT8StarModel(baseModel: string, quality: string): string {
  const map = T8STAR_MODEL_MAP[baseModel];
  if (!map) return baseModel;
  return map[quality] ?? Object.values(map)[0] ?? baseModel;
}

export const SEEDREAM_SIZE_MAP: Record<string, Record<string, string>> = {
  "1K": {
    "1:1": "1024x1024",
    "4:3": "1152x864", "3:4": "864x1152",
    "16:9": "1280x720", "9:16": "720x1280",
    "3:2": "1248x832", "2:3": "832x1248",
    "21:9": "1512x648",
  },
  "2K": {
    "1:1": "2048x2048",
    "4:3": "2304x1728", "3:4": "1728x2304",
    "16:9": "2848x1600", "9:16": "1600x2848",
    "3:2": "2496x1664", "2:3": "1664x2496",
    "21:9": "3136x1344",
  },
  "3K": {
    "1:1": "3072x3072",
    "4:3": "3456x2592", "3:4": "2592x3456",
    "16:9": "4096x2304", "9:16": "2304x4096",
    "3:2": "3744x2496", "2:3": "2496x3744",
    "21:9": "4704x2016",
  },
  "4K": {
    "1:1": "4096x4096",
    "4:3": "4704x3520", "3:4": "3520x4704",
    "16:9": "5504x3040", "9:16": "3040x5504",
    "3:2": "4992x3328", "2:3": "3328x4992",
    "21:9": "6240x2656",
  },
};

export function buildSeedreamSize(ratio: string | null, quality: string): string {
  if (!ratio) return quality;
  return SEEDREAM_SIZE_MAP[quality]?.[ratio] ?? quality;
}

// ── Seedream Circuit Breaker: OpenCrow → KIE ──

type SeedreamProvider = "opencrow" | "kie";
const SEEDREAM_CIRCUIT_FAILURE_THRESHOLD = 2;
const SEEDREAM_CIRCUIT_RECOVERY_MS = 5 * 60 * 1000;

const seedreamCircuit: Record<SeedreamProvider, { failures: number; downSince: number }> = {
  opencrow: { failures: 0, downSince: 0 },
  kie: { failures: 0, downSince: 0 },
};

function isSeedreamProviderAvailable(p: SeedreamProvider): boolean {
  if (p === "opencrow" && !isOpenCrowImageConfigured()) return false;
  if (p === "kie" && !process.env.KIE_API_KEY) return false;
  const s = seedreamCircuit[p];
  if (s.downSince === 0) return true;
  if (Date.now() - s.downSince >= SEEDREAM_CIRCUIT_RECOVERY_MS) return true;
  return false;
}

function markSeedreamSuccess(p: SeedreamProvider) {
  seedreamCircuit[p] = { failures: 0, downSince: 0 };
}

function markSeedreamFailure(p: SeedreamProvider) {
  const s = seedreamCircuit[p];
  s.failures++;
  if (s.failures >= SEEDREAM_CIRCUIT_FAILURE_THRESHOLD) {
    s.downSince = Date.now();
    console.warn("[seedream-circuit] %s marked DOWN after %d failures", p, s.failures);
  }
}

function getSeedreamProviders(): SeedreamProvider[] {
  const order: SeedreamProvider[] = ["opencrow", "kie"];
  return order.filter(p => isSeedreamProviderAvailable(p));
}

/** Seedream generation with OpenCrow → KIE fallback */
export async function callSeedreamWithFallback(params: {
  baseModel: string;
  prompt: string;
  inputUrls: string[];
  ratio: string | null;
  quality: string;
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<T8StarGenResult> {
  const providers = getSeedreamProviders();
  if (providers.length === 0) {
    throw new Error("No Seedream provider available (need OPENCROW_API_KEY or KIE_API_KEY)");
  }

  let lastErr: Error | null = null;
  for (const provider of providers) {
    try {
      let result: { remoteUrl: string };
      if (provider === "opencrow") {
        result = await callOpenCrowSeedream({
          baseModel: params.baseModel,
          prompt: params.prompt,
          inputUrls: params.inputUrls.length > 0 ? params.inputUrls : undefined,
          ratio: params.ratio,
          quality: params.quality,
        });
      } else {
        result = await callKieSeedream({
          baseModel: params.baseModel,
          prompt: params.prompt,
          inputUrls: params.inputUrls,
          ratio: params.ratio,
          quality: params.quality,
          onTaskCreated: params.onTaskCreated,
        });
      }
      markSeedreamSuccess(provider);
      console.log("[seedream] succeeded via %s", provider);
      return result;
    } catch (err: any) {
      lastErr = err;
      markSeedreamFailure(provider);
      console.warn("[seedream] %s failed: %s — trying next...", provider, err.message?.slice(0, 200));
    }
  }

  throw lastErr ?? new Error("All Seedream providers failed");
}

/** Seedream edit with OpenCrow → KIE fallback */
export async function callSeedreamEditWithFallback(params: {
  baseModel: string;
  prompt: string;
  imageBlob: Blob;
  imageName: string;
  ratio: string | null;
  quality: string;
}): Promise<T8StarGenResult> {
  const providers = getSeedreamProviders();
  if (providers.length === 0) {
    throw new Error("No Seedream provider available (need OPENCROW_API_KEY or KIE_API_KEY)");
  }

  let lastErr: Error | null = null;
  for (const provider of providers) {
    try {
      let result: { remoteUrl: string };
      if (provider === "opencrow") {
        result = await callOpenCrowSeedreamEdit({
          baseModel: params.baseModel,
          prompt: params.prompt,
          imageBlob: params.imageBlob,
          imageName: params.imageName,
          ratio: params.ratio,
          quality: params.quality,
        });
      } else {
        result = await callKieSeedreamEdit({
          baseModel: params.baseModel,
          prompt: params.prompt,
          imageBlob: params.imageBlob,
          imageName: params.imageName,
          ratio: params.ratio,
          quality: params.quality,
        });
      }
      markSeedreamSuccess(provider);
      console.log("[seedream-edit] succeeded via %s", provider);
      return result;
    } catch (err: any) {
      lastErr = err;
      markSeedreamFailure(provider);
      console.warn("[seedream-edit] %s failed: %s — trying next...", provider, err.message?.slice(0, 200));
    }
  }

  throw lastErr ?? new Error("All Seedream edit providers failed");
}

export const GPT_IMAGE_2_QUALITY_MAP: Record<string, string> = {
  "1K": "high",
  "2K": "high",
  "4K": "high",
};

export const GPT_IMAGE_2_SIZE_MAP: Record<string, Record<string, string>> = {
  "1K": {
    "1:1": "1024x1024",
    "4:3": "1152x864", "3:4": "864x1152",
    "16:9": "1280x720", "9:16": "720x1280",
    "3:2": "1248x832", "2:3": "832x1248",
    "5:4": "1120x896", "4:5": "896x1120",
    "21:9": "1456x624",
    "2:1": "2048x1024", "1:2": "1024x2048",
  },
  "2K": {
    "1:1": "2048x2048",
    "4:3": "2304x1728", "3:4": "1728x2304",
    "16:9": "2560x1440", "9:16": "1440x2560",
    "3:2": "2496x1664", "2:3": "1664x2496",
    "5:4": "2240x1792", "4:5": "1792x2240",
    "21:9": "3024x1296",
    "2:1": "2688x1344", "1:2": "1344x2688",
  },
  "4K": {
    "1:1": "2880x2880",
    "4:3": "3264x2448", "3:4": "2448x3264",
    "16:9": "3840x2160", "9:16": "2160x3840",
    "3:2": "3504x2336", "2:3": "2336x3504",
    "5:4": "3200x2560", "4:5": "2560x3200",
    "21:9": "3696x1584",
    "2:1": "3840x1920", "1:2": "1920x3840",
  },
};

export function buildGptImage2Size(ratio: string | null, quality: string): string {
  if (!ratio) return GPT_IMAGE_2_SIZE_MAP[quality]?.["1:1"] ?? "1024x1024";
  return GPT_IMAGE_2_SIZE_MAP[quality]?.[ratio] ?? GPT_IMAGE_2_SIZE_MAP[quality]?.["1:1"] ?? "1024x1024";
}

// ── T8Star fal.ai proxy: GPT Image 2 size map ──
// fal.ai requires: both dims multiples of 16, max edge 3840px, ratio ≤ 3:1, total pixels 655K–8.3M
const T8STAR_FAL_GPT_IMAGE2_SIZE_MAP: Record<string, Record<string, { width: number; height: number }>> = {
  "1K": {
    "1:1": { width: 1024, height: 1024 },
    "4:3": { width: 1152, height: 864 }, "3:4": { width: 864, height: 1152 },
    "3:2": { width: 1248, height: 832 }, "2:3": { width: 832, height: 1248 },
    "16:9": { width: 1280, height: 720 }, "9:16": { width: 720, height: 1280 },
    "5:4": { width: 1120, height: 896 }, "4:5": { width: 896, height: 1120 },
    "21:9": { width: 1344, height: 576 },
    "2:1": { width: 2048, height: 1024 }, "1:2": { width: 1024, height: 2048 },
  },
  "2K": {
    "1:1": { width: 2048, height: 2048 },
    "4:3": { width: 2304, height: 1728 }, "3:4": { width: 1728, height: 2304 },
    "3:2": { width: 2496, height: 1664 }, "2:3": { width: 1664, height: 2496 },
    "16:9": { width: 2560, height: 1440 }, "9:16": { width: 1440, height: 2560 },
    "5:4": { width: 2240, height: 1792 }, "4:5": { width: 1792, height: 2240 },
    "21:9": { width: 2688, height: 1152 },
    "2:1": { width: 2688, height: 1344 }, "1:2": { width: 1344, height: 2688 },
  },
  "4K": {
    "1:1": { width: 2880, height: 2880 },
    "4:3": { width: 3264, height: 2448 }, "3:4": { width: 2448, height: 3264 },
    "3:2": { width: 3504, height: 2336 }, "2:3": { width: 2336, height: 3504 },
    "16:9": { width: 3840, height: 2160 }, "9:16": { width: 2160, height: 3840 },
    "5:4": { width: 3200, height: 2560 }, "4:5": { width: 2560, height: 3200 },
    "21:9": { width: 3840, height: 1648 },
    "2:1": { width: 3840, height: 1920 }, "1:2": { width: 1920, height: 3840 },
  },
};

function resolveT8StarFalGptImage2Size(ratio: string | null, quality: string): { width: number; height: number } {
  const qMap = T8STAR_FAL_GPT_IMAGE2_SIZE_MAP[quality] ?? T8STAR_FAL_GPT_IMAGE2_SIZE_MAP["1K"];
  if (!ratio) return qMap["1:1"] ?? { width: 1024, height: 1024 };
  return qMap[ratio] ?? qMap["1:1"] ?? { width: 1024, height: 1024 };
}

// ── GPT Image 2 Lite Circuit Breaker (Duomi → T8Star) ──

type GptImage2Provider = 'duomi' | 't8star' | 'kie';

const GPT_IMAGE2_FALLBACK_ORDER: GptImage2Provider[] = ['duomi', 't8star'];
const CIRCUIT_FAILURE_THRESHOLD = 2;
const CIRCUIT_RECOVERY_MS = 5 * 60 * 1000; // 5 minutes

const gptImage2Circuit: Record<GptImage2Provider, { failures: number; downSince: number }> = {
  duomi: { failures: 0, downSince: 0 },
  t8star: { failures: 0, downSince: 0 },
  kie: { failures: 0, downSince: 0 },
};

function isGptImage2ProviderConfigured(p: GptImage2Provider): boolean {
  if (p === 'duomi') return !!process.env.DUOMI_API_KEY;
  if (p === 't8star') return !!T8STAR_GPT_IMAGE2_API_KEY;
  if (p === 'kie') return !!process.env.KIE_API_KEY;
  return false;
}

function isGptImage2ProviderAvailable(p: GptImage2Provider): boolean {
  if (!isGptImage2ProviderConfigured(p)) return false;
  const s = gptImage2Circuit[p];
  if (s.downSince === 0) return true;
  if (Date.now() - s.downSince >= CIRCUIT_RECOVERY_MS) return true;
  return false;
}

function markGptImage2Success(p: GptImage2Provider) {
  gptImage2Circuit[p] = { failures: 0, downSince: 0 };
}

function markGptImage2Failure(p: GptImage2Provider) {
  const s = gptImage2Circuit[p];
  s.failures++;
  if (s.failures >= CIRCUIT_FAILURE_THRESHOLD || s.downSince > 0) {
    s.downSince = Date.now();
  }
}

function getGptImage2Providers(): GptImage2Provider[] {
  return GPT_IMAGE2_FALLBACK_ORDER.filter(isGptImage2ProviderAvailable);
}

const GPT_IMAGE_2_POLL_INTERVAL_MS = 5_000;
const GPT_IMAGE_2_MAX_POLL_ATTEMPTS = 720; // 60 minutes (reverse-proxy can be slow)

interface GptImage2AsyncResult {
  imageUrl: string;
}

const MAX_CONSECUTIVE_POLL_ERRORS = 10;

export async function pollGptImage2Task(taskId: string, apiKey: string): Promise<GptImage2AsyncResult> {
  const queryUrl = `${T8STAR_BASE_URL}/v1/images/tasks/${taskId}`;
  let consecutiveErrors = 0;
  let lastErrorMsg = "";
  for (let attempt = 1; attempt <= GPT_IMAGE_2_MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, GPT_IMAGE_2_POLL_INTERVAL_MS));
    try {
      const res = await fetch(queryUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        lastErrorMsg = `HTTP ${res.status}`;
        consecutiveErrors++;
        console.log("[gpt-image-2] poll %s attempt=%d status=%d consecutive_errors=%d", taskId, attempt, res.status, consecutiveErrors);
        if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
          throw new Error(`GPT Image 2 task poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg})`);
        }
        continue;
      }
      consecutiveErrors = 0;
      const statusData = await res.json();
      const inner = statusData?.data ?? {};
      const status = inner.status ?? "";
      if (status === "SUCCESS") {
        const resultData = inner.data ?? {};
        const dataArray: Array<{ url?: string; b64_json?: string }> = resultData.data ?? [];
        const imageUrl = dataArray[0]?.url;
        if (!imageUrl) throw new Error("Async task SUCCESS but no image URL in response");
        return { imageUrl };
      }
      if (status === "FAILURE") {
        const failReason = inner.fail_reason ?? "Unknown error";
        throw new Error(`GPT Image 2 task failed: ${failReason}`);
      }
      if (attempt % 10 === 0) {
        console.log("[gpt-image-2] poll %s attempt=%d status=%s progress=%s", taskId, attempt, status, inner.progress ?? "?");
      }
    } catch (err: any) {
      if (err.message?.includes("task failed") || err.message?.includes("poll failed") || err.message?.includes("no image URL")) throw err;
      lastErrorMsg = err.message ?? "Unknown fetch error";
      consecutiveErrors++;
      console.log("[gpt-image-2] poll %s attempt=%d fetch error=%s consecutive_errors=%d", taskId, attempt, lastErrorMsg, consecutiveErrors);
      if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        throw new Error(`GPT Image 2 task poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg})`);
      }
    }
  }
  throw new Error(`GPT Image 2 task timed out after ${GPT_IMAGE_2_MAX_POLL_ATTEMPTS} attempts`);
}

function mimeFromPath(pathOrUrl: string): string {
  const ext = extname(pathOrUrl).toLowerCase();
  return MIME_BY_EXT[ext] ?? "image/webp";
}

function extensionFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  return "webp";
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeReferenceUrls(baseModel: string, urls?: string[]): string[] {
  if (!Array.isArray(urls) || urls.length === 0) return [];

  const maxAllowed = getMaxReferenceImages(baseModel);
  const unique = new Set<string>();
  const normalized: string[] = [];

  for (const raw of urls) {
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value || unique.has(value)) continue;
    unique.add(value);
    normalized.push(value);
    if (normalized.length >= maxAllowed) break;
  }

  return normalized;
}

export function getMaxReferenceImages(baseModel: string): number {
  return MODEL_REFERENCE_IMAGE_LIMITS[baseModel] ?? DEFAULT_MAX_REFERENCE_IMAGES;
}

async function resolveLocalRefRelativePath(relativePath: string): Promise<string> {
  const match = relativePath.match(LOCAL_FILE_VARIANT_PATTERN);
  if (!match) return relativePath;

  const id = match[1];
  const candidates = [`${id}-display.webp`, `${id}-thumb.webp`, relativePath];
  for (const candidate of candidates) {
    if (await fileExists(join(UPLOAD_DIR, candidate))) {
      return candidate;
    }
  }
  return relativePath;
}

async function optimizeReferenceBuffer(
  input: Buffer,
  mime: string,
): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  if (!mime.startsWith("image/") || input.length <= MAX_REFERENCE_IMAGE_BYTES) {
    const ext = extensionFromMime(mime);
    return { buffer: input, mime, ext };
  }

  try {
    const optimized = await sharp(input)
      .rotate()
      .resize({
        width: MAX_REFERENCE_IMAGE_WIDTH,
        height: MAX_REFERENCE_IMAGE_WIDTH,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 78 })
      .toBuffer();

    return { buffer: optimized, mime: "image/webp", ext: "webp" };
  } catch {
    const ext = extensionFromMime(mime);
    return { buffer: input, mime, ext };
  }
}

async function resolveReferenceBlob(url: string): Promise<{ blob: Blob; name: string } | null> {
  try {
    if (url.startsWith("/api/files/")) {
      const relativePath = url.replace("/api/files/", "");
      const bestPath = await resolveLocalRefRelativePath(relativePath);
      const filePath = join(UPLOAD_DIR, bestPath);
      const buffer = await readFile(filePath);
      const optimized = await optimizeReferenceBuffer(buffer, mimeFromPath(bestPath));
      return {
        blob: new Blob([new Uint8Array(optimized.buffer)], { type: optimized.mime }),
        name: `ref.${optimized.ext}`,
      };
    }

    const imgRes = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) return null;
    const contentType = imgRes.headers.get("content-type") ?? mimeFromPath(url);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const optimized = await optimizeReferenceBuffer(buffer, contentType);
    return {
      blob: new Blob([new Uint8Array(optimized.buffer)], { type: optimized.mime }),
      name: `ref.${optimized.ext}`,
    };
  } catch (e) {
    console.warn("[t8star] failed to resolve ref image:", url, e);
    return null;
  }
}

export async function resolveRefImageUrls(urls: string[]): Promise<string[]> {
  const resolved: string[] = [];
  for (const url of urls) {
    try {
      const localMatch = url.match(LOCAL_FILE_URL_PATTERN);
      if (localMatch) {
        const bestPath = await resolveLocalRefRelativePath(localMatch[1]);
        const filePath = join(UPLOAD_DIR, bestPath);
        const buffer = await readFile(filePath);
        const optimized = await optimizeReferenceBuffer(buffer, mimeFromPath(bestPath));
        resolved.push(`data:${optimized.mime};base64,${optimized.buffer.toString("base64")}`);
      } else {
        resolved.push(url);
      }
    } catch (e) {
      console.warn("[t8star] failed to resolve ref image:", url, e);
    }
  }
  return resolved;
}

export interface T8StarGenParams {
  prompt: string;
  baseModel: string;
  quality: string;
  ratio: string | null;
  referenceImages?: string[];
  apiKey: string;
  thinkingLevel?: string;
  enableWebSearch?: boolean;
  enableImageSearch?: boolean;
  onTaskCreated?: (taskId: string, provider: string) => void;
}

export interface T8StarGenResult {
  remoteUrl: string;
  revisedPrompt?: string;
}

// ── GPT Image 2: T8Star direct call (extracted for circuit breaker) ──

async function callT8StarGptImage2Direct(params: {
  prompt: string;
  quality: string;
  ratio: string | null;
  referenceImages: string[];
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<T8StarGenResult> {
  const { prompt, quality, ratio, referenceImages } = params;
  const sizeValue = buildGptImage2Size(ratio, quality);
  const gptQuality = GPT_IMAGE_2_QUALITY_MAP[quality] ?? "auto";
  const gptKey = T8STAR_GPT_IMAGE2_API_KEY;
  if (!gptKey) throw new Error("T8STAR_GPT_IMAGE2_API_KEY is not configured");

  let submitRes: Response;

  if (referenceImages.length > 0) {
    const imageBlobs: { blob: Blob; name: string }[] = [];
    for (const url of referenceImages) {
      const resolved = await resolveReferenceBlob(url);
      if (resolved) imageBlobs.push(resolved);
    }

    const totalBytes = imageBlobs.reduce((sum, item) => sum + item.blob.size, 0);
    console.log("[gpt-image-2] t8star multipart async refs=%d size=%dKB quality=%s size=%s",
      imageBlobs.length, Math.round(totalBytes / 1024), gptQuality, sizeValue);

    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("model", "gpt-image-2");
    formData.append("n", "1");
    formData.append("quality", gptQuality);
    if (sizeValue !== "auto") formData.append("size", sizeValue);
    formData.append("moderation", "auto");
    for (const { blob, name } of imageBlobs) {
      formData.append("image", blob, name);
    }

    submitRes = await fetch(`${T8STAR_BASE_URL}/v1/images/edits?async=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${gptKey}` },
      body: formData,
      signal: AbortSignal.timeout(300_000),
    });
  } else {
    const body: Record<string, unknown> = {
      model: "gpt-image-2",
      prompt,
      n: 1,
      quality: gptQuality,
      size: sizeValue,
      moderation: "auto",
    };

    console.log("[gpt-image-2] t8star async request size=%s quality=%s refs=0", sizeValue, gptQuality);

    submitRes = await fetch(`${T8STAR_BASE_URL}/v1/images/generations?async=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${gptKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  }

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => "Unknown error");
    throw new Error(`GPT Image 2 T8Star submit error ${submitRes.status}: ${errText.slice(0, 2000)}`);
  }

  const submitResult = await submitRes.json();
  const taskId = submitResult.task_id ?? submitResult.data;
  if (!taskId) {
    throw new Error(`No task_id in GPT Image 2 T8Star response: ${JSON.stringify(submitResult).slice(0, 500)}`);
  }

  console.log("[gpt-image-2] t8star task submitted id=%s", taskId);
  params.onTaskCreated?.(taskId, "t8star-gpt-image-2");
  const asyncResult = await pollGptImage2Task(taskId, gptKey);
  return { remoteUrl: asyncResult.imageUrl };
}

async function callT8StarGptImage2EditDirect(params: {
  prompt: string;
  quality: string;
  ratio: string | null;
  imageBlob: Blob;
  imageName: string;
}): Promise<T8StarGenResult> {
  const { prompt, quality, ratio, imageBlob } = params;
  const sizeValue = buildGptImage2Size(ratio, quality);
  const gptQuality = GPT_IMAGE_2_QUALITY_MAP[quality] ?? "auto";
  const gptKey = T8STAR_GPT_IMAGE2_API_KEY;
  if (!gptKey) throw new Error("T8STAR_GPT_IMAGE2_API_KEY is not configured");

  const buf = Buffer.from(await imageBlob.arrayBuffer());
  const dataUrl = `data:${imageBlob.type || "image/png"};base64,${buf.toString("base64")}`;

  console.log("[gpt-image-2] t8star edit async size=%s quality=%s", sizeValue, gptQuality);

  const submitRes = await fetch(`${T8STAR_BASE_URL}/v1/images/generations?async=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${gptKey}` },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt,
      n: 1,
      quality: gptQuality,
      size: sizeValue,
      moderation: "auto",
      image: [dataUrl],
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => "Unknown error");
    throw new Error(`GPT Image 2 T8Star edit submit error ${submitRes.status}: ${errText.slice(0, 2000)}`);
  }

  const submitResult = await submitRes.json();
  const taskId = submitResult.task_id ?? submitResult.data;
  if (!taskId) {
    throw new Error(`No task_id in GPT Image 2 T8Star edit response: ${JSON.stringify(submitResult).slice(0, 500)}`);
  }

  console.log("[gpt-image-2] t8star edit task submitted id=%s", taskId);
  const asyncResult = await pollGptImage2Task(taskId, gptKey);
  return { remoteUrl: asyncResult.imageUrl };
}

// ── GPT Image 2 Lite: T8Star fal.ai proxy ──

const T8STAR_FAL_GPT_IMAGE2_MODEL = "gpt-image-1";
const T8STAR_FAL_POLL_BASE_URL = "https://ai.t8star.org/fal/fal-ai";
const T8STAR_FAL_POLL_INTERVAL_MS = 5_000;
const T8STAR_FAL_MAX_POLL_ATTEMPTS = 360; // ~30 min

export async function pollT8StarFalGptImage2Task(requestId: string): Promise<{ imageUrl: string }> {
  const key = T8STAR_FAL_API_KEY;
  if (!key) throw new Error("T8STAR_FAL_API_KEY is not configured");
  const url = `${T8STAR_FAL_POLL_BASE_URL}/${T8STAR_FAL_GPT_IMAGE2_MODEL}/requests/${requestId}`;

  for (let i = 0; i < T8STAR_FAL_MAX_POLL_ATTEMPTS; i++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
    });

    if (res.status === 202 || res.status === 429) {
      console.log("[t8star-fal-gpt-image-2] poll attempt=%d status=%d (pending)", i + 1, res.status);
      await new Promise((r) => setTimeout(r, T8STAR_FAL_POLL_INTERVAL_MS));
      continue;
    }

    // T8Star returns 400 with status IN_QUEUE/IN_PROGRESS when task is still processing
    // Parse body for all responses so we can check the status field
    let data: Record<string, unknown>;
    try {
      data = await res.json();
    } catch {
      if (!res.ok) {
        if (res.status >= 500) {
          console.warn("[t8star-fal-gpt-image-2] poll attempt=%d server error=%d", i + 1, res.status);
          await new Promise((r) => setTimeout(r, T8STAR_FAL_POLL_INTERVAL_MS));
          continue;
        }
        throw new Error(`T8Star fal proxy poll error ${res.status}: non-JSON response`);
      }
      throw new Error(`T8Star fal proxy poll: unexpected non-JSON 200 response`);
    }

    const status = data.status as string | undefined;

    // Still processing — retry regardless of HTTP status code
    if (status === "IN_QUEUE" || status === "IN_PROGRESS" || status === "PENDING") {
      console.log("[t8star-fal-gpt-image-2] poll attempt=%d http=%d status=%s", i + 1, res.status, status);
      await new Promise((r) => setTimeout(r, T8STAR_FAL_POLL_INTERVAL_MS));
      continue;
    }

    // Non-ok and not a pending status — real error
    if (!res.ok && !status) {
      if (res.status >= 500) {
        console.warn("[t8star-fal-gpt-image-2] poll attempt=%d server error=%d", i + 1, res.status);
        await new Promise((r) => setTimeout(r, T8STAR_FAL_POLL_INTERVAL_MS));
        continue;
      }
      throw new Error(`T8Star fal proxy poll error ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
    }
    const images = (data as any).images ?? (data as any).data?.images ?? [];
    const imageUrl = images[0]?.url;
    if (imageUrl) {
      console.log("[t8star-fal-gpt-image-2] poll attempt=%d completed url=%s", i + 1, imageUrl.slice(0, 80));
      return { imageUrl };
    }

    // If we got a 200 but no image and no pending status, it might be a failure
    if (status === "FAILED" || status === "ERROR") {
      const errMsg = data.error ?? data.detail ?? "Task failed";
      throw new Error(`T8Star fal proxy task failed: ${typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg).slice(0, 500)}`);
    }

    // Unknown shape — retry
    console.warn("[t8star-fal-gpt-image-2] poll attempt=%d unexpected response: %s", i + 1, JSON.stringify(data).slice(0, 300));
    await new Promise((r) => setTimeout(r, T8STAR_FAL_POLL_INTERVAL_MS));
  }

  throw new Error("T8Star fal proxy GPT Image 2 task timed out after polling");
}

async function callT8StarFalGptImage2(params: {
  prompt: string;
  quality: string;
  ratio: string | null;
  outputQuality: string;
  referenceImageUrls?: string[];
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<T8StarGenResult> {
  const key = T8STAR_FAL_API_KEY;
  if (!key) throw new Error("T8STAR_FAL_API_KEY is not configured");

  const imageSize = resolveT8StarFalGptImage2Size(params.ratio, params.quality);
  const qualityValue = ["low", "medium", "high"].includes(params.outputQuality) ? params.outputQuality : "medium";

  const body: Record<string, unknown> = {
    prompt: params.prompt,
    image_size: imageSize,
    quality: qualityValue,
    num_images: 1,
    output_format: "png",
  };

  if (params.referenceImageUrls && params.referenceImageUrls.length > 0) {
    body.image_urls = params.referenceImageUrls;
  }

  console.log("[t8star-fal-gpt-image-2] submit size=%j quality=%s refs=%d",
    imageSize, qualityValue, params.referenceImageUrls?.length ?? 0);

  const submitRes = await fetch(`${T8STAR_FAL_BASE_URL}/${T8STAR_FAL_GPT_IMAGE2_MODEL}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => "Unknown error");
    throw new Error(`T8Star fal proxy submit error ${submitRes.status}: ${errText.slice(0, 2000)}`);
  }

  const submitResult = await submitRes.json();
  const requestId = submitResult.request_id;

  // If sync response (images returned immediately)
  const immediateImages = submitResult.images ?? [];
  if (immediateImages.length > 0 && immediateImages[0]?.url) {
    console.log("[t8star-fal-gpt-image-2] sync response url=%s", immediateImages[0].url.slice(0, 80));
    params.onTaskCreated?.(requestId ?? "sync", "t8star-fal-gpt-image-2");
    return { remoteUrl: immediateImages[0].url };
  }

  if (!requestId) {
    throw new Error(`No request_id in T8Star fal proxy response: ${JSON.stringify(submitResult).slice(0, 500)}`);
  }

  console.log("[t8star-fal-gpt-image-2] task submitted requestId=%s", requestId);
  params.onTaskCreated?.(requestId, "t8star-fal-gpt-image-2");

  const pollResult = await pollT8StarFalGptImage2Task(requestId);
  return { remoteUrl: pollResult.imageUrl };
}

async function callT8StarFalGptImage2Edit(params: {
  prompt: string;
  quality: string;
  ratio: string | null;
  outputQuality: string;
  imageBlob: Blob;
  imageName: string;
}): Promise<T8StarGenResult> {
  // Upload the image blob to a public URL so fal.ai can fetch it
  const ext = params.imageName.split(".").pop() ?? "png";
  const publicUrl = await uploadBlobToPublicUrl(params.imageBlob, ext);

  return callT8StarFalGptImage2({
    prompt: params.prompt,
    quality: params.quality,
    ratio: params.ratio,
    outputQuality: params.outputQuality,
    referenceImageUrls: [publicUrl],
  });
}

// ── GPT Image 2: Fallback wrappers ──

async function callGptImage2WithFallback(params: {
  prompt: string;
  quality: string;
  ratio: string | null;
  normalizedReferenceImages: string[];
  hasRefImages: boolean;
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<T8StarGenResult> {
  // ── Duomi → T8Star direct fallback ──
  const providers = getGptImage2Providers();
  if (providers.length === 0) throw new Error("All GPT Image 2 providers are unavailable");

  let lastErr: Error | null = null;

  for (const provider of providers) {
    try {
      let result: T8StarGenResult;

      if (provider === 'duomi') {
        let refUrls: string[] | undefined;
        if (params.hasRefImages) {
          refUrls = await Promise.all(params.normalizedReferenceImages.map((u) => ensurePublicUrl(u)));
        }
        result = await callDuomiGptImage2({ prompt: params.prompt, ratio: params.ratio, quality: params.quality, referenceImageUrls: refUrls, onTaskCreated: params.onTaskCreated });
      } else if (provider === 't8star') {
        result = await callT8StarGptImage2Direct({
          prompt: params.prompt,
          quality: params.quality,
          ratio: params.ratio,
          referenceImages: params.normalizedReferenceImages,
          onTaskCreated: params.onTaskCreated,
        });
      } else {
        if (params.hasRefImages) {
          const publicUrls = await Promise.all(params.normalizedReferenceImages.map((u) => ensurePublicUrl(u)));
          result = await callKieGptImage2({ prompt: params.prompt, inputUrls: publicUrls, ratio: params.ratio, quality: params.quality, onTaskCreated: params.onTaskCreated });
        } else {
          result = await callKieGptImage2T2I({ prompt: params.prompt, ratio: params.ratio, quality: params.quality, onTaskCreated: params.onTaskCreated });
        }
      }

      markGptImage2Success(provider);
      console.log("[gpt-image-2] succeeded via %s", provider);
      return result;
    } catch (err: any) {
      lastErr = err;
      markGptImage2Failure(provider);
      console.warn("[gpt-image-2] %s failed: %s — trying next provider...", provider, err.message?.slice(0, 200));
    }
  }

  throw lastErr ?? new Error("All GPT Image 2 providers failed");
}

async function callGptImage2EditWithFallback(params: {
  prompt: string;
  quality: string;
  ratio: string | null;
  imageBlob: Blob;
  imageName: string;
}): Promise<T8StarGenResult> {
  // ── Duomi → T8Star direct fallback ──
  const providers = getGptImage2Providers();
  if (providers.length === 0) throw new Error("All GPT Image 2 edit providers are unavailable");

  let lastErr: Error | null = null;

  for (const provider of providers) {
    try {
      let result: T8StarGenResult;

      if (provider === 'duomi') {
        result = await callDuomiGptImage2Edit({ prompt: params.prompt, imageBlob: params.imageBlob, imageName: params.imageName, ratio: params.ratio, quality: params.quality });
      } else if (provider === 't8star') {
        result = await callT8StarGptImage2EditDirect({ prompt: params.prompt, quality: params.quality, ratio: params.ratio, imageBlob: params.imageBlob, imageName: params.imageName });
      } else {
        result = await callKieGptImage2Edit({ prompt: params.prompt, imageBlob: params.imageBlob, imageName: params.imageName, ratio: params.ratio, quality: params.quality });
      }

      markGptImage2Success(provider);
      console.log("[gpt-image-2] edit succeeded via %s", provider);
      return result;
    } catch (err: any) {
      lastErr = err;
      markGptImage2Failure(provider);
      console.warn("[gpt-image-2] edit %s failed: %s — trying next provider...", provider, err.message?.slice(0, 200));
    }
  }

  throw lastErr ?? new Error("All GPT Image 2 edit providers failed");
}

// ── Nano Banana Circuit Breaker (Duomi → T8Star → AtlasCloud) ──

type NanoBananaProvider = 'duomi' | 't8star' | 'atlascloud';

const NANO_BANANA_FALLBACK_ORDER: NanoBananaProvider[] = ['duomi', 't8star', 'atlascloud'];

const nanoBananaCircuit: Record<NanoBananaProvider, { failures: number; downSince: number }> = {
  duomi: { failures: 0, downSince: 0 },
  t8star: { failures: 0, downSince: 0 },
  atlascloud: { failures: 0, downSince: 0 },
};

function isNanoBananaProviderConfigured(p: NanoBananaProvider): boolean {
  if (p === 'duomi') return !!process.env.DUOMI_API_KEY;
  if (p === 't8star') return !!(T8STAR_GPT_IMAGE2_API_KEY || process.env.T8STAR_API_KEY);
  if (p === 'atlascloud') return !!process.env.ATLASCLOUD_API_KEY;
  return false;
}

function isNanoBananaProviderAvailable(p: NanoBananaProvider): boolean {
  if (!isNanoBananaProviderConfigured(p)) return false;
  const s = nanoBananaCircuit[p];
  if (s.downSince === 0) return true;
  if (Date.now() - s.downSince >= CIRCUIT_RECOVERY_MS) return true;
  return false;
}

function markNanoBananaSuccess(p: NanoBananaProvider) {
  nanoBananaCircuit[p] = { failures: 0, downSince: 0 };
}

function markNanoBananaFailure(p: NanoBananaProvider) {
  const s = nanoBananaCircuit[p];
  s.failures++;
  if (s.failures >= CIRCUIT_FAILURE_THRESHOLD || s.downSince > 0) {
    s.downSince = Date.now();
  }
}

function getNanoBananaProviders(): NanoBananaProvider[] {
  return NANO_BANANA_FALLBACK_ORDER.filter(isNanoBananaProviderAvailable);
}

// ── Nano Banana: T8Star direct calls (extracted for circuit breaker) ──

async function callT8StarNanoBananaDirect(params: {
  prompt: string;
  baseModel: string;
  quality: string;
  ratio: string | null;
  referenceImages: string[];
}): Promise<T8StarGenResult> {
  const { prompt, baseModel, quality, ratio, referenceImages } = params;
  const upstreamModel = buildT8StarModel(baseModel, quality);
  const apiKey = getT8StarApiKey(baseModel, quality);
  if (!apiKey) throw new Error("T8Star API key is not configured for Nano Banana");

  let upstreamRes: Response;

  if (referenceImages.length > 0) {
    const imageBlobs: { blob: Blob; name: string }[] = [];
    for (const url of referenceImages) {
      const resolved = await resolveReferenceBlob(url);
      if (resolved) imageBlobs.push(resolved);
    }

    if (imageBlobs.length > 0) {
      const totalBytes = imageBlobs.reduce((sum, item) => sum + item.blob.size, 0);
      console.log("[nano-banana] t8star refs model=%s count=%d size=%dKB", baseModel, imageBlobs.length, Math.round(totalBytes / 1024));

      const formData = new FormData();
      formData.append("model", upstreamModel);
      formData.append("prompt", prompt);
      formData.append("response_format", "url");
      if (ratio && SUPPORTED_RATIOS.has(ratio)) formData.append("aspect_ratio", ratio);
      formData.append("image_size", quality);
      for (const { blob, name } of imageBlobs) {
        formData.append("image", blob, name);
      }

      upstreamRes = await fetch(`${T8STAR_BASE_URL}/v1/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal: AbortSignal.timeout(600_000),
      });
    } else {
      const upstreamBody: Record<string, unknown> = {
        model: upstreamModel, prompt, response_format: "url", image_size: quality,
      };
      if (ratio && SUPPORTED_RATIOS.has(ratio)) upstreamBody.aspect_ratio = ratio;

      upstreamRes = await fetch(`${T8STAR_BASE_URL}/v1/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(upstreamBody),
        signal: AbortSignal.timeout(600_000),
      });
    }
  } else {
    const upstreamBody: Record<string, unknown> = {
      model: upstreamModel, prompt, response_format: "url", image_size: quality,
    };
    if (ratio && SUPPORTED_RATIOS.has(ratio)) upstreamBody.aspect_ratio = ratio;

    console.log("[nano-banana] t8star t2i model=%s size=%s ratio=%s", upstreamModel, quality, ratio ?? "");

    upstreamRes = await fetch(`${T8STAR_BASE_URL}/v1/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(600_000),
    });
  }

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text().catch(() => "Unknown error");
    throw new Error(`Nano Banana T8Star error ${upstreamRes.status}: ${errText.slice(0, 2000)}`);
  }

  const result = await upstreamRes.json();
  const remoteUrl = result.data?.[0]?.url || result.images?.[0]?.url;
  if (!remoteUrl) throw new Error("No image returned from T8Star for Nano Banana");
  return { remoteUrl };
}

async function callT8StarNanoBananaEditDirect(params: {
  prompt: string;
  baseModel: string;
  quality: string;
  ratio: string | null;
  imageBlob: Blob;
  imageName: string;
}): Promise<T8StarGenResult> {
  const { prompt, baseModel, quality, ratio, imageBlob, imageName } = params;
  const upstreamModel = buildT8StarModel(baseModel, quality);
  const apiKey = getT8StarApiKey(baseModel, quality);
  if (!apiKey) throw new Error("T8Star API key is not configured for Nano Banana edit");

  const formData = new FormData();
  formData.append("model", upstreamModel);
  formData.append("prompt", prompt);
  formData.append("image", imageBlob, imageName);
  formData.append("response_format", "url");
  if (ratio && SUPPORTED_RATIOS.has(ratio)) formData.append("aspect_ratio", ratio);
  formData.append("image_size", quality);

  console.log("[nano-banana] t8star edit model=%s size=%s ratio=%s", upstreamModel, quality, ratio ?? "");

  const upstreamRes = await fetch(`${T8STAR_BASE_URL}/v1/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(600_000),
  });

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text().catch(() => "Unknown error");
    throw new Error(`Nano Banana T8Star edit error ${upstreamRes.status}: ${errText.slice(0, 2000)}`);
  }

  const result = await upstreamRes.json();
  const remoteUrl = result.data?.[0]?.url || result.images?.[0]?.url;
  if (!remoteUrl) throw new Error("No image returned from T8Star for Nano Banana edit");
  return { remoteUrl };
}

// ── Nano Banana: Fallback wrappers ──

async function callNanoBananaWithFallback(params: {
  prompt: string;
  baseModel: string;
  quality: string;
  ratio: string | null;
  normalizedReferenceImages: string[];
  hasRefImages: boolean;
  thinkingLevel?: string;
  enableWebSearch?: boolean;
  enableImageSearch?: boolean;
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<T8StarGenResult> {
  // ── Duomi → T8Star → AtlasCloud fallback ──
  const providers = getNanoBananaProviders();
  if (providers.length === 0) throw new Error("All Nano Banana providers are unavailable");

  let lastErr: Error | null = null;

  for (const provider of providers) {
    try {
      let result: T8StarGenResult;

      if (provider === 'duomi') {
        let refUrls: string[] | undefined;
        if (params.hasRefImages) {
          refUrls = await Promise.all(params.normalizedReferenceImages.map((u) => ensurePublicUrl(u)));
        }
        result = await callDuomiNanoBanana({
          prompt: params.prompt, baseModel: params.baseModel,
          ratio: params.ratio, quality: params.quality,
          referenceImageUrls: refUrls, onTaskCreated: params.onTaskCreated,
        });
      } else if (provider === 't8star') {
        result = await callT8StarNanoBananaDirect({
          prompt: params.prompt, baseModel: params.baseModel,
          quality: params.quality, ratio: params.ratio,
          referenceImages: params.normalizedReferenceImages,
        });
      } else {
        // AtlasCloud — supports thinkingLevel / webSearch / imageSearch
        let refUrls: string[] | undefined;
        if (params.hasRefImages) {
          refUrls = await Promise.all(params.normalizedReferenceImages.map((u) => ensurePublicUrl(u)));
        }
        result = await callAtlasCloudNanoBanana({
          prompt: params.prompt,
          baseModel: params.baseModel,
          ratio: params.ratio,
          quality: params.quality,
          referenceImageUrls: refUrls,
          thinkingLevel: params.thinkingLevel,
          enableWebSearch: params.enableWebSearch,
          enableImageSearch: params.enableImageSearch,
          onTaskCreated: params.onTaskCreated,
        });
      }

      markNanoBananaSuccess(provider);
      console.log("[nano-banana] succeeded via %s", provider);
      return result;
    } catch (err: any) {
      lastErr = err;
      markNanoBananaFailure(provider);
      console.warn("[nano-banana] %s failed: %s — trying next provider...", provider, err.message?.slice(0, 200));
    }
  }

  throw lastErr ?? new Error("All Nano Banana providers failed");
}

async function callNanoBananaEditWithFallback(params: {
  prompt: string;
  baseModel: string;
  quality: string;
  ratio: string | null;
  imageBlob: Blob;
  imageName: string;
}): Promise<T8StarGenResult> {
  // ── Duomi → T8Star → AtlasCloud fallback ──
  const providers = getNanoBananaProviders();
  if (providers.length === 0) throw new Error("All Nano Banana edit providers are unavailable");

  let lastErr: Error | null = null;

  for (const provider of providers) {
    try {
      let result: T8StarGenResult;

      if (provider === 'duomi') {
        result = await callDuomiNanoBananaEdit({
          prompt: params.prompt, baseModel: params.baseModel,
          imageBlob: params.imageBlob, imageName: params.imageName,
          ratio: params.ratio, quality: params.quality,
        });
      } else if (provider === 't8star') {
        result = await callT8StarNanoBananaEditDirect({
          prompt: params.prompt, baseModel: params.baseModel,
          quality: params.quality, ratio: params.ratio,
          imageBlob: params.imageBlob, imageName: params.imageName,
        });
      } else {
        // AtlasCloud — upload blob to public URL first
        const ext = params.imageName.split(".").pop() ?? "png";
        const publicUrl = await uploadBlobToPublicUrl(params.imageBlob, ext);
        result = await callAtlasCloudNanoBanana({
          prompt: params.prompt,
          baseModel: params.baseModel,
          ratio: params.ratio,
          quality: params.quality,
          referenceImageUrls: [publicUrl],
        });
      }

      markNanoBananaSuccess(provider);
      console.log("[nano-banana] edit succeeded via %s", provider);
      return result;
    } catch (err: any) {
      lastErr = err;
      markNanoBananaFailure(provider);
      console.warn("[nano-banana] edit %s failed: %s — trying next provider...", provider, err.message?.slice(0, 200));
    }
  }

  throw lastErr ?? new Error("All Nano Banana edit providers failed");
}

export async function callT8StarGeneration(params: T8StarGenParams): Promise<T8StarGenResult> {
  const { prompt, baseModel, quality, ratio, referenceImages, apiKey } = params;
  const isSeedream = SEEDREAM_MODELS.has(baseModel);
  const isGptImage2 = GPT_IMAGE_2_MODELS.has(baseModel);
  const upstreamModel = buildT8StarModel(baseModel, quality);
  const normalizedReferenceImages = normalizeReferenceUrls(baseModel, referenceImages);
  const hasRefImages = normalizedReferenceImages.length > 0;

  if ((referenceImages?.length ?? 0) > normalizedReferenceImages.length) {
    console.log(
      "[t8star] normalized refs model=%s input=%d used=%d",
      baseModel,
      referenceImages?.length ?? 0,
      normalizedReferenceImages.length,
    );
  }

  let upstreamRes: Response;

  if (isGptImage2) {
    return callGptImage2WithFallback({
      prompt,
      quality,
      ratio,
      normalizedReferenceImages,
      hasRefImages,
      onTaskCreated: params.onTaskCreated,
    });
  } else if (isSeedream) {
    // OpenCrow → KIE fallback with circuit breaker
    return callSeedreamWithFallback({ baseModel, prompt, inputUrls: normalizedReferenceImages, ratio, quality, onTaskCreated: params.onTaskCreated });
  } else if (NANO_BANANA_MODELS.has(baseModel)) {
    return callNanoBananaWithFallback({
      prompt, baseModel, quality, ratio,
      normalizedReferenceImages, hasRefImages,
      thinkingLevel: params.thinkingLevel,
      enableWebSearch: params.enableWebSearch,
      enableImageSearch: params.enableImageSearch,
      onTaskCreated: params.onTaskCreated,
    });
  } else if (hasRefImages) {
    const imageBlobs: { blob: Blob; name: string }[] = [];
    for (const url of normalizedReferenceImages) {
      const resolved = await resolveReferenceBlob(url);
      if (resolved) imageBlobs.push(resolved);
    }

    if (imageBlobs.length > 0) {
      const totalBytes = imageBlobs.reduce((sum, item) => sum + item.blob.size, 0);
      console.log(
        "[t8star] refs payload model=%s count=%d size=%dKB",
        baseModel,
        imageBlobs.length,
        Math.round(totalBytes / 1024),
      );

      const formData = new FormData();
      formData.append("model", upstreamModel);
      formData.append("prompt", prompt);
      formData.append("response_format", "url");
      if (ratio && SUPPORTED_RATIOS.has(ratio)) formData.append("aspect_ratio", ratio);
      formData.append("image_size", quality);
      for (const { blob, name } of imageBlobs) {
        formData.append("image", blob, name);
      }

      upstreamRes = await fetch(`${T8STAR_BASE_URL}/v1/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
        signal: AbortSignal.timeout(600_000),
      });
    } else {
      // Fallback to text-only generation if all references failed to resolve.
      const upstreamBody: Record<string, unknown> = {
        model: upstreamModel,
        prompt,
        response_format: "url",
        image_size: quality,
      };
      if (ratio && SUPPORTED_RATIOS.has(ratio)) upstreamBody.aspect_ratio = ratio;

      upstreamRes = await fetch(`${T8STAR_BASE_URL}/v1/images/generations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(upstreamBody),
        signal: AbortSignal.timeout(600_000),
      });
    }
  } else {
    const upstreamBody: Record<string, unknown> = {
      model: upstreamModel,
      prompt,
      response_format: "url",
      image_size: quality,
    };
    if (ratio && SUPPORTED_RATIOS.has(ratio)) upstreamBody.aspect_ratio = ratio;

    upstreamRes = await fetch(`${T8STAR_BASE_URL}/v1/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(600_000),
    });
  }

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text().catch(() => "Unknown error");
    throw new Error(`Upstream error ${upstreamRes.status}: ${errText.slice(0, 2000)}`);
  }

  const result = await upstreamRes.json();
  const remoteUrl = result.data?.[0]?.url || result.images?.[0]?.url;
  const revisedPrompt = result.data?.[0]?.revised_prompt;

  if (!remoteUrl) {
    throw new Error("No image returned from upstream");
  }

  return { remoteUrl, revisedPrompt };
}

export interface T8StarEditParams {
  prompt: string;
  baseModel: string;
  quality: string;
  ratio: string | null;
  imageBlob: Blob;
  imageName: string;
  apiKey: string;
}

export async function callT8StarImageEdit(params: T8StarEditParams): Promise<T8StarGenResult> {
  const { prompt, baseModel, quality, ratio, imageBlob, imageName, apiKey } = params;
  const isSeedream = SEEDREAM_MODELS.has(baseModel);
  const isGptImage2 = GPT_IMAGE_2_MODELS.has(baseModel);

  let upstreamRes: Response;

  if (isGptImage2) {
    return callGptImage2EditWithFallback({ prompt, quality, ratio, imageBlob, imageName });
  } else if (isSeedream) {
    // OpenCrow → KIE fallback with circuit breaker
    return callSeedreamEditWithFallback({ baseModel, prompt, imageBlob, imageName, ratio, quality });
  } else if (NANO_BANANA_MODELS.has(baseModel)) {
    return callNanoBananaEditWithFallback({ prompt, baseModel, quality, ratio, imageBlob, imageName });
  } else {
    const upstreamModel = buildT8StarModel(baseModel, quality);
    const formData = new FormData();
    formData.append("model", upstreamModel);
    formData.append("prompt", prompt);
    formData.append("image", imageBlob, imageName);
    formData.append("response_format", "url");
    if (ratio && SUPPORTED_RATIOS.has(ratio)) formData.append("aspect_ratio", ratio);
    formData.append("image_size", quality);

    upstreamRes = await fetch(`${T8STAR_BASE_URL}/v1/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(600_000),
    });
  }

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text().catch(() => "Unknown error");
    throw new Error(`Upstream error ${upstreamRes.status}: ${errText.slice(0, 2000)}`);
  }

  const result = await upstreamRes.json();
  const remoteUrl = result.data?.[0]?.url || result.images?.[0]?.url;
  const revisedPrompt = result.data?.[0]?.revised_prompt;

  if (!remoteUrl) {
    throw new Error("No image returned from upstream");
  }

  return { remoteUrl, revisedPrompt };
}
