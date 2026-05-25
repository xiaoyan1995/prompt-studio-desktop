import { readFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const UPLOAD_DIR = join(process.cwd(), "data", "uploads");

// ── S3 helper: upload local files to public S3 so external APIs (KIE) can access them ──
let _s3Client: S3Client | null = null;
export function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "",
      },
      forcePathStyle: true,
    });
  }
  return _s3Client;
}

// ── Cloudflare R2 (v3) client ──
let _r2Client: S3Client | null = null;
export function getR2Client(): S3Client {
  if (!_r2Client) {
    _r2Client = new S3Client({
      endpoint: process.env.R2_ENDPOINT,
      region: "auto",
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY ?? "",
        secretAccessKey: process.env.R2_SECRET_KEY ?? "",
      },
    });
  }
  return _r2Client;
}

export function isR2Configured(): boolean {
  return !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY && process.env.R2_SECRET_KEY && process.env.R2_PUBLIC_URL);
}

export function isS3Configured(): boolean {
  return !!(process.env.S3_ENDPOINT && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);
}

/**
 * If a URL is localhost (not reachable externally), upload the file to S3 and return a public URL.
 * xinyuai.app/s3/... URLs are already publicly accessible via nginx proxy → MinIO, return as-is.
 */
export async function ensurePublicUrl(url: string): Promise<string> {
  if (!url) return url;

  const resolved = resolveImageToPublicUrl(url);

  // If not localhost, it's already publicly accessible (including xinyuai.app/s3/... URLs)
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(resolved)) {
    return resolved;
  }

  if (!isS3Configured()) {
    throw new Error("检测到您正在使用本地参考图。由于外部 AI 绘图模型部署在云端公网，无法直接读取您的电脑本地文件，所以必须在配置文件中配置公网可访问的 S3 对象存储（S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY）以便上传托管，或者请直接在提示词里引用公网图片链接。");
  }

  // Extract local file path from /api/files/... URL
  const filesMatch = resolved.match(/\/api\/files\/(.+)$/);
  if (!filesMatch) return resolved;

  const relativePath = decodeURIComponent(filesMatch[1]);
  const filePath = join(UPLOAD_DIR, relativePath);

  const buffer = await readFile(filePath);
  const ext = relativePath.split(".").pop()?.toLowerCase() ?? "png";
  const contentType = ext === "mp4" ? "video/mp4" : ext === "mp3" ? "audio/mpeg" : ext === "webm" ? "video/webm"
    : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "application/octet-stream";

  const bucket = process.env.S3_BUCKET_UPLOADS ?? "user-uploads";
  const key = `kie-temp/${randomUUID()}.${ext}`;

  await getS3Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  const publicBase = process.env.S3_PUBLIC_BASE_URL ?? process.env.S3_ENDPOINT ?? "";
  const publicUrl = `${publicBase}/${bucket}/${key}`;
  console.log("[s3-upload] localhost file → public URL: %s → %s", relativePath, publicUrl);
  return publicUrl;
}

/**
 * Like ensurePublicUrl, but returns a presigned MinIO URL (direct download, bypasses CDN/proxy).
 * Use for providers whose servers cannot download from xinyuai.app (e.g. OpenCrow).
 */
export async function ensurePresignedUrl(url: string): Promise<string> {
  if (!url) return url;

  const resolved = resolveImageToPublicUrl(url);

  // Already an xinyuai.app/s3 URL → extract bucket/key and presign from MinIO
  const s3ProxyMatch = resolved.match(/xinyuai\.app\/s3\/([^/]+)\/(.+)$/);
  if (s3ProxyMatch) {
    const bucket = decodeURIComponent(s3ProxyMatch[1]);
    const key = decodeURIComponent(s3ProxyMatch[2]);
    return getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
  }

  // Localhost → upload to S3 then presign
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(resolved)) {
    const filesMatch = resolved.match(/\/api\/files\/(.+)$/);
    if (!filesMatch) return resolved;

    const relativePath = decodeURIComponent(filesMatch[1]);
    const filePath = join(UPLOAD_DIR, relativePath);
    const buffer = await readFile(filePath);
    const ext = relativePath.split(".").pop()?.toLowerCase() ?? "png";
    const contentType = ext === "mp4" ? "video/mp4" : ext === "mp3" ? "audio/mpeg" : ext === "webm" ? "video/webm"
      : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "application/octet-stream";

    const bucket = process.env.S3_BUCKET_UPLOADS ?? "user-uploads";
    const key = `kie-temp/${randomUUID()}.${ext}`;

    await getS3Client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType }));

    const presigned = await getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
    console.log("[s3-upload] localhost file → presigned URL: %s → %s", relativePath, presigned.slice(0, 120));
    return presigned;
  }

  // External URL (non-localhost, non-xinyuai) → return as-is
  return resolved;
}
const T8STAR_BASE_URL = "https://ai.t8star.cn";
const BYTEPLUS_BASE_URL = "https://ark.ap-southeast.bytepluses.com";

export const SEEDANCE_MODEL = "doubao-seedance-1-5-pro-251215";
export const SEEDANCE2_MODEL = "doubao-seedance-2-0-260128";
export const SEEDANCE2_FAST_MODEL = "doubao-seedance-2-0-fast-260128";

export const SEEDANCE_VALID_RATIOS = new Set([
  "16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive",
]);
export const SEEDANCE_VALID_DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12];
export const SEEDANCE_VALID_RESOLUTIONS = new Set(["480p", "720p", "1080p"]);

export const SEEDANCE2_VALID_RATIOS = new Set([
  "16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "9:21", "adaptive",
]);
export const SEEDANCE2_VALID_DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const SEEDANCE2_VALID_RESOLUTIONS = new Set(["480p", "720p", "1080p", "native1080p"]);

export interface SeedanceCreateParams {
  prompt: string;
  ratio?: string;
  duration?: number;
  resolution?: string;
  generateAudio?: boolean;
  startImageUrl?: string;
  endImageUrl?: string;
  apiKey: string;
}

export interface SeedanceTaskResult {
  taskId: string;
  status: string;
}

export interface SeedanceVideoResult {
  videoUrl: string;
  status: string;
  errorMessage?: string;
  errorCode?: string;
}

async function resolveImageForSeedance(url: string): Promise<string> {
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

export async function createSeedanceTask(params: SeedanceCreateParams): Promise<SeedanceTaskResult> {
  const {
    prompt,
    ratio = "16:9",
    duration = 5,
    resolution = "720p",
    generateAudio = true,
    startImageUrl,
    endImageUrl,
    apiKey,
  } = params;

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: prompt },
  ];

  if (startImageUrl) {
    const resolved = await resolveImageForSeedance(startImageUrl);
    content.push({ type: "image_url", image_url: { url: resolved }, role: "first_frame" });
  }
  if (endImageUrl) {
    const resolvedEnd = await resolveImageForSeedance(endImageUrl);
    content.push({ type: "image_url", image_url: { url: resolvedEnd }, role: "last_frame" });
  }

  const effectiveRatio = startImageUrl && (!ratio || ratio === "auto") ? "adaptive"
    : SEEDANCE_VALID_RATIOS.has(ratio) ? ratio : "16:9";

  const body: Record<string, unknown> = {
    model: SEEDANCE_MODEL,
    content,
    ratio: effectiveRatio,
    duration: SEEDANCE_VALID_DURATIONS.includes(duration) ? duration : 5,
    resolution: SEEDANCE_VALID_RESOLUTIONS.has(resolution) ? resolution : "720p",
    generate_audio: generateAudio,
  };

  console.log("[seedance] creating task model=%s ratio=%s dur=%d res=%s audio=%s i2v=%s",
    SEEDANCE_MODEL, body.ratio, body.duration, body.resolution, body.generate_audio, !!startImageUrl);

  const res = await fetch(`${T8STAR_BASE_URL}/seedance/v3/contents/generations/tasks`, {
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
    throw new Error(`Seedance create task failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const taskId = data.id ?? data.data?.task_id ?? data.data?.id;
  const status = data.status ?? data.data?.status ?? "queued";

  if (!taskId) {
    throw new Error(`Seedance create task: no task_id in response: ${JSON.stringify(data).slice(0, 500)}`);
  }

  console.log("[seedance] task created id=%s status=%s", taskId, status);
  return { taskId, status };
}

export async function pollSeedanceTask(taskId: string, apiKey: string, baseUrl?: string): Promise<SeedanceVideoResult> {
  const base = baseUrl ?? T8STAR_BASE_URL;
  const pathPrefix = base === BYTEPLUS_BASE_URL ? "/api" : "/seedance";
  const res = await fetch(`${base}${pathPrefix}/v3/contents/generations/tasks/${taskId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Seedance poll failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const rawStatus = data.status ?? "unknown";
  const status = rawStatus.toLowerCase();
  const videoUrl = data.content?.video_url ?? data.data?.video_url ?? data.video_url ?? "";
  const errorMessage = data.error?.message ?? data.error_message ?? "";
  const errorCode = data.error?.code ?? "";

  if (status !== "running" && status !== "submitted" && status !== "queued") {
    console.log("[seedance] poll task=%s terminal status=%s raw=%j", taskId, status, JSON.stringify(data).slice(0, 500));
  }

  return { videoUrl, status, errorMessage, errorCode };
}

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 360; // 60 minutes (Seedance 2.0 can take 30+ min for complex refs)

const MAX_CONSECUTIVE_POLL_ERRORS = 10;

export async function waitForSeedanceVideo(
  taskId: string,
  apiKey: string,
  onProgress?: (status: string, attempt: number) => void,
  baseUrl?: string,
): Promise<string> {
  let consecutiveErrors = 0;
  let lastErrorMsg = "";
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const { videoUrl, status, errorMessage, errorCode } = await pollSeedanceTask(taskId, apiKey, baseUrl);
      consecutiveErrors = 0;

      onProgress?.(status, attempt);

      if (status === "succeeded" || status === "completed" || status === "success") {
        if (!videoUrl) throw new Error("Seedance task succeeded but no video_url");
        console.log("[seedance] task=%s succeeded url=%s (attempt %d)", taskId, videoUrl.slice(0, 80), attempt);
        return videoUrl;
      }

      if (status === "failed" || status === "error") {
        const detail = errorMessage || errorCode || "unknown error";
        throw new Error(`Seedance task failed: ${detail}`);
      }

      if (status === "expired" || status === "cancelled") {
        throw new Error(`Seedance task ${taskId} ${status}`);
      }
    } catch (err: any) {
      if (err.message?.includes("task failed") || err.message?.includes("task succeeded") ||
          err.message?.includes("expired") || err.message?.includes("cancelled")) throw err;
      lastErrorMsg = err.message ?? "Unknown error";
      consecutiveErrors++;
      console.log("[seedance] poll task=%s attempt=%d error=%s consecutive_errors=%d", taskId, attempt, lastErrorMsg.slice(0, 200), consecutiveErrors);
      if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        throw new Error(`Seedance task poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg.slice(0, 500)})`);
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Seedance task ${taskId} timed out after ${MAX_POLL_ATTEMPTS} attempts`);
}

// ── T8Star asset upload (compliance verification) ──

export type AssetType = "Image" | "Video" | "Audio";

export interface AssetCreateResult {
  assetId: string;
  status: string;
}

export async function uploadSeedanceAsset(
  url: string,
  assetType: AssetType,
  apiKey: string,
): Promise<AssetCreateResult> {
  const res = await fetch(`${T8STAR_BASE_URL}/seedance/v3/assets/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ url, assetType }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Asset upload failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const assetId = data.data?.assetId ?? data.assetId;
  const status = data.data?.status ?? data.status ?? "Processing";

  if (!assetId) {
    throw new Error(`Asset upload: no assetId in response: ${JSON.stringify(data).slice(0, 500)}`);
  }

  console.log("[t8star-asset] uploaded assetId=%s status=%s type=%s", assetId, status, assetType);
  return { assetId, status };
}

const ASSET_POLL_INTERVAL_MS = 3_000;
const MAX_ASSET_POLL_ATTEMPTS = 40; // ~2 min max

export async function pollSeedanceAssetStatus(assetId: string, apiKey: string): Promise<{ status: string; reason: string; raw: unknown }> {
  const res = await fetch(`${T8STAR_BASE_URL}/seedance/v3/assets/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ assetId }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Asset query failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const inner = data.data ?? data;
  return {
    status: inner.status ?? "unknown",
    reason: inner.reason ?? inner.message ?? inner.rejectReason ?? inner.reject_reason ?? "",
    raw: inner,
  };
}

export async function waitForAssetActive(assetId: string, apiKey: string): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ASSET_POLL_ATTEMPTS; attempt++) {
    const result = await pollSeedanceAssetStatus(assetId, apiKey);
    console.log("[t8star-asset] asset=%s poll #%d status=%s reason=%s raw=%j", assetId, attempt, result.status, result.reason, result.raw);

    if (result.status === "Active") return;
    if (result.status === "Failed" || result.status === "Error" || result.status === "Rejected") {
      const detail = result.reason ? `: ${result.reason}` : "";
      throw new Error(`Asset ${assetId} compliance check ${result.status}${detail}`);
    }

    await new Promise((r) => setTimeout(r, ASSET_POLL_INTERVAL_MS));
  }

  throw new Error(`Asset ${assetId} timed out waiting for Active after ${MAX_ASSET_POLL_ATTEMPTS} attempts`);
}

/**
 * Convert a local /api/files/... path to a publicly accessible URL.
 * HTTP(S) URLs are returned as-is.
 */
function resolveImageToPublicUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/api/files/")) {
    const baseUrl = (process.env.NEXTAUTH_URL || process.env.AUTH_URL || "").replace(/\/$/, "");
    if (!baseUrl) throw new Error("NEXTAUTH_URL / AUTH_URL not configured, cannot resolve local file to public URL");
    return `${baseUrl}${url}`;
  }
  return url;
}

/**
 * Upload an image via T8Star asset API and return an asset:// reference.
 * Plan A: all Seedance 2.0 images go through asset upload for compliance verification.
 */
async function resolveImageToAssetRef(url: string, apiKey: string): Promise<string> {
  const publicUrl = resolveImageToPublicUrl(url);
  const { assetId, status } = await uploadSeedanceAsset(publicUrl, "Image", apiKey);

  if (status !== "Active") {
    await waitForAssetActive(assetId, apiKey);
  }

  return `asset://${assetId}`;
}

/**
 * Upload a video via T8Star asset API and return an asset:// reference.
 */
async function resolveVideoToAssetRef(url: string, apiKey: string): Promise<string> {
  const publicUrl = resolveImageToPublicUrl(url);
  const { assetId, status } = await uploadSeedanceAsset(publicUrl, "Video", apiKey);

  if (status !== "Active") {
    await waitForAssetActive(assetId, apiKey);
  }

  return `asset://${assetId}`;
}

/**
 * Upload an audio via T8Star asset API and return an asset:// reference.
 */
async function resolveAudioToAssetRef(url: string, apiKey: string): Promise<string> {
  const publicUrl = resolveImageToPublicUrl(url);
  const { assetId, status } = await uploadSeedanceAsset(publicUrl, "Audio", apiKey);

  if (status !== "Active") {
    await waitForAssetActive(assetId, apiKey);
  }

  return `asset://${assetId}`;
}

// ── Seedance 2.0 / 2.0 Fast via T8Star v3 Seedance API (multimodal content) ──

export interface Seedance2CreateParams {
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
  apiKey: string;
  /** sd-global: skip asset upload, pass raw URLs directly (no asset:// refs) */
  skipAssetUpload?: boolean;
}

export async function createSeedance2Task(params: Seedance2CreateParams): Promise<SeedanceTaskResult> {
  const {
    prompt,
    model = SEEDANCE2_MODEL,
    ratio = "16:9",
    duration = 5,
    resolution = "720p",
    generateAudio = true,
    images,
    videos,
    audios,
    startImageUrl,
    endImageUrl,
    apiKey,
  } = params;

  const hasImages = Array.isArray(images) && images.length > 0;
  const hasVideos = Array.isArray(videos) && videos.length > 0;
  const hasAudios = Array.isArray(audios) && audios.length > 0;
  const hasRefs = hasImages || hasVideos || hasAudios || !!startImageUrl;

  const effectiveRatio = hasRefs && (!ratio || ratio === "auto") ? "adaptive"
    : SEEDANCE2_VALID_RATIOS.has(ratio) ? ratio : "16:9";

  // Build multimodal content array (text + image_url / video_url items, NO role field)
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: prompt },
  ];

  const useAssets = !params.skipAssetUpload;

  // Start/end frame mode: images with role: first_frame / last_frame
  if (startImageUrl) {
    const ref = useAssets ? await resolveImageToAssetRef(startImageUrl, apiKey) : resolveImageToPublicUrl(startImageUrl);
    content.push({ type: "image_url", image_url: { url: ref }, role: "first_frame" });
  }
  if (endImageUrl) {
    const ref = useAssets ? await resolveImageToAssetRef(endImageUrl, apiKey) : resolveImageToPublicUrl(endImageUrl);
    content.push({ type: "image_url", image_url: { url: ref }, role: "last_frame" });
  }

  // Images (multimodal reference, NOT first-frame)
  if (hasImages) {
    for (const img of images!) {
      const ref = useAssets ? await resolveImageToAssetRef(img, apiKey) : resolveImageToPublicUrl(img);
      content.push({ type: "image_url", image_url: { url: ref } });
    }
  }

  // Videos
  if (hasVideos) {
    for (const vid of videos!) {
      const ref = useAssets ? await resolveVideoToAssetRef(vid, apiKey) : resolveImageToPublicUrl(vid);
      content.push({ type: "video_url", video_url: { url: ref } });
    }
  }

  // Audios
  if (hasAudios) {
    for (const aud of audios!) {
      const ref = useAssets ? await resolveAudioToAssetRef(aud, apiKey) : resolveImageToPublicUrl(aud);
      content.push({ type: "audio_url", audio_url: { url: ref } });
    }
  }

  const body: Record<string, unknown> = {
    model,
    content,
    duration: SEEDANCE2_VALID_DURATIONS.includes(duration) ? duration : 5,
    resolution: resolution === "1080p" ? "native1080p" : (SEEDANCE2_VALID_RESOLUTIONS.has(resolution) ? resolution : "720p"),
    ratio: effectiveRatio,
    generate_audio: generateAudio,
    watermark: false,
  };

  console.log("[seedance-2] creating task model=%s ratio=%s dur=%d res=%s audio=%s contentItems=%d via=v3-content",
    model, body.ratio, body.duration, body.resolution, body.generate_audio, content.length);

  const res = await fetch(`${T8STAR_BASE_URL}/seedance/v3/contents/generations/tasks`, {
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
    throw new Error(`Seedance 2.0 create task failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const taskId = data.id ?? data.data?.task_id ?? data.data?.id;
  const status = data.status ?? data.data?.status ?? "queued";

  if (!taskId) {
    throw new Error(`Seedance 2.0 create task: no task_id in response: ${JSON.stringify(data).slice(0, 500)}`);
  }

  console.log("[seedance-2] task created id=%s status=%s", taskId, status);
  return { taskId, status };
}

// ── KIE.ai Seedance 2.0 / 2.0 Fast adapter ──
// No compliance / asset upload needed. Supports real faces & nsfw_checker toggle.

const KIE_BASE_URL = "https://api.kie.ai";

export interface KieSeedanceCreateParams {
  prompt: string;
  model?: "bytedance/seedance-2" | "bytedance/seedance-2-fast";
  ratio?: string;
  duration?: number;
  resolution?: string;
  generateAudio?: boolean;
  startImageUrl?: string;
  endImageUrl?: string;
  images?: string[];
  videos?: string[];
  audios?: string[];
  nsfwChecker?: boolean;
  apiKey: string;
}

/**
 * Download a file (from our S3 or external URL) and upload to KIE's storage.
 * KIE servers can't download from external URLs (TLS/timeout issues).
 */
async function resolveUrlForKie(url: string): Promise<string> {
  const { uploadToKieStorage } = await import("./t8star-image");
  const resolved = await ensurePublicUrl(url);
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
    console.log("[kie] ref → kie storage: %s", kieUrl.slice(0, 100));
    return kieUrl;
  } catch (err: any) {
    console.warn("[kie] upload to KIE storage failed, using original URL:", err?.message);
    return resolved;
  }
}

export async function createKieSeedanceTask(params: KieSeedanceCreateParams): Promise<SeedanceTaskResult> {
  const {
    prompt,
    model = "bytedance/seedance-2",
    ratio = "16:9",
    duration = 5,
    resolution = "720p",
    generateAudio = true,
    startImageUrl,
    endImageUrl,
    images,
    videos,
    audios,
    nsfwChecker = false,
    apiKey,
  } = params;

  const hasStartEnd = !!startImageUrl || !!endImageUrl;
  const hasImages = Array.isArray(images) && images.length > 0;
  const hasVideos = Array.isArray(videos) && videos.length > 0;
  const hasAudios = Array.isArray(audios) && audios.length > 0;

  // KIE Either-Or rule: first_frame_url/last_frame_url OR reference_image_urls, not both
  const input: Record<string, unknown> = {
    prompt,
    resolution: SEEDANCE2_VALID_RESOLUTIONS.has(resolution) ? resolution : "720p",
    aspect_ratio: SEEDANCE2_VALID_RATIOS.has(ratio) ? ratio : "16:9",
    duration: SEEDANCE2_VALID_DURATIONS.includes(duration) ? duration : 5,
    generate_audio: generateAudio,
    nsfw_checker: nsfwChecker,
    return_last_frame: false,
    web_search: false,
  };

  if (hasStartEnd) {
    // Start/end frame mode
    if (startImageUrl) input.first_frame_url = await resolveUrlForKie(startImageUrl);
    if (endImageUrl) input.last_frame_url = await resolveUrlForKie(endImageUrl);
  } else if (hasImages) {
    // Multimodal reference mode
    input.reference_image_urls = await Promise.all(images!.map((img) => resolveUrlForKie(img)));
  }

  if (hasVideos) {
    input.reference_video_urls = await Promise.all(videos!.map((vid) => resolveUrlForKie(vid)));
  }
  if (hasAudios) {
    input.reference_audio_urls = await Promise.all(audios!.map((aud) => resolveUrlForKie(aud)));
  }

  const body = { model, input };

  console.log("[kie-seedance] creating task model=%s ratio=%s dur=%d res=%s audio=%s nsfw_checker=%s startEnd=%s images=%d videos=%d",
    model, input.aspect_ratio, input.duration, input.resolution, input.generate_audio, input.nsfw_checker, hasStartEnd, hasImages ? (images?.length ?? 0) : 0, hasVideos ? (videos?.length ?? 0) : 0);

  const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
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
    throw new Error(`KIE Seedance create task failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const taskId = data.data?.taskId ?? data.data?.recordId;

  if (!taskId) {
    throw new Error(`KIE Seedance create task: no taskId in response: ${JSON.stringify(data).slice(0, 500)}`);
  }

  console.log("[kie-seedance] task created id=%s", taskId);
  return { taskId, status: "waiting" };
}

export async function pollKieSeedanceTask(taskId: string, apiKey: string): Promise<SeedanceVideoResult> {
  const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`KIE Seedance poll failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const record = data.data ?? {};
  const rawState = (record.state ?? "unknown").toLowerCase();

  // Parse resultJson for video URL
  let videoUrl = "";
  if (record.resultJson) {
    try {
      const result = typeof record.resultJson === "string" ? JSON.parse(record.resultJson) : record.resultJson;
      const urls = result.resultUrls ?? result.result_urls ?? [];
      videoUrl = Array.isArray(urls) && urls.length > 0 ? urls[0] : (result.video_url ?? "");
    } catch {
      console.warn("[kie-seedance] failed to parse resultJson:", record.resultJson);
    }
  }

  // Map KIE states to our standard states
  // IMPORTANT: Only explicitly recognized "running" states continue polling.
  // Any unrecognized state is treated as "failed" to prevent infinite polling.
  let status: string;
  if (rawState === "success" || rawState === "succeeded" || rawState === "completed") {
    status = "succeeded";
  } else if (rawState === "waiting" || rawState === "running" || rawState === "processing" || rawState === "queued" || rawState === "pending") {
    status = "running";
  } else {
    // Any other state (fail, failed, failure, error, cancelled, timeout, rejected, unknown, etc.)
    status = "failed";
  }

  const errorMessage = record.failMsg ?? "";
  const errorCode = record.failCode ?? "";

  if (status !== "running") {
    console.log("[kie-seedance] poll task=%s state=%s videoUrl=%s", taskId, status, videoUrl ? videoUrl.slice(0, 80) : "(none)");
  }

  return { videoUrl, status, errorMessage, errorCode };
}

export async function waitForKieSeedanceVideo(
  taskId: string,
  apiKey: string,
  onProgress?: (status: string, attempt: number) => void,
): Promise<string> {
  let consecutiveErrors = 0;
  let lastErrorMsg = "";

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const { videoUrl, status, errorMessage, errorCode } = await pollKieSeedanceTask(taskId, apiKey);
      consecutiveErrors = 0;

      onProgress?.(status, attempt);

      if (status === "succeeded") {
        if (!videoUrl) throw new Error("KIE Seedance task succeeded but no video URL in resultJson");
        console.log("[kie-seedance] task=%s succeeded url=%s (attempt %d)", taskId, videoUrl.slice(0, 80), attempt);
        return videoUrl;
      }

      if (status === "failed") {
        const detail = errorMessage || errorCode || "unknown error";
        throw new Error(`KIE Seedance task failed: ${detail}`);
      }
    } catch (err: any) {
      if (err.message?.includes("task failed") || err.message?.includes("task succeeded")) throw err;
      lastErrorMsg = err.message ?? "Unknown error";
      consecutiveErrors++;
      console.log("[kie-seedance] poll task=%s attempt=%d error=%s consecutive_errors=%d", taskId, attempt, lastErrorMsg.slice(0, 200), consecutiveErrors);
      if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        throw new Error(`KIE Seedance task poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg.slice(0, 500)})`);
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`KIE Seedance task ${taskId} timed out after ${MAX_POLL_ATTEMPTS} attempts`);
}

/** Check if KIE.ai should be used for Seedance 2.0 */
export function useKieForSeedance2(): boolean {
  return !!(process.env.KIE_API_KEY);
}

// ── OpenCrow Seedance 2.0: re-exported from opencrow-video.ts ──
export {
  useOpenCrowForSeedance2,
  createOpenCrowSeedanceTask,
  pollOpenCrowSeedanceTask,
  waitForOpenCrowSeedanceVideo,
  callSeedance2WithFallback,
  type OpenCrowSeedanceCreateParams,
  type Seedance2Provider,
  type Seedance2WithFallbackParams,
} from "./opencrow-video";
