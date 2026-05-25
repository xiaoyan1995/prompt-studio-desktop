// ── GPT Image 2 Official — OpenCrow + AtlasCloud + Runware + OpenAI fallback ──
// Circuit-breaker fallback: OpenCrow → AtlasCloud → Runware → OpenAI

import { callOpenAIGptImage2, isOpenAIConfigured } from "./openai-image";
import { callRunwareGptImage2, isRunwareConfigured } from "./runware-image";
import { callOpenCrowGptImage2, callOpenCrowGptImage2Edit, isOpenCrowImageConfigured } from "./opencrow-image";
import { ensurePublicUrl } from "./t8star-video";

const ATLASCLOUD_BASE_URL = "https://api.atlascloud.ai";
const ATLASCLOUD_API_KEY = process.env.ATLASCLOUD_API_KEY || "";

const ATLASCLOUD_POLL_INTERVAL_MS = 3_000;
const ATLASCLOUD_MAX_POLL_ATTEMPTS = 600; // ~30 min
const ATLASCLOUD_MAX_CONSECUTIVE_ERRORS = 10;

// ── Circuit breaker ──

type GptImage2OfficialProvider = "opencrow" | "atlascloud" | "runware" | "openai";
const GPT_IMAGE2_OFFICIAL_ORDER: GptImage2OfficialProvider[] = ["opencrow", "atlascloud", "runware", "openai"];
const CIRCUIT_FAILURE_THRESHOLD = 2;
const CIRCUIT_RECOVERY_MS = 5 * 60 * 1000; // 5 min

const officialCircuit: Record<GptImage2OfficialProvider, { failures: number; downSince: number }> = {
  opencrow: { failures: 0, downSince: 0 },
  atlascloud: { failures: 0, downSince: 0 },
  runware: { failures: 0, downSince: 0 },
  openai: { failures: 0, downSince: 0 },
};

function isOfficialProviderConfigured(p: GptImage2OfficialProvider): boolean {
  if (p === "opencrow") return isOpenCrowImageConfigured();
  if (p === "atlascloud") return !!ATLASCLOUD_API_KEY;
  if (p === "runware") return isRunwareConfigured();
  if (p === "openai") return isOpenAIConfigured();
  return false;
}

function isOfficialProviderAvailable(p: GptImage2OfficialProvider): boolean {
  if (!isOfficialProviderConfigured(p)) return false;
  const s = officialCircuit[p];
  if (s.downSince === 0) return true;
  if (Date.now() - s.downSince >= CIRCUIT_RECOVERY_MS) return true;
  return false;
}

function markOfficialSuccess(p: GptImage2OfficialProvider) {
  officialCircuit[p] = { failures: 0, downSince: 0 };
}

function markOfficialFailure(p: GptImage2OfficialProvider) {
  const s = officialCircuit[p];
  s.failures++;
  if (s.failures >= CIRCUIT_FAILURE_THRESHOLD || s.downSince > 0) {
    s.downSince = Date.now();
  }
}

function getOfficialProviders(): GptImage2OfficialProvider[] {
  return GPT_IMAGE2_OFFICIAL_ORDER.filter(isOfficialProviderAvailable);
}

export function useOfficialGptImage2(): boolean {
  return getOfficialProviders().length > 0;
}

// Keep backward compat
export function useAtlasCloudForGptImage2(): boolean {
  return useOfficialGptImage2();
}

// ── Size mapping ──
// Available sizes: "1024x768", "768x1024", "1024x1024", "1024x1536",
//   "1536x1024", "2560x1440", "1440x2560", "3840x2160", "2160x3840"

const ATLASCLOUD_SIZE_MAP: Record<string, Record<string, string>> = {
  "1K": {
    "1:1": "1024x1024",
    "4:3": "1024x768", "3:4": "768x1024",
    "3:2": "1536x1024", "2:3": "1024x1536",
    "16:9": "1536x1024", "9:16": "1024x1536",
    "5:4": "1024x768", "4:5": "768x1024",
    "21:9": "1536x1024",
    "2:1": "1536x1024", "1:2": "1024x1536",
  },
  "2K": {
    "1:1": "2560x1440",
    "4:3": "2560x1440", "3:4": "1440x2560",
    "3:2": "2560x1440", "2:3": "1440x2560",
    "16:9": "2560x1440", "9:16": "1440x2560",
    "5:4": "2560x1440", "4:5": "1440x2560",
    "21:9": "2560x1440",
    "2:1": "2560x1440", "1:2": "1440x2560",
  },
  "4K": {
    "1:1": "3840x2160",
    "4:3": "3840x2160", "3:4": "2160x3840",
    "3:2": "3840x2160", "2:3": "2160x3840",
    "16:9": "3840x2160", "9:16": "2160x3840",
    "5:4": "3840x2160", "4:5": "2160x3840",
    "21:9": "3840x2160",
    "2:1": "3840x2160", "1:2": "2160x3840",
  },
};

const ATLASCLOUD_QUALITY_MAP: Record<string, string> = {
  "1K": "medium",
  "2K": "high",
  "4K": "high",
};

function buildAtlasCloudSize(ratio: string | null, quality: string): string {
  const qMap = ATLASCLOUD_SIZE_MAP[quality] ?? ATLASCLOUD_SIZE_MAP["1K"];
  if (!ratio) return qMap["1:1"] ?? "1024x1024";
  return qMap[ratio] ?? qMap["1:1"] ?? "1024x1024";
}

// ── Polling ──

export async function pollAtlasCloudTask(requestId: string): Promise<{ imageUrl: string }> {
  const queryUrl = `${ATLASCLOUD_BASE_URL}/api/v1/model/prediction/${requestId}`;
  let consecutiveErrors = 0;
  let lastErrorMsg = "";

  for (let attempt = 1; attempt <= ATLASCLOUD_MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, ATLASCLOUD_POLL_INTERVAL_MS));

    try {
      const res = await fetch(queryUrl, {
        headers: { Authorization: `Bearer ${ATLASCLOUD_API_KEY}` },
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        lastErrorMsg = `HTTP ${res.status}`;
        consecutiveErrors++;
        if (attempt % 10 === 0) {
          console.log("[atlascloud] poll %s attempt=%d status=%d errors=%d", requestId, attempt, res.status, consecutiveErrors);
        }
        if (consecutiveErrors >= ATLASCLOUD_MAX_CONSECUTIVE_ERRORS) {
          throw new Error(`AtlasCloud poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg})`);
        }
        continue;
      }
      consecutiveErrors = 0;

      const body = await res.json();
      const data = body.data ?? body;
      const status = (data.status ?? "").toLowerCase();

      if (status === "completed" || status === "succeeded") {
        const outputs = data.outputs ?? [];
        const imageUrl = Array.isArray(outputs) && outputs.length > 0 ? outputs[0] : "";
        if (!imageUrl) throw new Error("AtlasCloud task succeeded but no image URL in outputs");
        console.log("[atlascloud] task=%s completed (attempt %d)", requestId, attempt);
        return { imageUrl };
      }

      if (status === "failed" || status === "error") {
        const failMsg = data.error ?? data.message ?? "unknown error";
        throw new Error(`AtlasCloud task failed: ${failMsg}`);
      }

      // Still processing
      if (attempt % 20 === 0) {
        console.log("[atlascloud] poll %s attempt=%d status=%s", requestId, attempt, status);
      }
    } catch (err: any) {
      if (err.message?.includes("task failed") || err.message?.includes("poll failed") || err.message?.includes("no image URL")) throw err;
      lastErrorMsg = err.message ?? "Unknown fetch error";
      consecutiveErrors++;
      if (consecutiveErrors >= ATLASCLOUD_MAX_CONSECUTIVE_ERRORS) {
        throw new Error(`AtlasCloud poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg})`);
      }
    }
  }

  throw new Error(`AtlasCloud task timed out after ${ATLASCLOUD_MAX_POLL_ATTEMPTS} attempts`);
}

// ── GPT Image 2 (text-to-image) ──

export interface AtlasCloudImageResult {
  remoteUrl: string;
}

export async function callAtlasCloudGptImage2(params: {
  prompt: string;
  ratio: string | null;
  quality: string;
  outputQuality?: string;
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<AtlasCloudImageResult> {
  if (!ATLASCLOUD_API_KEY) throw new Error("ATLASCLOUD_API_KEY is not configured");

  const sizeValue = buildAtlasCloudSize(params.ratio, params.quality);
  const qualityValue = params.outputQuality && ["low", "medium", "high"].includes(params.outputQuality)
    ? params.outputQuality
    : ATLASCLOUD_QUALITY_MAP[params.quality] ?? "medium";

  const body = {
    model: "openai/gpt-image-2/text-to-image",
    prompt: params.prompt,
    size: sizeValue,
    quality: qualityValue,
    output_format: "png",
    enable_sync_mode: false,
    enable_base64_output: false,
  };

  console.log("[atlascloud-gpt-image-2] request size=%s quality=%s", sizeValue, qualityValue);

  const submitRes = await fetch(`${ATLASCLOUD_BASE_URL}/api/v1/model/generateImage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ATLASCLOUD_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => "Unknown error");
    throw new Error(`AtlasCloud GPT Image 2 submit error ${submitRes.status}: ${errText.slice(0, 2000)}`);
  }

  const submitResult = await submitRes.json();
  const data = submitResult.data ?? submitResult;
  const requestId = data.id;
  if (!requestId) {
    throw new Error(`No id in AtlasCloud response: ${JSON.stringify(submitResult).slice(0, 500)}`);
  }

  console.log("[atlascloud-gpt-image-2] task submitted id=%s", requestId);
  params.onTaskCreated?.(requestId, "atlascloud-gpt-image-2");

  const result = await pollAtlasCloudTask(requestId);
  return { remoteUrl: result.imageUrl };
}

// ── GPT Image 2 (image-to-image / edit) ──

export async function callAtlasCloudGptImage2Edit(params: {
  prompt: string;
  ratio: string | null;
  quality: string;
  outputQuality?: string;
  referenceImages: string[];
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<AtlasCloudImageResult> {
  if (!ATLASCLOUD_API_KEY) throw new Error("ATLASCLOUD_API_KEY is not configured");
  if (params.referenceImages.length === 0) throw new Error("AtlasCloud edit requires at least 1 reference image");

  const sizeValue = buildAtlasCloudSize(params.ratio, params.quality);
  const qualityValue = params.outputQuality && ["low", "medium", "high"].includes(params.outputQuality)
    ? params.outputQuality
    : ATLASCLOUD_QUALITY_MAP[params.quality] ?? "medium";

  const body = {
    model: "openai/gpt-image-2/edit",
    prompt: params.prompt,
    images: params.referenceImages.slice(0, 10),
    size: sizeValue,
    quality: qualityValue,
    output_format: "png",
    enable_sync_mode: false,
    enable_base64_output: false,
  };

  console.log("[atlascloud-gpt-image-2-edit] request size=%s quality=%s refs=%d", sizeValue, qualityValue, body.images.length);

  const submitRes = await fetch(`${ATLASCLOUD_BASE_URL}/api/v1/model/generateImage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ATLASCLOUD_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => "Unknown error");
    throw new Error(`AtlasCloud GPT Image 2 edit error ${submitRes.status}: ${errText.slice(0, 2000)}`);
  }

  const submitResult = await submitRes.json();
  const data = submitResult.data ?? submitResult;
  const requestId = data.id;
  if (!requestId) {
    throw new Error(`No id in AtlasCloud edit response: ${JSON.stringify(submitResult).slice(0, 500)}`);
  }

  console.log("[atlascloud-gpt-image-2-edit] task submitted id=%s", requestId);
  params.onTaskCreated?.(requestId, "atlascloud-gpt-image-2");

  const result = await pollAtlasCloudTask(requestId);
  return { remoteUrl: result.imageUrl };
}

// ── Nano Banana (2 + Pro) via AtlasCloud (direct, no fallback) ──

const NANO_BANANA_RESOLUTION_MAP: Record<string, string> = {
  "512": "1k",
  "1K": "1k",
  "2K": "2k",
  "4K": "4k",
};

const NANO_BANANA_ULTRA_RESOLUTION_MAP: Record<string, string> = {
  "512": "4k",
  "1K": "4k",
  "2K": "4k",
  "4K": "4k",
  "8K": "8k",
};

const NANO_BANANA_MODEL_MAP: Record<string, { t2i: string; edit: string; maxImages: number; ultra?: boolean }> = {
  "nano-banana-2": { t2i: "google/nano-banana-2/text-to-image", edit: "google/nano-banana-2/edit", maxImages: 14 },
  "nano-banana-pro": { t2i: "google/nano-banana-pro/text-to-image", edit: "google/nano-banana-pro/edit", maxImages: 10 },
  "nano-banana-pro-ultra": { t2i: "google/nano-banana-pro/text-to-image-ultra", edit: "google/nano-banana-pro/edit-ultra", maxImages: 10, ultra: true },
};

export function useAtlasCloudForNanoBanana(): boolean {
  return !!ATLASCLOUD_API_KEY;
}

// Keep backward compat alias
export function useAtlasCloudForNanoBananaPro(): boolean {
  return useAtlasCloudForNanoBanana();
}

export async function callAtlasCloudNanoBanana(params: {
  prompt: string;
  baseModel: string;
  ratio: string | null;
  quality: string;
  referenceImageUrls?: string[];
  thinkingLevel?: string;
  enableWebSearch?: boolean;
  enableImageSearch?: boolean;
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<AtlasCloudImageResult> {
  if (!ATLASCLOUD_API_KEY) throw new Error("ATLASCLOUD_API_KEY is not configured");

  const hasRefs = params.referenceImageUrls && params.referenceImageUrls.length > 0;
  const modelEntry = NANO_BANANA_MODEL_MAP[params.baseModel] ?? NANO_BANANA_MODEL_MAP["nano-banana-2"];
  const isUltra = !!modelEntry.ultra;
  const resolution = isUltra
    ? (NANO_BANANA_ULTRA_RESOLUTION_MAP[params.quality] ?? "4k")
    : (NANO_BANANA_RESOLUTION_MAP[params.quality] ?? "1k");
  const model = hasRefs ? modelEntry.edit : modelEntry.t2i;
  const providerTag = `atlascloud-${params.baseModel}`;

  const body: Record<string, unknown> = {
    model,
    prompt: params.prompt,
    resolution,
    output_format: "png",
    enable_sync_mode: false,
    enable_base64_output: false,
  };

  // media_resolution only for non-ultra models
  if (!isUltra) {
    body.media_resolution = "high";
  }

  if (params.ratio) {
    body.aspect_ratio = params.ratio;
  }

  if (hasRefs) {
    body.images = params.referenceImageUrls!.slice(0, modelEntry.maxImages);
  }

  // thinking_level / search only for non-ultra models
  if (!isUltra) {
    if (params.thinkingLevel && params.thinkingLevel !== "default") {
      body.thinking_level = params.thinkingLevel;
    }
    if (params.enableWebSearch) {
      body.enable_web_search = true;
    }
    if (params.enableImageSearch) {
      body.enable_image_search = true;
    }
  }

  console.log("[%s] %s model=%s resolution=%s ratio=%s refs=%d thinking=%s webSearch=%s imgSearch=%s",
    providerTag, hasRefs ? "i2i" : "t2i", model, resolution, params.ratio ?? "none",
    params.referenceImageUrls?.length ?? 0, params.thinkingLevel ?? "default",
    params.enableWebSearch ? "on" : "off", params.enableImageSearch ? "on" : "off");

  const submitRes = await fetch(`${ATLASCLOUD_BASE_URL}/api/v1/model/generateImage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ATLASCLOUD_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => "Unknown error");
    throw new Error(`AtlasCloud ${params.baseModel} submit error ${submitRes.status}: ${errText.slice(0, 2000)}`);
  }

  const submitResult = await submitRes.json();
  const data = submitResult.data ?? submitResult;
  const requestId = data.id;
  if (!requestId) {
    throw new Error(`No id in AtlasCloud ${params.baseModel} response: ${JSON.stringify(submitResult).slice(0, 500)}`);
  }

  console.log("[%s] task submitted id=%s", providerTag, requestId);
  params.onTaskCreated?.(requestId, providerTag);

  const result = await pollAtlasCloudTask(requestId);
  return { remoteUrl: result.imageUrl };
}

// Keep backward compat alias
export async function callAtlasCloudNanoBananaPro(params: {
  prompt: string;
  ratio: string | null;
  quality: string;
  referenceImageUrls?: string[];
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<AtlasCloudImageResult> {
  return callAtlasCloudNanoBanana({ ...params, baseModel: "nano-banana-pro" });
}

// ── Fallback: OpenCrow → AtlasCloud → Runware → OpenAI ──

export async function callGptImage2OfficialWithFallback(params: {
  prompt: string;
  ratio: string | null;
  quality: string;
  outputQuality?: string;
  referenceImages?: string[];
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<{ remoteUrl: string; provider: string }> {
  const rawRefs = params.referenceImages?.filter(Boolean) ?? [];

  // ── Image-to-image: route by ref count ──
  if (rawRefs.length > 0) {
    // Resolve all reference image URLs to publicly accessible URLs
    // (localhost/internal URLs → S3 public URLs; already-public URLs pass through)
    const refs = await Promise.all(rawRefs.map((u) => ensurePublicUrl(u)));
    console.log("[gpt-image-2-official] resolved %d ref URLs to public", refs.length);
    // > 10 refs → Runware only (supports up to 16, others max 10)
    if (refs.length > 10) {
      if (!isRunwareConfigured()) throw new Error("Runware not configured and ref count > 10 (others max 10)");
      console.log("[gpt-image-2-official] refs=%d > 10 → Runware", refs.length);
      try {
        const result = await callRunwareGptImage2({ ...params, referenceImages: refs });
        console.log("[gpt-image-2-official] Runware edit succeeded refs=%d", refs.length);
        return { ...result, provider: "runware-gpt-image-2" };
      } catch (err: any) {
        throw new Error(`Runware GPT Image 2 edit failed (refs=${refs.length}): ${err.message?.slice(0, 300)}`);
      }
    }

    // ≤ 10 refs → OpenCrow → AtlasCloud → Runware
    let lastEditErr: Error | null = null;

    // 1. OpenCrow edit (sync, multipart/form-data)
    if (isOpenCrowImageConfigured()) {
      try {
        const result = await callOpenCrowGptImage2Edit({ ...params, referenceImages: refs });
        console.log("[gpt-image-2-official] OpenCrow edit succeeded refs=%d", refs.length);
        return { ...result, provider: "opencrow-gpt-image-2" };
      } catch (err: any) {
        lastEditErr = err;
        console.warn("[gpt-image-2-official] OpenCrow edit failed: %s — trying AtlasCloud...", err.message?.slice(0, 200));
      }
    }

    // 2. AtlasCloud edit (async poll)
    if (ATLASCLOUD_API_KEY) {
      try {
        const result = await callAtlasCloudGptImage2Edit({ ...params, referenceImages: refs });
        console.log("[gpt-image-2-official] AtlasCloud edit succeeded refs=%d", refs.length);
        return { ...result, provider: "atlascloud-gpt-image-2" };
      } catch (err: any) {
        lastEditErr = err;
        console.warn("[gpt-image-2-official] AtlasCloud edit failed: %s — trying Runware...", err.message?.slice(0, 200));
      }
    }

    // 3. Runware edit (fallback)
    if (isRunwareConfigured()) {
      try {
        const result = await callRunwareGptImage2({ ...params, referenceImages: refs });
        console.log("[gpt-image-2-official] Runware edit fallback succeeded refs=%d", refs.length);
        return { ...result, provider: "runware-gpt-image-2" };
      } catch (err: any) {
        lastEditErr = err;
      }
    }

    throw lastEditErr ?? new Error("No GPT Image 2 edit provider available");
  }

  // ── Text-to-image (no refs): existing circuit-breaker fallback ──
  const providers = getOfficialProviders();
  if (providers.length === 0) throw new Error("All GPT Image 2 official providers are unavailable");

  let lastErr: Error | null = null;
  for (const provider of providers) {
    try {
      let result: { remoteUrl: string };
      if (provider === "opencrow") {
        result = await callOpenCrowGptImage2(params);
      } else if (provider === "atlascloud") {
        result = await callAtlasCloudGptImage2(params);
      } else if (provider === "runware") {
        result = await callRunwareGptImage2(params);
      } else {
        result = await callOpenAIGptImage2(params);
      }
      markOfficialSuccess(provider);
      console.log("[gpt-image-2-official] succeeded via %s", provider);
      return { ...result, provider: `${provider}-gpt-image-2` };
    } catch (err: any) {
      lastErr = err;
      markOfficialFailure(provider);
      console.warn("[gpt-image-2-official] %s failed: %s — trying next provider...", provider, err.message?.slice(0, 200));
    }
  }
  throw lastErr ?? new Error("All GPT Image 2 official providers failed");
}
