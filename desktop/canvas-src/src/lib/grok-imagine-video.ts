import { readFile } from "fs/promises";
import { join } from "path";
import { ensurePublicUrl } from "./t8star-video";

const UPLOAD_DIR = join(process.cwd(), "data", "uploads");
const T8STAR_BASE_URL = "https://ai.t8star.cn";
const KIE_BASE_URL = "https://api.kie.ai";

export const GROK_VIDEO_MODEL = "grok-video-3";
export const GROK_VIDEO_MODELS = new Set(["grok-video"]);

export const GROK_VALID_RATIOS = new Set(["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"]);
export const GROK_VALID_DURATIONS = [5, 10, 15];
export const GROK_VALID_RESOLUTIONS = new Set(["480p", "720p", "1080p"]);

export interface GrokVideoResult {
  remoteUrl: string;
  taskId?: string;
  width?: number;
  height?: number;
}

function useKieForGrokVideo(): boolean {
  return !!process.env.KIE_API_KEY;
}

async function resolveImageForGrok(url: string): Promise<string> {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("data:")) return url;
  if (url.startsWith("/api/files/")) {
    const relativePath = url.replace("/api/files/", "");
    const filePath = join(UPLOAD_DIR, relativePath);
    const buffer = await readFile(filePath);
    const ext = relativePath.split(".").pop()?.toLowerCase() ?? "png";
    const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/webp";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }
  return url;
}

export interface GrokVideoCreateParams {
  prompt: string;
  ratio?: string;
  duration?: number;
  resolution?: string;
  images?: string[];
  apiKey: string;
}

// T8Star fallback route (legacy)

export async function createGrokVideoTask(params: GrokVideoCreateParams): Promise<string> {
  const {
    prompt,
    ratio = "16:9",
    duration = 5,
    resolution = "720p",
    images,
    apiKey,
  } = params;

  const effectiveRatio = GROK_VALID_RATIOS.has(ratio) ? ratio : "16:9";
  const effectiveDuration = GROK_VALID_DURATIONS.includes(duration)
    ? duration
    : GROK_VALID_DURATIONS.reduce((a, b) => Math.abs(b - duration) < Math.abs(a - duration) ? b : a);
  const effectiveRes = GROK_VALID_RESOLUTIONS.has(resolution) ? resolution : "720p";

  const resolvedImages: string[] = [];
  if (images && images.length > 0) {
    for (const img of images.slice(0, 7)) {
      resolvedImages.push(await resolveImageForGrok(img));
    }
  }

  const body: Record<string, unknown> = {
    model: GROK_VIDEO_MODEL,
    prompt,
    ratio: effectiveRatio,
    duration: effectiveDuration,
    resolution: effectiveRes,
  };

  if (resolvedImages.length > 0) {
    body.images = resolvedImages;
  }

  console.log("[grok-video] creating task ratio=%s dur=%d res=%s images=%d",
    body.ratio, body.duration, body.resolution, resolvedImages.length);

  const res = await fetch(`${T8STAR_BASE_URL}/v2/videos/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Grok Video create task failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const taskId = data.task_id ?? data.id ?? data.data?.task_id;

  if (!taskId) {
    throw new Error(`Grok Video create task: no task_id in response: ${JSON.stringify(data).slice(0, 500)}`);
  }

  console.log("[grok-video] task created id=%s", taskId);
  return taskId;
}

interface PollResult {
  status: string;
  videoUrl: string;
  progress?: number;
  failReason?: string;
  rawData?: any;
}

async function pollGrokVideoTask(taskId: string, apiKey: string): Promise<PollResult> {
  const res = await fetch(`${T8STAR_BASE_URL}/v2/videos/generations/${taskId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Grok Video poll failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const status = (data.status ?? "unknown").toUpperCase();
  const videoUrl = data.data?.output ?? data.video?.url ?? data.output ?? data.url ?? "";
  const progress = data.progress;
  const failReason = data.fail_reason ?? data.error ?? data.message ?? data.data?.fail_reason;

  return { status, videoUrl, progress, failReason, rawData: data };
}

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 360; // 60 minutes (reverse-proxy can be slow)

const MAX_CONSECUTIVE_POLL_ERRORS = 10;

export async function waitForGrokVideo(
  taskId: string,
  apiKey: string,
  onProgress?: (status: string, attempt: number) => void,
): Promise<string> {
  let consecutiveErrors = 0;
  let lastErrorMsg = "";
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const { status, videoUrl, progress, failReason, rawData } = await pollGrokVideoTask(taskId, apiKey);
      consecutiveErrors = 0;

      onProgress?.(status, attempt);

      if (status === "SUCCESS" || status === "DONE" || status === "SUCCEEDED" || status === "COMPLETED") {
        if (!videoUrl) throw new Error("Grok Video task succeeded but no video URL");
        console.log("[grok-video] task=%s succeeded url=%s (attempt %d)", taskId, videoUrl.slice(0, 80), attempt);
        return videoUrl;
      }

      if (status === "FAILURE" || status === "FAILED" || status === "ERROR") {
        console.error("[grok-video] task=%s FAILED reason=%s raw=%j", taskId, failReason, rawData);
        throw new Error(`Grok Video task ${taskId} failed: ${failReason || "unknown reason"}`);
      }

      if (status === "EXPIRED" || status === "CANCELLED") {
        throw new Error(`Grok Video task ${taskId} ${status.toLowerCase()}`);
      }

      if (attempt % 6 === 0) {
        console.log("[grok-video] task=%s still %s progress=%s (attempt %d)", taskId, status, progress ?? "?", attempt);
      }
    } catch (err: any) {
      if (err.message?.includes("failed:") || err.message?.includes("succeeded but") ||
          err.message?.includes("expired") || err.message?.includes("cancelled")) throw err;
      lastErrorMsg = err.message ?? "Unknown error";
      consecutiveErrors++;
      console.log("[grok-video] poll task=%s attempt=%d error=%s consecutive_errors=%d", taskId, attempt, lastErrorMsg.slice(0, 200), consecutiveErrors);
      if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        throw new Error(`Grok Video task poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg.slice(0, 500)})`);
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Grok Video task ${taskId} timed out after ${MAX_POLL_ATTEMPTS} attempts`);
}

// ═══════════════════════════════════════════════════════════════
// KIE Route for Grok Video
// ═══════════════════════════════════════════════════════════════

async function createKieVideoTask(params: {
  model: string;
  input: Record<string, unknown>;
}): Promise<string> {
  const apiKey = process.env.KIE_API_KEY!;
  const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: params.model, input: params.input }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`KIE Grok Video create task failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const taskId = data.data?.taskId ?? data.data?.recordId;
  if (!taskId) {
    throw new Error(`KIE Grok Video: no taskId in response: ${JSON.stringify(data).slice(0, 500)}`);
  }

  console.log("[kie-grok-video] task created id=%s model=%s", taskId, params.model);
  return taskId;
}

interface KiePollResult {
  status: string;
  videoUrl: string;
  failReason?: string;
}

async function pollKieVideoTask(taskId: string): Promise<KiePollResult> {
  const apiKey = process.env.KIE_API_KEY!;
  const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`KIE Grok Video poll failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const record = data.data ?? {};
  const rawState = (record.state ?? "unknown").toLowerCase();

  let videoUrl = "";
  if (record.resultJson) {
    try {
      const result = typeof record.resultJson === "string" ? JSON.parse(record.resultJson) : record.resultJson;
      const urls = result.resultUrls ?? result.result_urls ?? [];
      if (Array.isArray(urls) && urls.length > 0) videoUrl = urls[0];
      else if (typeof result.video_url === "string") videoUrl = result.video_url;
      else if (typeof result.url === "string") videoUrl = result.url;
    } catch {
      console.warn("[kie-grok-video] failed to parse resultJson:", record.resultJson);
    }
  }

  let status: string;
  if (rawState === "success" || rawState === "succeeded" || rawState === "completed") {
    status = "SUCCEEDED";
  } else if (rawState === "waiting" || rawState === "running" || rawState === "processing" || rawState === "queued" || rawState === "pending") {
    status = "RUNNING";
  } else {
    status = "FAILED";
  }

  const failReason = record.errorMsg ?? record.failReason ?? "";
  return { status, videoUrl, failReason };
}

const KIE_POLL_INTERVAL_MS = 8_000;
const KIE_MAX_POLL_ATTEMPTS = 450; // ~60 minutes
const KIE_MAX_CONSECUTIVE_ERRORS = 10;

async function waitForKieVideoResult(
  taskId: string,
  onProgress?: (status: string, attempt: number) => void,
): Promise<string> {
  let consecutiveErrors = 0;
  let lastErrorMsg = "";
  for (let attempt = 1; attempt <= KIE_MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const { status, videoUrl, failReason } = await pollKieVideoTask(taskId);
      consecutiveErrors = 0;
      onProgress?.(status, attempt);

      if (status === "SUCCESS" || status === "DONE" || status === "SUCCEEDED" || status === "COMPLETED") {
        if (!videoUrl) throw new Error("KIE Grok Video task succeeded but no video URL");
        console.log("[kie-grok-video] task=%s succeeded url=%s (attempt %d)", taskId, videoUrl.slice(0, 80), attempt);
        return videoUrl;
      }

      if (status === "FAILURE" || status === "FAILED" || status === "ERROR") {
        throw new Error(`KIE Grok Video task ${taskId} failed: ${failReason || "unknown reason"}`);
      }

      if (status === "EXPIRED" || status === "CANCELLED") {
        throw new Error(`KIE Grok Video task ${taskId} ${status.toLowerCase()}`);
      }

      if (attempt % 8 === 0) {
        console.log("[kie-grok-video] task=%s still %s (attempt %d)", taskId, status, attempt);
      }
    } catch (err: any) {
      if (err.message?.includes("failed:") || err.message?.includes("succeeded but") ||
          err.message?.includes("expired") || err.message?.includes("cancelled")) throw err;
      lastErrorMsg = err.message ?? "Unknown error";
      consecutiveErrors++;
      if (consecutiveErrors >= KIE_MAX_CONSECUTIVE_ERRORS) {
        throw new Error(`KIE Grok Video poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg.slice(0, 500)})`);
      }
    }
    await new Promise((r) => setTimeout(r, KIE_POLL_INTERVAL_MS));
  }
  throw new Error(`KIE Grok Video task ${taskId} timed out after ${KIE_MAX_POLL_ATTEMPTS} attempts`);
}

/**
 * High-level: create + wait for Grok Video via KIE (T2V or I2V).
 * Returns the video URL and KIE task_id (needed for upscale/extend).
 */
export async function callKieGrokVideo(params: {
  prompt: string;
  ratio?: string;
  duration?: number;
  resolution?: string;
  imageUrls?: string[];
  onProgress?: (status: string, attempt: number) => void;
}): Promise<GrokVideoResult & { taskId: string }> {
  const { prompt, ratio = "16:9", duration = 5, resolution = "720p", imageUrls, onProgress } = params;

  const effectiveRatio = GROK_VALID_RATIOS.has(ratio) ? ratio : "16:9";
  const effectiveDuration = GROK_VALID_DURATIONS.includes(duration)
    ? duration
    : GROK_VALID_DURATIONS.reduce((a, b) => Math.abs(b - duration) < Math.abs(a - duration) ? b : a);
  const effectiveRes = GROK_VALID_RESOLUTIONS.has(resolution) ? resolution : "720p";

  const hasImages = imageUrls && imageUrls.length > 0;
  const model = hasImages ? "grok-imagine/image-to-video" : "grok-imagine/text-to-video";

  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: effectiveRatio,
    duration: String(effectiveDuration),
    resolution: effectiveRes,
    mode: "normal",
  };

  if (hasImages) {
    // Upload ref images to KIE's own storage (KIE can't download from external URLs)
    const { uploadToKieStorage } = await import("./t8star-image");
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getS3Client } = await import("./t8star-video");
    const kieUrls = await Promise.all(imageUrls!.slice(0, 7).map(async (u) => {
      const resolved = await ensurePublicUrl(u);
      try {
        let buf: Buffer;
        let ext = "webp";
        const s3Match = resolved.match(/\/s3\/([^/]+)\/(.+)$/);
        if (s3Match) {
          const bucket = decodeURIComponent(s3Match[1]);
          const key = decodeURIComponent(s3Match[2]);
          ext = key.split(".").pop() ?? "webp";
          const obj = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
          buf = Buffer.from(await obj.Body!.transformToByteArray());
        } else {
          const res = await fetch(resolved, { signal: AbortSignal.timeout(30_000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          buf = Buffer.from(await res.arrayBuffer());
          ext = resolved.split(".").pop()?.split("?")[0] ?? "webp";
        }
        const kieUrl = await uploadToKieStorage(buf, `ref.${ext}`);
        console.log("[kie-grok-video] ref → kie storage: %s", kieUrl.slice(0, 100));
        return kieUrl;
      } catch (err: any) {
        console.warn("[kie-grok-video] KIE upload failed, using original URL:", err?.message);
        return resolved;
      }
    }));
    input.image_urls = kieUrls;
  }

  console.log("[kie-grok-video] creating task model=%s ratio=%s dur=%d res=%s images=%d",
    model, effectiveRatio, effectiveDuration, effectiveRes, hasImages ? imageUrls!.length : 0);

  const taskId = await createKieVideoTask({ model, input });
  const videoUrl = await waitForKieVideoResult(taskId, onProgress);

  return { remoteUrl: videoUrl, taskId };
}

/**
 * Upscale a previously generated Grok Video via KIE.
 * Requires the task_id from the original T2V/I2V generation.
 */
export async function callKieGrokVideoUpscale(params: {
  taskId: string;
  onProgress?: (status: string, attempt: number) => void;
}): Promise<GrokVideoResult & { taskId: string }> {
  const { taskId: sourceTaskId, onProgress } = params;

  console.log("[kie-grok-video] upscale source_task=%s", sourceTaskId);

  const newTaskId = await createKieVideoTask({
    model: "grok-imagine/upscale",
    input: { task_id: sourceTaskId },
  });

  const videoUrl = await waitForKieVideoResult(newTaskId, onProgress);
  return { remoteUrl: videoUrl, taskId: newTaskId };
}

/**
 * Extend a previously generated Grok Video via KIE.
 * Requires the task_id from the original T2V/I2V generation.
 */
export async function callKieGrokVideoExtend(params: {
  taskId: string;
  prompt?: string;
  extendAt?: number;
  extendTimes?: number;
  onProgress?: (status: string, attempt: number) => void;
}): Promise<GrokVideoResult & { taskId: string }> {
  const { taskId: sourceTaskId, prompt = "", extendAt = 0, extendTimes = 6, onProgress } = params;

  console.log("[kie-grok-video] extend source_task=%s at=%d times=%d", sourceTaskId, extendAt, extendTimes);

  const newTaskId = await createKieVideoTask({
    model: "grok-imagine/extend",
    input: {
      task_id: sourceTaskId,
      prompt,
      extend_at: extendAt,
      extend_times: String(extendTimes),
    },
  });

  const videoUrl = await waitForKieVideoResult(newTaskId, onProgress);
  return { remoteUrl: videoUrl, taskId: newTaskId };
}

/**
 * Recovery: resume polling an existing KIE Grok Video task.
 */
export async function recoverKieGrokVideo(
  taskId: string,
  onProgress?: (status: string, attempt: number) => void,
): Promise<string> {
  return waitForKieVideoResult(taskId, onProgress);
}

/** Whether to use KIE for Grok Video generation */
export { useKieForGrokVideo };
