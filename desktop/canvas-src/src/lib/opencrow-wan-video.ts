/**
 * OpenCrow WAN 2.7 video generation adapter.
 *
 * Provider: OpenCrow only (no fallback).
 * Base URL: https://api.router.ai
 * Models: wan2.7-t2v, wan2.7-i2v, wan2.7-r2v
 */
import { ensurePublicUrl } from "./t8star-video";

// ── Constants ──

const OPENCROW_WAN_BASE_URL = "https://api.router.ai";
const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 240; // 40 min
const MAX_CONSECUTIVE_POLL_ERRORS = 10;

// ── Types ──

export interface OpenCrowWanVideoParams {
  prompt: string;
  durationS: number;
  resolution: string; // "720p" | "1080p"
  aspectRatio: string; // "16:9" | "9:16" | "1:1" | "4:3" | "3:4"
  /** First frame image URL (I2V mode) */
  startImageUrl?: string;
  /** Reference image URLs (R2V mode) */
  referenceImages?: string[];
  /** Reference video URLs (R2V mode) */
  referenceVideos?: string[];
  /** Callback to persist task ID for recovery */
  onTaskCreated?: (taskId: string, provider: string) => void;
  onProgress?: (status: string, attempt: number) => void;
}

export interface WanVideoTaskResult {
  taskId: string;
  status: string;
}

export interface WanVideoPollResult {
  videoUrl: string;
  status: string;
  errorMessage: string;
}

// ── Helpers ──

function parseOpenCrowWanError(status: number, raw: string): string {
  try {
    const json = JSON.parse(raw);
    const err = json.error ?? json;
    const type = err.type ?? err.code ?? "";
    const msg = err.message ?? err.detail ?? "";
    if (type) return `[${type}] ${msg}`.trim();
    if (msg) return msg;
  } catch { /* not JSON */ }
  return raw.slice(0, 2000);
}

/** Map our resolution ("720p") to WAN 2.7 parameters.resolution format ("720P") */
function toWanResolution(res: string): string {
  if (res === "1080p") return "1080P";
  return "720P";
}

/**
 * Determine which WAN 2.7 model to use based on references:
 * - No refs → wan2.7-t2v
 * - Start image (first frame) → wan2.7-i2v
 * - Reference images/videos → wan2.7-r2v
 */
function determineWanModel(params: OpenCrowWanVideoParams): string {
  const hasRefImages = Array.isArray(params.referenceImages) && params.referenceImages.length > 0;
  const hasRefVideos = Array.isArray(params.referenceVideos) && params.referenceVideos.length > 0;

  if (hasRefImages || hasRefVideos) return "wan2.7-r2v";
  if (params.startImageUrl) return "wan2.7-i2v";
  return "wan2.7-t2v";
}

// ── API Functions ──

export async function createOpenCrowWanVideoTask(params: OpenCrowWanVideoParams): Promise<WanVideoTaskResult> {
  const apiKey = process.env.OPENCROW_API_KEY ?? "";
  if (!apiKey) throw new Error("OPENCROW_API_KEY not configured for WAN video");

  const {
    prompt,
    durationS,
    resolution,
    aspectRatio,
    startImageUrl,
    referenceImages,
    referenceVideos,
  } = params;

  const model = determineWanModel(params);
  const effectiveRatio = (!aspectRatio || aspectRatio === "auto") ? "16:9" : aspectRatio;
  const dur = durationS || 5;

  // Build input object (WAN 2.7 protocol)
  const input: Record<string, unknown> = { prompt };

  if (model === "wan2.7-i2v") {
    // I2V: first frame in media array
    const url = await ensurePublicUrl(startImageUrl!);
    input.media = [{ type: "first_frame", url }];
  } else if (model === "wan2.7-r2v") {
    // R2V: reference images + videos in media array
    const media: Array<{ type: string; url: string }> = [];

    if (Array.isArray(referenceImages)) {
      for (const img of referenceImages) {
        if (img) {
          const url = await ensurePublicUrl(img);
          media.push({ type: "reference_image", url });
        }
      }
    }

    if (Array.isArray(referenceVideos)) {
      for (const vid of referenceVideos) {
        if (vid) {
          const url = await ensurePublicUrl(vid);
          media.push({ type: "reference_video", url });
        }
      }
    }

    if (media.length > 0) input.media = media;
  }
  // T2V: just prompt, no media

  // Build parameters object (WAN 2.7 protocol)
  const parameters: Record<string, unknown> = {
    resolution: toWanResolution(resolution),
    duration: dur,
    prompt_extend: true,
    watermark: false,
  };

  // Only include ratio for T2V and R2V (I2V aspect is determined by first_frame)
  if (model !== "wan2.7-i2v") {
    parameters.ratio = effectiveRatio;
  }

  // Build full request body
  const body: Record<string, unknown> = {
    model,
    duration: dur,
    resolution: resolution || "720p",
    aspect_ratio: effectiveRatio,
    input,
    parameters,
  };

  console.log("[opencrow-wan-video] creating task model=%s ratio=%s dur=%d res=%s",
    model, effectiveRatio, dur, resolution);

  const res = await fetch(`${OPENCROW_WAN_BASE_URL}/v1/videos/generations`, {
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
    const parsed = parseOpenCrowWanError(res.status, errText);
    console.error("[opencrow-wan-video] create task failed (%d): %s", res.status, parsed.slice(0, 500));
    throw new Error(`OpenCrow WAN video create failed (${res.status}): ${parsed}`);
  }

  const data = await res.json();
  const taskId = data.id ?? data.task_id ?? data.data?.id ?? data.data?.task_id;
  const status = data.status ?? "submitted";

  if (!taskId) {
    throw new Error(`OpenCrow WAN video: no task id in response: ${JSON.stringify(data).slice(0, 500)}`);
  }

  console.log("[opencrow-wan-video] task created id=%s status=%s model=%s", taskId, status, model);
  return { taskId, status };
}

export async function pollOpenCrowWanVideoTask(taskId: string): Promise<WanVideoPollResult> {
  const apiKey = process.env.OPENCROW_API_KEY ?? "";
  if (!apiKey) throw new Error("OPENCROW_API_KEY not configured");

  const res = await fetch(`${OPENCROW_WAN_BASE_URL}/v1/videos/generations/${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    const parsed = parseOpenCrowWanError(res.status, errText);
    throw new Error(`OpenCrow WAN video poll failed (${res.status}): ${parsed}`);
  }

  const data = await res.json();
  const rawStatus = (data.status ?? "unknown").toLowerCase();
  const videoUrl = data.content?.video_url ?? data.video_url ?? data.output?.video_url ?? data.data?.video_url ?? "";
  const errorType = data.error?.type ?? data.error?.code ?? "";
  const errorMsg = data.error?.message ?? data.error_message ?? "";
  const errorMessage = errorType ? `[${errorType}] ${errorMsg}`.trim() : errorMsg;

  if (rawStatus !== "running" && rawStatus !== "queued" && rawStatus !== "processing" && rawStatus !== "submitted") {
    console.log("[opencrow-wan-video] poll task=%s status=%s raw=%j", taskId, rawStatus, JSON.stringify(data).slice(0, 500));
  }

  return { videoUrl, status: rawStatus, errorMessage };
}

export async function waitForOpenCrowWanVideo(
  taskId: string,
  onProgress?: (status: string, attempt: number) => void,
): Promise<string> {
  let consecutiveErrors = 0;
  let lastErrorMsg = "";

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const { videoUrl, status, errorMessage } = await pollOpenCrowWanVideoTask(taskId);
      consecutiveErrors = 0;

      onProgress?.(status, attempt);

      if (status === "succeeded" || status === "completed" || status === "success") {
        if (!videoUrl) throw new Error("OpenCrow WAN video task succeeded but no video URL");
        console.log("[opencrow-wan-video] task=%s succeeded url=%s (attempt %d)", taskId, videoUrl.slice(0, 80), attempt);
        return videoUrl;
      }

      if (status === "failed" || status === "error") {
        const detail = errorMessage || "unknown error";
        console.error("[opencrow-wan-video] task=%s FAILED: %s", taskId, detail.slice(0, 500));
        throw new Error(`OpenCrow WAN video task failed: ${detail}`);
      }

      if (status === "expired" || status === "cancelled") {
        throw new Error(`OpenCrow WAN video task ${taskId} ${status}`);
      }
    } catch (err: any) {
      if (err.message?.includes("task failed") || err.message?.includes("task succeeded") ||
          err.message?.includes("expired") || err.message?.includes("cancelled")) throw err;
      lastErrorMsg = err.message ?? "Unknown error";
      consecutiveErrors++;
      console.log("[opencrow-wan-video] poll task=%s attempt=%d error=%s consecutive_errors=%d", taskId, attempt, lastErrorMsg.slice(0, 200), consecutiveErrors);
      if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        throw new Error(`OpenCrow WAN video poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg.slice(0, 500)})`);
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`OpenCrow WAN video task ${taskId} timed out after ${MAX_POLL_ATTEMPTS} attempts`);
}

/**
 * Main entry point for WAN 2.7 video generation via OpenCrow.
 * Determines model (t2v/i2v/r2v), creates task, polls until done.
 * Returns the remote video URL.
 */
export async function callOpenCrowWanVideo(params: OpenCrowWanVideoParams): Promise<string> {
  const { taskId } = await createOpenCrowWanVideoTask(params);

  params.onTaskCreated?.(taskId, "opencrow-wan-video");

  return await waitForOpenCrowWanVideo(taskId, params.onProgress);
}
