/**
 * OpenCrow Seedance 2.0 video generation adapter.
 *
 * Provider priority: OpenCrow → KIE → T8Star (legacy)
 * Circuit breaker: 2 consecutive failures → mark down for 5 min.
 */
import {
  ensurePresignedUrl,
  ensurePublicUrl,
  type SeedanceTaskResult,
  type SeedanceVideoResult,
  SEEDANCE2_MODEL,
  SEEDANCE2_FAST_MODEL,
  SEEDANCE2_VALID_RATIOS,
  SEEDANCE2_VALID_DURATIONS,
  SEEDANCE2_VALID_RESOLUTIONS,
  createSeedance2Task,
  waitForSeedanceVideo,
  createKieSeedanceTask,
  waitForKieSeedanceVideo,
} from "./t8star-video";

// ── Re-exports for backward compat ──
export { ensurePresignedUrl } from "./t8star-video";

// ── Constants ──

const OPENCROW_BASE_URL = "https://api.opencrow.ai";

const POLL_INTERVAL_MS = 10_000;

/**
 * Parse OpenCrow structured error response.
 * Formats: {"error":{"type":"...","message":"..."}} or {"type":"...","message":"..."}
 */
function parseOpenCrowError(status: number, raw: string): string {
  try {
    const json = JSON.parse(raw);
    const err = json.error ?? json;
    const type = err.type ?? err.code ?? "";
    const msg = err.message ?? err.detail ?? "";
    if (type) return `[${type}] ${msg}`.trim();
    if (msg) return msg;
  } catch { /* not JSON, use raw */ }
  return raw.slice(0, 2000);
}
const MAX_POLL_ATTEMPTS = 240; // 40 min (watchdog re-poll recovers tasks that succeed after timeout)
const MAX_CONSECUTIVE_POLL_ERRORS = 10;

// ── Circuit Breaker ──

export type Seedance2Provider = "opencrow" | "kie" | "t8star";

const SEEDANCE2_FALLBACK_ORDER: Seedance2Provider[] = ["opencrow", "kie"];
const CIRCUIT_FAILURE_THRESHOLD = 2;
const CIRCUIT_RECOVERY_MS = 5 * 60 * 1000; // 5 minutes

const seedance2Circuit: Record<Seedance2Provider, { failures: number; downSince: number }> = {
  opencrow: { failures: 0, downSince: 0 },
  kie: { failures: 0, downSince: 0 },
  t8star: { failures: 0, downSince: 0 },
};

function isSeedance2ProviderConfigured(p: Seedance2Provider): boolean {
  if (p === "opencrow") return !!process.env.OPENCROW_API_KEY;
  if (p === "kie") return !!process.env.KIE_API_KEY;
  if (p === "t8star") return !!process.env.T8STAR_API_KEY;
  return false;
}

function isSeedance2ProviderAvailable(p: Seedance2Provider): boolean {
  if (!isSeedance2ProviderConfigured(p)) return false;
  const s = seedance2Circuit[p];
  if (s.downSince === 0) return true;
  if (Date.now() - s.downSince >= CIRCUIT_RECOVERY_MS) return true; // half-open
  return false;
}

function markSeedance2Success(p: Seedance2Provider) {
  seedance2Circuit[p] = { failures: 0, downSince: 0 };
}

function markSeedance2Failure(p: Seedance2Provider) {
  const s = seedance2Circuit[p];
  s.failures++;
  if (s.failures >= CIRCUIT_FAILURE_THRESHOLD || s.downSince > 0) {
    s.downSince = Date.now();
  }
}

export function getSeedance2Providers(): Seedance2Provider[] {
  return SEEDANCE2_FALLBACK_ORDER.filter(isSeedance2ProviderAvailable);
}

/** Check if OpenCrow is the active primary provider */
export function useOpenCrowForSeedance2(): boolean {
  return isSeedance2ProviderAvailable("opencrow");
}

// ── OpenCrow API types ──

export interface OpenCrowSeedanceCreateParams {
  prompt: string;
  model?: string;
  ratio?: string;
  duration?: number;
  resolution?: string;
  generateAudio?: boolean;
  images?: string[];
  videos?: string[];
  audios?: string[];
  startImageUrl?: string;
  endImageUrl?: string;
  seed?: number;
  apiKey: string;
}

// ── OpenCrow API functions ──

export async function createOpenCrowSeedanceTask(params: OpenCrowSeedanceCreateParams): Promise<SeedanceTaskResult> {
  const {
    prompt,
    model = "dreamina-seedance-2-0-260128",
    ratio = "16:9",
    duration = 5,
    resolution = "720p",
    generateAudio = true,
    images,
    videos,
    audios,
    startImageUrl,
    endImageUrl,
    seed,
    apiKey,
  } = params;

  const hasImages = Array.isArray(images) && images.length > 0;
  const hasVideos = Array.isArray(videos) && videos.length > 0;
  const hasAudios = Array.isArray(audios) && audios.length > 0;
  const hasRefs = hasImages || hasVideos || hasAudios || !!startImageUrl;

  // OpenCrow uses "auto" where T8Star/our code uses "adaptive"
  let effectiveRatio = ratio;
  if (hasRefs && (!ratio || ratio === "auto" || ratio === "adaptive")) {
    effectiveRatio = "auto";
  } else if (ratio === "adaptive") {
    effectiveRatio = "auto";
  } else if (!SEEDANCE2_VALID_RATIOS.has(ratio)) {
    effectiveRatio = "16:9";
  }

  // Build BytePlus-native content array
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: prompt },
  ];

  // Start/end frame mode (role at content-item level, BytePlus native)
  if (startImageUrl) {
    const url = await ensurePublicUrl(startImageUrl);
    content.push({ type: "image_url", image_url: { url }, role: "first_frame" });
  }
  if (endImageUrl) {
    const url = await ensurePublicUrl(endImageUrl);
    content.push({ type: "image_url", image_url: { url }, role: "last_frame" });
  }

  // Reference images (multimodal mode)
  if (hasImages) {
    for (const img of images!) {
      const url = await ensurePublicUrl(img);
      content.push({ type: "image_url", image_url: { url }, role: "reference_image" });
    }
  }

  // Reference videos
  if (hasVideos) {
    for (const vid of videos!) {
      const url = await ensurePublicUrl(vid);
      content.push({ type: "video_url", video_url: { url }, role: "reference_video" });
    }
  }

  // Audio references
  if (hasAudios) {
    for (const aud of audios!) {
      const url = await ensurePublicUrl(aud);
      content.push({ type: "audio_url", audio_url: { url } });
    }
  }

  const body: Record<string, unknown> = {
    model,
    content,
    duration: SEEDANCE2_VALID_DURATIONS.includes(duration) ? duration : 5,
    resolution: SEEDANCE2_VALID_RESOLUTIONS.has(resolution) ? resolution : "720p",
    ratio: effectiveRatio,
    generate_audio: generateAudio,
    watermark: false,
  };

  if (seed !== undefined && seed >= 0) {
    body.seed = seed;
  }

  console.log("[opencrow-seedance] creating task model=%s ratio=%s dur=%d res=%s audio=%s contentItems=%d",
    model, body.ratio, body.duration, body.resolution, body.generate_audio, content.length);

  const res = await fetch(`${OPENCROW_BASE_URL}/v1/videos/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    const parsed = parseOpenCrowError(res.status, errText);
    console.error("[opencrow-seedance] create task failed (%d): %s", res.status, parsed.slice(0, 500));
    throw new Error(`OpenCrow Seedance create failed: ${parsed}`);
  }

  const data = await res.json();
  const taskId = data.id ?? data.data?.task_id ?? data.data?.id;
  const status = data.status ?? "queued";

  if (!taskId) {
    throw new Error(`OpenCrow Seedance create task: no id in response: ${JSON.stringify(data).slice(0, 500)}`);
  }

  console.log("[opencrow-seedance] task created id=%s status=%s", taskId, status);
  return { taskId, status };
}

export async function pollOpenCrowSeedanceTask(taskId: string, apiKey: string): Promise<SeedanceVideoResult> {
  const res = await fetch(`${OPENCROW_BASE_URL}/v1/videos/generations/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    const parsed = parseOpenCrowError(res.status, errText);
    throw new Error(`OpenCrow Seedance poll failed (${res.status}): ${parsed}`);
  }

  const data = await res.json();
  const rawStatus = (data.status ?? "unknown").toLowerCase();
  const videoUrl = data.content?.video_url ?? data.video_url ?? data.data?.video_url ?? "";
  const errorType = data.error?.type ?? data.error?.code ?? "";
  const errorMsg = data.error?.message ?? data.error_message ?? "";
  const errorMessage = errorType ? `[${errorType}] ${errorMsg}`.trim() : errorMsg;
  const errorCode = errorType || (data.error?.code ?? "");

  if (rawStatus !== "running" && rawStatus !== "queued") {
    console.log("[opencrow-seedance] poll task=%s status=%s raw=%j", taskId, rawStatus, JSON.stringify(data).slice(0, 500));
  }

  return { videoUrl, status: rawStatus, errorMessage, errorCode };
}

export async function waitForOpenCrowSeedanceVideo(
  taskId: string,
  apiKey: string,
  onProgress?: (status: string, attempt: number) => void,
): Promise<string> {
  let consecutiveErrors = 0;
  let lastErrorMsg = "";

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const { videoUrl, status, errorMessage, errorCode } = await pollOpenCrowSeedanceTask(taskId, apiKey);
      consecutiveErrors = 0;

      onProgress?.(status, attempt);

      if (status === "succeeded" || status === "completed" || status === "success") {
        if (!videoUrl) throw new Error("OpenCrow Seedance task succeeded but no video_url");
        console.log("[opencrow-seedance] task=%s succeeded url=%s (attempt %d)", taskId, videoUrl.slice(0, 80), attempt);
        return videoUrl;
      }

      if (status === "failed" || status === "error") {
        const detail = errorMessage || errorCode || "unknown error";
        console.error("[opencrow-seedance] task=%s FAILED: %s", taskId, detail.slice(0, 500));
        throw new Error(`OpenCrow Seedance task failed: ${detail}`);
      }

      if (status === "expired" || status === "cancelled") {
        throw new Error(`OpenCrow Seedance task ${taskId} ${status}`);
      }
    } catch (err: any) {
      if (err.message?.includes("task failed") || err.message?.includes("task succeeded") ||
          err.message?.includes("expired") || err.message?.includes("cancelled")) throw err;
      lastErrorMsg = err.message ?? "Unknown error";
      consecutiveErrors++;
      console.log("[opencrow-seedance] poll task=%s attempt=%d error=%s consecutive_errors=%d", taskId, attempt, lastErrorMsg.slice(0, 200), consecutiveErrors);
      if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        throw new Error(`OpenCrow Seedance task poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg.slice(0, 500)})`);
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`OpenCrow Seedance task ${taskId} timed out after ${MAX_POLL_ATTEMPTS} attempts`);
}

// ── Unified Seedance 2.0 interface ──

export interface Seedance2WithFallbackParams {
  prompt: string;
  modelId: string; // "seedance-2" | "seedance-2-fast"
  ratio?: string;
  duration?: number;
  resolution?: string;
  generateAudio?: boolean;
  images?: string[];
  videos?: string[];
  audios?: string[];
  startImageUrl?: string;
  endImageUrl?: string;
  seed?: number;
  /** Callback to persist remote task ID + provider for recovery */
  onTaskCreated?: (taskId: string, provider: string) => void;
  onProgress?: (status: string, attempt: number) => void;
}

/**
 * Seedance 2.0 generation with automatic fallback: OpenCrow → KIE → T8Star.
 * Uses circuit breaker to skip providers that are down.
 * Returns the remote video URL on success.
 */
export async function callSeedance2WithFallback(params: Seedance2WithFallbackParams): Promise<string> {
  const providers = getSeedance2Providers();
  if (providers.length === 0) throw new Error("All Seedance 2.0 providers are unavailable (no API keys configured or all circuit-broken)");

  let lastErr: Error | null = null;

  for (const provider of providers) {
    try {
      const remoteUrl = await callSeedance2Single(provider, params);
      markSeedance2Success(provider);
      console.log("[seedance-2] succeeded via %s", provider);
      return remoteUrl;
    } catch (err: any) {
      lastErr = err;
      // Only mark creation failures as circuit-breaker failures.
      // Poll failures (after task was created) should NOT trigger fallback —
      // the task is already running at the provider.
      if (!err._taskAlreadyCreated) {
        markSeedance2Failure(provider);
        console.warn("[seedance-2] %s failed (creation): %s — trying next provider...", provider, err.message?.slice(0, 300));
      } else {
        // Task was created but polling failed — don't fallback, re-throw
        console.error("[seedance-2] %s failed (polling): %s — NOT falling back (task already created)", provider, err.message?.slice(0, 300));
        throw err;
      }
    }
  }

  throw lastErr ?? new Error("All Seedance 2.0 providers failed");
}

async function callSeedance2Single(
  provider: Seedance2Provider,
  params: Seedance2WithFallbackParams,
): Promise<string> {
  const {
    prompt, modelId, ratio, duration, resolution,
    generateAudio, images, videos, audios,
    startImageUrl, endImageUrl, seed,
    onTaskCreated, onProgress,
  } = params;

  if (provider === "opencrow") {
    const apiKey = process.env.OPENCROW_API_KEY ?? "";
    const ocModel = modelId === "seedance-2-fast"
      ? "dreamina-seedance-2-0-fast-260128"
      : "dreamina-seedance-2-0-260128";

    const { taskId } = await createOpenCrowSeedanceTask({
      prompt,
      model: ocModel,
      ratio: ratio ?? "16:9",
      duration: duration ?? 5,
      resolution: resolution ?? "720p",
      generateAudio: generateAudio !== false,
      images,
      videos,
      audios,
      startImageUrl,
      endImageUrl,
      seed,
      apiKey,
    });

    onTaskCreated?.(taskId, "opencrow-seedance-2");

    try {
      return await waitForOpenCrowSeedanceVideo(taskId, apiKey, onProgress);
    } catch (err: any) {
      err._taskAlreadyCreated = true;
      throw err;
    }
  } else if (provider === "kie") {
    const apiKey = process.env.KIE_API_KEY ?? "";
    const kieModel = modelId === "seedance-2-fast"
      ? "bytedance/seedance-2-fast" as const
      : "bytedance/seedance-2" as const;

    // KIE needs public URLs (not presigned)
    const kieImages = images ? await Promise.all(images.map(u => ensurePublicUrl(u))) : undefined;
    const kieVideos = videos ? await Promise.all(videos.map(u => ensurePublicUrl(u))) : undefined;
    const kieAudios = audios ? await Promise.all(audios.map(u => ensurePublicUrl(u))) : undefined;
    const kieStart = startImageUrl ? await ensurePublicUrl(startImageUrl) : undefined;
    const kieEnd = endImageUrl ? await ensurePublicUrl(endImageUrl) : undefined;

    const { taskId } = await createKieSeedanceTask({
      prompt,
      model: kieModel,
      ratio: ratio ?? "16:9",
      duration: duration ?? 5,
      resolution: resolution ?? "720p",
      generateAudio: generateAudio !== false,
      images: kieImages,
      videos: kieVideos,
      audios: kieAudios,
      startImageUrl: kieStart,
      endImageUrl: kieEnd,
      nsfwChecker: false,
      apiKey,
    });

    onTaskCreated?.(taskId, "kie-seedance-2");

    try {
      return await waitForKieSeedanceVideo(taskId, apiKey, onProgress);
    } catch (err: any) {
      err._taskAlreadyCreated = true;
      throw err;
    }
  } else {
    // t8star legacy
    const apiKey = process.env.T8STAR_API_KEY ?? "";
    const seedance2Model = modelId === "seedance-2-fast" ? SEEDANCE2_FAST_MODEL : SEEDANCE2_MODEL;

    const { taskId } = await createSeedance2Task({
      prompt,
      model: seedance2Model,
      ratio: ratio ?? "16:9",
      duration: duration ?? 5,
      resolution: resolution ?? "720p",
      generateAudio: generateAudio !== false,
      images,
      videos,
      audios,
      startImageUrl,
      endImageUrl,
      apiKey,
    });

    onTaskCreated?.(taskId, "seedance-2");

    try {
      return await waitForSeedanceVideo(taskId, apiKey, onProgress);
    } catch (err: any) {
      err._taskAlreadyCreated = true;
      throw err;
    }
  }
}
