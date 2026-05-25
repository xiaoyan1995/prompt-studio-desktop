import { randomUUID } from "crypto";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { ensurePublicUrl, getS3Client, isS3Configured } from "./t8star-video";

// ── KIE.ai Image Generation (GPT Image 2 + Seedream) ──

const KIE_BASE_URL = "https://api.kie.ai";
const KIE_UPLOAD_URL = "https://kieai.redpandaai.co/api/file-stream-upload";

const KIE_GPT_IMAGE2_T2I_MODEL = "gpt-image-2-text-to-image";
const KIE_GPT_IMAGE2_I2I_MODEL = "gpt-image-2-image-to-image";
const KIE_SUPPORTED_RATIOS = new Set(["1:1", "9:16", "16:9", "4:3", "3:4", "2:3", "3:2", "21:9"]);
const KIE_POLL_INTERVAL_MS = 3_000;
const KIE_MAX_POLL_ATTEMPTS = 400;
const KIE_MAX_CONSECUTIVE_ERRORS = 10;

export interface KieImageResult {
  remoteUrl: string;
  revisedPrompt?: string;
}

// ── Shared Utilities ──

/**
 * Upload a file buffer to KIE's own storage via file-stream-upload API.
 * Returns a KIE-hosted URL that KIE can always download from.
 */
export async function uploadToKieStorage(buf: Buffer, fileName: string): Promise<string> {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error("KIE_API_KEY not set");

  const blob = new Blob([new Uint8Array(buf)]);
  const formData = new FormData();
  formData.append("file", blob, fileName);
  formData.append("uploadPath", "xinyu-refs");

  const res = await fetch(KIE_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`KIE upload failed ${res.status}: ${errText.slice(0, 500)}`);
  }

  const result = await res.json();
  const fileUrl = result.data?.fileUrl ?? result.data?.downloadUrl;
  if (!fileUrl) throw new Error(`No fileUrl/downloadUrl in KIE upload response: ${JSON.stringify(result).slice(0, 500)}`);
  return fileUrl;
}

export async function uploadBlobToPublicUrl(blob: Blob, ext: string = "png"): Promise<string> {
  const isS3 = isS3Configured();
  if (isS3) {
    try {
      const buffer = Buffer.from(await blob.arrayBuffer());
      const bucket = process.env.S3_BUCKET_UPLOADS ?? "user-uploads";
      const key = `kie-temp/${randomUUID()}.${ext}`;
      await getS3Client().send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: blob.type || "image/png",
      }));
      const publicBase = process.env.S3_PUBLIC_BASE_URL ?? process.env.S3_ENDPOINT ?? "";
      const publicUrl = `${publicBase}/${bucket}/${key}`;
      console.log("[s3-upload] blob → public URL: %s", publicUrl);
      return publicUrl;
    } catch (err) {
      console.warn("[s3-upload] S3 upload failed, trying anonymous fallback:", err);
    }
  }

  // S3 is not configured or failed, check if public auto-upload is enabled
  let autoUploadEnabled = true;
  try {
    const saved = localStorage.getItem("ps_canvas_auto_upload_urls");
    if (saved === "false") {
      autoUploadEnabled = false;
    }
  } catch {}

  if (!autoUploadEnabled) {
    throw new Error("检测到您正在使用本地参考图。由于您关闭了「本地参考图自动转为公网 URL 链接」选项，且本地未配置私有 S3 对象存储，外部 AI 绘图接口将无法读取您的图片。请在设置中开启该选项，或者配置 S3 服务，或者直接使用公网图片链接作为参考。");
  }

  // Use local Python server proxy to upload to public hosts (bypasses CORS)
  console.log("[anonymous-upload] S3 is not configured/failed. Attempting auto-upload to public free image hosting via python proxy...");
  
  try {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const proxyRes = await fetch("/api/upload-to-public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64: base64Data }),
      signal: AbortSignal.timeout(120000),
    });
    if (!proxyRes.ok) {
      throw new Error(`代理服务响应错误: HTTP ${proxyRes.status}`);
    }
    const proxyJson = await proxyRes.json();
    if (proxyJson.ok && proxyJson.public_url) {
      console.log("[anonymous-upload] Python proxy upload succeeded: %s", proxyJson.public_url);
      return proxyJson.public_url;
    }
    throw new Error(proxyJson.error || "所有公共图床均返回了空地址");
  } catch (err: any) {
    console.warn("[anonymous-upload] Proxy upload failed:", err);
    throw new Error(`外部 AI 模型需要通过公网图片链接进行「图生图」，但检测到您的本地没有配置 S3 对象存储服务，并且自动匿名图床上传失败（由于国内网络限制或连接超时）：${err?.message || err}。请配置 S3 或直接在画布里使用公网图片。`);
  }
}

// ── KIE Task Polling ──

export async function waitForKieImageTask(taskId: string, apiKey: string, tag: string = "kie"): Promise<string> {
  let consecutiveErrors = 0;
  let lastErrorMsg = "";

  for (let attempt = 1; attempt <= KIE_MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, KIE_POLL_INTERVAL_MS));

    try {
      const res = await fetch(
        `${KIE_BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        { method: "GET", headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(30_000) },
      );
      if (!res.ok) {
        lastErrorMsg = `HTTP ${res.status}`;
        consecutiveErrors++;
        if (consecutiveErrors >= KIE_MAX_CONSECUTIVE_ERRORS) {
          throw new Error(`[${tag}] poll: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg})`);
        }
        continue;
      }
      consecutiveErrors = 0;

      const data = await res.json();
      const record = data.data ?? {};
      const rawState = (record.state ?? "unknown").toLowerCase();

      if (rawState === "success" || rawState === "succeeded" || rawState === "completed") {
        let imageUrl = "";
        if (record.resultJson) {
          try {
            const result = typeof record.resultJson === "string" ? JSON.parse(record.resultJson) : record.resultJson;
            const urls = result.resultUrls ?? result.result_urls ?? [];
            imageUrl = Array.isArray(urls) && urls.length > 0 ? urls[0] : (result.image_url ?? "");
          } catch { /* ignore parse errors */ }
        }
        if (!imageUrl) throw new Error(`[${tag}] succeeded but no image URL in resultJson`);
        console.log("[%s] task=%s succeeded (attempt %d)", tag, taskId, attempt);
        return imageUrl;
      }

      if (rawState !== "waiting" && rawState !== "running" && rawState !== "processing" && rawState !== "queued" && rawState !== "pending" && rawState !== "generating") {
        console.log("[%s] task=%s FAILED raw record: %s", tag, taskId, JSON.stringify(record).slice(0, 2000));
        const failMsg = record.failMsg ?? record.failCode ?? record.errorMsg ?? record.error ?? "unknown error";
        throw new Error(`[${tag}] task failed: ${failMsg}`);
      }

      if (attempt % 10 === 0) {
        console.log("[%s] poll task=%s attempt=%d state=%s", tag, taskId, attempt, rawState);
      }
    } catch (err: any) {
      if (err.message?.includes("task failed") || err.message?.includes("succeeded but")) throw err;
      lastErrorMsg = err.message ?? "Unknown error";
      consecutiveErrors++;
      if (consecutiveErrors >= KIE_MAX_CONSECUTIVE_ERRORS) {
        throw new Error(`[${tag}] poll: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg})`);
      }
    }
  }

  throw new Error(`[${tag}] task ${taskId} timed out after ${KIE_MAX_POLL_ATTEMPTS} attempts`);
}

// ── GPT Image 2 ──

export function useKieForGptImage2(): boolean {
  return process.env.GPT_IMAGE2_USE_KIE === "true" && !!process.env.KIE_API_KEY;
}

async function createKieGptImage2Task(
  params: { prompt: string; inputUrls?: string[]; aspectRatio?: string; resolution?: string },
  apiKey: string,
): Promise<string> {
  const hasRefs = params.inputUrls && params.inputUrls.length > 0;
  const model = hasRefs ? KIE_GPT_IMAGE2_I2I_MODEL : KIE_GPT_IMAGE2_T2I_MODEL;
  const input: Record<string, unknown> = {
    prompt: params.prompt,
  };
  if (hasRefs) {
    input.input_urls = params.inputUrls;
  }
  if (params.aspectRatio && params.aspectRatio !== "auto") {
    input.aspect_ratio = params.aspectRatio;
  }
  if (params.resolution && ["1K", "2K", "4K"].includes(params.resolution)) {
    input.resolution = params.resolution;
  }

  const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`KIE GPT Image 2 create task failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const taskId = data.data?.taskId ?? data.data?.recordId;
  if (!taskId) {
    throw new Error(`KIE GPT Image 2: no taskId: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return taskId;
}

export async function callKieGptImage2(params: {
  prompt: string;
  inputUrls: string[];
  ratio: string | null;
  quality: string;
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<KieImageResult> {
  const apiKey = process.env.KIE_API_KEY!;
  // KIE can't download external URLs — upload refs to KIE storage
  const kieUrls = await resolveUrlsForKie(params.inputUrls);
  const aspectRatio = params.ratio && KIE_SUPPORTED_RATIOS.has(params.ratio) ? params.ratio : "auto";

  console.log("[kie-gpt-image-2] creating task refs=%d ratio=%s res=%s", kieUrls.length, aspectRatio, params.quality);

  const taskId = await createKieGptImage2Task({
    prompt: params.prompt,
    inputUrls: kieUrls,
    aspectRatio,
    resolution: params.quality,
  }, apiKey);

  console.log("[kie-gpt-image-2] task created id=%s", taskId);
  params.onTaskCreated?.(taskId, "kie-gpt-image-2");
  const imageUrl = await waitForKieImageTask(taskId, apiKey, "kie-gpt-image-2");
  return { remoteUrl: imageUrl };
}

export async function callKieGptImage2T2I(params: {
  prompt: string;
  ratio: string | null;
  quality: string;
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<KieImageResult> {
  const apiKey = process.env.KIE_API_KEY!;
  const aspectRatio = params.ratio && KIE_SUPPORTED_RATIOS.has(params.ratio) ? params.ratio : "auto";

  console.log("[kie-gpt-image-2] creating T2I task ratio=%s res=%s", aspectRatio, params.quality);

  const taskId = await createKieGptImage2Task({
    prompt: params.prompt,
    aspectRatio,
    resolution: params.quality,
  }, apiKey);

  console.log("[kie-gpt-image-2] T2I task created id=%s", taskId);
  params.onTaskCreated?.(taskId, "kie-gpt-image-2");
  const imageUrl = await waitForKieImageTask(taskId, apiKey, "kie-gpt-image-2-t2i");
  return { remoteUrl: imageUrl };
}

export async function callKieGptImage2Edit(params: {
  prompt: string;
  imageBlob: Blob;
  imageName: string;
  ratio: string | null;
  quality: string;
}): Promise<KieImageResult> {
  const ext = params.imageName.split(".").pop() ?? "png";
  const publicUrl = await uploadBlobToPublicUrl(params.imageBlob, ext);
  return callKieGptImage2({
    prompt: params.prompt,
    inputUrls: [publicUrl],
    ratio: params.ratio,
    quality: params.quality,
  });
}

// ── Seedream ──

const KIE_SEEDREAM_T2I: Record<string, string> = {
  "doubao-seedream-4-5-251128": "seedream/4.5-text-to-image",
  "doubao-seedream-5-0-260128": "seedream/5-lite-text-to-image",
};

const KIE_SEEDREAM_I2I: Record<string, string> = {
  "doubao-seedream-4-5-251128": "seedream/4.5-edit",
  "doubao-seedream-5-0-260128": "seedream/5-lite-image-to-image",
};

const KIE_SEEDREAM_QUALITY_MAP: Record<string, string> = {
  "2K": "basic",
  "3K": "high",
  "4K": "high",
};

/** Returns true if this Seedream model should be routed to KIE */
export function useKieForSeedream(baseModel: string, _hasRefs: boolean): boolean {
  if (!process.env.KIE_API_KEY) return false;
  return baseModel === "doubao-seedream-4-5-251128" || baseModel === "doubao-seedream-5-0-260128";
}

/** Returns true if Seedream edit (imageBlob) should be routed to KIE */
export function useKieForSeedreamEdit(baseModel: string): boolean {
  if (!process.env.KIE_API_KEY) return false;
  return baseModel === "doubao-seedream-4-5-251128" || baseModel === "doubao-seedream-5-0-260128";
}

/** Pick the right KIE model based on version + whether images are present */
function pickKieSeedreamModel(baseModel: string, hasImages: boolean): string {
  return hasImages
    ? (KIE_SEEDREAM_I2I[baseModel] ?? "seedream/4.5-edit")
    : (KIE_SEEDREAM_T2I[baseModel] ?? "seedream/5-lite-text-to-image");
}

const KIE_SEEDREAM_MAX_PROMPT_LEN = 3000;

async function createKieSeedreamTask(params: {
  model: string;
  prompt: string;
  imageUrls?: string[];
  aspectRatio: string;
  quality: string;
}): Promise<string> {
  const apiKey = process.env.KIE_API_KEY!;
  const input: Record<string, unknown> = {
    prompt: params.prompt.length > KIE_SEEDREAM_MAX_PROMPT_LEN
      ? params.prompt.slice(0, KIE_SEEDREAM_MAX_PROMPT_LEN)
      : params.prompt,
    aspect_ratio: params.aspectRatio,
    quality: KIE_SEEDREAM_QUALITY_MAP[params.quality] ?? "basic",
    nsfw_checker: false,
  };
  if (params.imageUrls?.length) {
    input.image_urls = params.imageUrls;
  }

  const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: params.model, input }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`KIE Seedream create task failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  if (data.code && data.code !== 200) {
    throw new Error(`KIE Seedream API error (${data.code}): ${data.msg ?? JSON.stringify(data).slice(0, 500)}`);
  }
  const taskId = data.data?.taskId ?? data.data?.recordId;
  if (!taskId) {
    throw new Error(`KIE Seedream: no taskId: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return taskId;
}

export async function callKieSeedream(params: {
  baseModel: string;
  prompt: string;
  inputUrls: string[];
  ratio: string | null;
  quality: string;
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<KieImageResult> {
  // KIE servers can't download from external URLs (TLS/timeout issues).
  // Upload ref images to KIE's own file storage via file-stream-upload API.
  let kieUrls: string[] | undefined;
  if (params.inputUrls.length > 0) {
    kieUrls = await resolveUrlsForKie(params.inputUrls);
  }
  const hasImages = !!kieUrls && kieUrls.length > 0;
  const kieModel = pickKieSeedreamModel(params.baseModel, hasImages);
  const aspectRatio = params.ratio && KIE_SUPPORTED_RATIOS.has(params.ratio) ? params.ratio : "1:1";

  console.log("[kie-seedream] model=%s refs=%d ratio=%s quality=%s", kieModel, kieUrls?.length ?? 0, aspectRatio, params.quality);

  const taskId = await createKieSeedreamTask({
    model: kieModel,
    prompt: params.prompt,
    imageUrls: kieUrls,
    aspectRatio,
    quality: params.quality,
  });

  console.log("[kie-seedream] task created id=%s", taskId);
  params.onTaskCreated?.(taskId, "kie-seedream");
  const imageUrl = await waitForKieImageTask(taskId, process.env.KIE_API_KEY!, "kie-seedream");
  return { remoteUrl: imageUrl };
}

export async function callKieSeedreamEdit(params: {
  baseModel: string;
  prompt: string;
  imageBlob: Blob;
  imageName: string;
  ratio: string | null;
  quality: string;
}): Promise<KieImageResult> {
  const ext = params.imageName.split(".").pop() ?? "png";
  const publicUrl = await uploadBlobToPublicUrl(params.imageBlob, ext);
  return callKieSeedream({
    baseModel: params.baseModel,
    prompt: params.prompt,
    inputUrls: [publicUrl],
    ratio: params.ratio,
    quality: params.quality,
  });
}

// ── Internal Helpers ──

/**
 * Resolve URLs for KIE consumption:
 * KIE servers can't download from external URLs (TLS/timeout issues),
 * so we download internally and re-upload to KIE's own file storage.
 */
export async function resolveUrlsForKie(urls: string[]): Promise<string[]> {
  return Promise.all(urls.map(async (u) => {
    const resolved = await ensurePublicUrl(u);
    try {
      let buf: Buffer;
      let ext = "webp";
      // Download from our own S3 via internal client (avoids hairpin NAT)
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
      // Upload to KIE's own file storage
      const kieUrl = await uploadToKieStorage(buf, `ref.${ext}`);
      console.log("[kie-image] ref → kie storage: %s", kieUrl.slice(0, 100));
      return kieUrl;
    } catch (err: any) {
      console.warn("[kie-image] KIE upload failed, using original URL:", err?.message);
      return resolved;
    }
  }));
}
