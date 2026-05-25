// ── OpenCrow Image Generation ──
// GPT Image 2: POST /v1/images/generations on api.router.ai, returns b64_json (synchronous).
// Seedream 4.5 / 5.0: POST /v1/images/generations on api.opencrow.ai, returns CDN URLs (synchronous).
// Uses OPENCROW_API_KEY (shared with video).

import { ensurePublicUrl } from "./t8star-video";
import { buildSeedreamSize } from "./t8star-image";

const OPENCROW_BASE_URL = "https://api.router.ai";
const OPENCROW_SEEDREAM_BASE_URL = "https://api.router.ai";

// Reuse OpenAI size map — same gpt-image-2 constraints apply
const OPENCROW_SIZE_MAP: Record<string, Record<string, string>> = {
  "1K": {
    "1:1": "1024x1024",
    "4:3": "1024x768", "3:4": "768x1024",
    "3:2": "1536x1024", "2:3": "1024x1536",
    "16:9": "1536x1024", "9:16": "1024x1536",
    "5:4": "1280x1024", "4:5": "1024x1280",
    "21:9": "1344x576",
    "2:1": "1536x768", "1:2": "768x1536",
  },
  "2K": {
    "1:1": "2048x2048",
    "4:3": "2560x1920", "3:4": "1920x2560",
    "3:2": "2560x1712", "2:3": "1712x2560",
    "16:9": "2560x1440", "9:16": "1440x2560",
    "5:4": "2560x2048", "4:5": "2048x2560",
    "21:9": "2688x1152",
    "2:1": "2560x1280", "1:2": "1280x2560",
  },
  "4K": {
    "1:1": "2880x2880",
    "4:3": "3264x2448", "3:4": "2448x3264",
    "3:2": "3504x2336", "2:3": "2336x3504",
    "16:9": "3840x2160", "9:16": "2160x3840",
    "5:4": "3200x2560", "4:5": "2560x3200",
    "21:9": "3840x1648",
    "2:1": "3840x1920", "1:2": "1920x3840",
  },
};

function buildOpenCrowSize(ratio: string | null, quality: string): string {
  const qMap = OPENCROW_SIZE_MAP[quality] ?? OPENCROW_SIZE_MAP["1K"];
  if (!ratio) return qMap["1:1"] ?? "1024x1024";
  return qMap[ratio] ?? qMap["1:1"] ?? "1024x1024";
}

export function isOpenCrowImageConfigured(): boolean {
  return !!process.env.OPENCROW_API_KEY;
}

export interface OpenCrowGptImage2Result {
  remoteUrl: string; // data:image/png;base64,...
}

// ── Edit size map — reuse same sizes as generations (OpenCrow confirmed 4K support) ──
const OPENCROW_EDIT_SIZE_MAP: Record<string, Record<string, string>> = OPENCROW_SIZE_MAP;

function buildOpenCrowEditSize(ratio: string | null, quality: string): string {
  const qMap = OPENCROW_EDIT_SIZE_MAP[quality] ?? OPENCROW_EDIT_SIZE_MAP["1K"];
  if (!ratio) return qMap["1:1"] ?? "1024x1024";
  return qMap[ratio] ?? qMap["1:1"] ?? "1024x1024";
}

/** Download an image URL to a buffer + detect extension */
async function downloadImageToBuffer(url: string): Promise<{ buffer: Buffer; ext: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Failed to download image ${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get("content-type") ?? "";
  const ext = ct.includes("webp") ? "webp" : ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : "png";
  return { buffer: buf, ext };
}

// ── Image-to-image edit via /v1/images/edits (multipart/form-data) ──

export async function callOpenCrowGptImage2Edit(params: {
  prompt: string;
  ratio: string | null;
  quality: string;
  outputQuality?: string;
  referenceImages: string[];
}): Promise<OpenCrowGptImage2Result> {
  const apiKey = process.env.OPENCROW_API_KEY;
  if (!apiKey) throw new Error("OPENCROW_API_KEY is not configured");
  if (params.referenceImages.length === 0) throw new Error("OpenCrow edit requires at least 1 reference image");

  const sizeValue = buildOpenCrowEditSize(params.ratio, params.quality);
  const qualityValue = params.outputQuality && ["low", "medium", "high"].includes(params.outputQuality)
    ? params.outputQuality
    : "high";

  console.log("[opencrow-gpt-image-2-edit] downloading %d reference images...", params.referenceImages.length);

  // Download all reference images in parallel
  const downloads = await Promise.all(
    params.referenceImages.map(async (url, i) => {
      const { buffer, ext } = await downloadImageToBuffer(url);
      return { buffer, name: `ref_${i}.${ext}`, ext };
    })
  );

  // Build multipart/form-data
  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("prompt", params.prompt);
  form.append("size", sizeValue);
  form.append("quality", qualityValue);
  form.append("output_format", "png");
  form.append("moderation", "low");
  form.append("n", "1");

  // Single image → "image", multiple → "image[]"
  const fieldName = downloads.length === 1 ? "image" : "image[]";
  for (const dl of downloads) {
    const blob = new Blob([new Uint8Array(dl.buffer)], { type: dl.ext === "webp" ? "image/webp" : dl.ext === "jpg" ? "image/jpeg" : "image/png" });
    form.append(fieldName, blob, dl.name);
  }

  console.log("[opencrow-gpt-image-2-edit] request size=%s quality=%s refs=%d", sizeValue, qualityValue, downloads.length);

  const res = await fetch(`${OPENCROW_BASE_URL}/v1/images/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      // Content-Type is set automatically by FormData
    },
    body: form,
    signal: AbortSignal.timeout(300_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    let errMsg = `OpenCrow GPT Image 2 edit error ${res.status}: `;
    try {
      const json = JSON.parse(errText);
      const err = json.error ?? json;
      const type = err.type ?? err.code ?? "";
      const msg = err.message ?? err.detail ?? "";
      errMsg += type ? `[${type}] ${msg}` : msg || errText.slice(0, 500);
    } catch {
      errMsg += errText.slice(0, 500);
    }
    throw new Error(errMsg);
  }

  const body = await res.json() as any;

  if (body.usage) {
    console.log("[opencrow-gpt-image-2-edit] usage: input=%d output=%d total=%d",
      body.usage.input_tokens ?? 0, body.usage.output_tokens ?? 0, body.usage.total_tokens ?? 0);
  }

  const b64 = body.data?.[0]?.b64_json;
  if (b64) {
    console.log("[opencrow-gpt-image-2-edit] completed (base64, %d bytes) size=%s quality=%s refs=%d",
      b64.length, body.size ?? sizeValue, body.quality ?? qualityValue, downloads.length);
    return { remoteUrl: `data:image/png;base64,${b64}` };
  }

  throw new Error("OpenCrow GPT Image 2 edit: no b64_json in response: " + JSON.stringify(body).slice(0, 500));
}

// ── Text-to-image via /v1/images/generations ──

export async function callOpenCrowGptImage2(params: {
  prompt: string;
  ratio: string | null;
  quality: string;
  outputQuality?: string;
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<OpenCrowGptImage2Result> {
  const apiKey = process.env.OPENCROW_API_KEY;
  if (!apiKey) throw new Error("OPENCROW_API_KEY is not configured");

  const sizeValue = buildOpenCrowSize(params.ratio, params.quality);
  const qualityValue = params.outputQuality && ["low", "medium", "high"].includes(params.outputQuality)
    ? params.outputQuality
    : "high";

  console.log("[opencrow-gpt-image-2] request size=%s quality=%s", sizeValue, qualityValue);

  const res = await fetch(`${OPENCROW_BASE_URL}/v1/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt: params.prompt,
      n: 1,
      size: sizeValue,
      quality: qualityValue,
      output_format: "png",
      moderation: "low",
    }),
    signal: AbortSignal.timeout(300_000), // 5 min — sync call can be slow for 4K
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    // Parse OpenCrow structured error
    let errMsg = `OpenCrow GPT Image 2 error ${res.status}: `;
    try {
      const json = JSON.parse(errText);
      const err = json.error ?? json;
      const type = err.type ?? err.code ?? "";
      const msg = err.message ?? err.detail ?? "";
      errMsg += type ? `[${type}] ${msg}` : msg || errText.slice(0, 500);
    } catch {
      errMsg += errText.slice(0, 500);
    }
    throw new Error(errMsg);
  }

  const body = await res.json() as any;

  // Log usage if available
  if (body.usage) {
    console.log("[opencrow-gpt-image-2] usage: input=%d output=%d total=%d",
      body.usage.input_tokens ?? 0, body.usage.output_tokens ?? 0, body.usage.total_tokens ?? 0);
  }

  const b64 = body.data?.[0]?.b64_json;
  if (b64) {
    console.log("[opencrow-gpt-image-2] completed (base64, %d bytes) size=%s quality=%s",
      b64.length, body.size ?? sizeValue, body.quality ?? qualityValue);
    return { remoteUrl: `data:image/png;base64,${b64}` };
  }

  throw new Error("OpenCrow GPT Image 2: no b64_json in response: " + JSON.stringify(body).slice(0, 500));
}

// ── OpenCrow Seedream 4.5 / 5.0 ──

/** Map our internal model names to OpenCrow's model IDs */
const OPENCROW_SEEDREAM_MODEL_MAP: Record<string, string> = {
  "doubao-seedream-4-5-251128": "seedream-4-5-251128",
  "doubao-seedream-5-0-260128": "seedream-5-0-lite-260128",
};

export interface OpenCrowSeedreamResult {
  remoteUrl: string;
}

/**
 * OpenCrow Seedream text-to-image / image-to-image (synchronous).
 * POST /v1/images/generations → returns data[].url (24h CDN URLs).
 */
export async function callOpenCrowSeedream(params: {
  baseModel: string;
  prompt: string;
  inputUrls?: string[];
  ratio: string | null;
  quality: string;
}): Promise<OpenCrowSeedreamResult> {
  const apiKey = process.env.OPENCROW_API_KEY;
  if (!apiKey) throw new Error("OPENCROW_API_KEY is not configured");

  const model = OPENCROW_SEEDREAM_MODEL_MAP[params.baseModel];
  if (!model) throw new Error(`No OpenCrow Seedream model for: ${params.baseModel}`);

  // Convert quality + ratio to pixel dimensions (e.g. 3K + 16:9 → 4096x2304)
  // Simple strings like "3K" default to 1:1; pixel dims are needed for non-square ratios
  const size = buildSeedreamSize(params.ratio, params.quality);

  const body: Record<string, unknown> = {
    model,
    prompt: params.prompt,
    size,
    response_format: "url",
    watermark: false,
  };

  // Reference images: ensure they are publicly accessible URLs (xinyuai.app/s3/...)
  if (params.inputUrls && params.inputUrls.length > 0) {
    const publicUrls = await Promise.all(params.inputUrls.map(u => ensurePublicUrl(u)));
    body.image = publicUrls;
  }

  console.log("[opencrow-seedream] request model=%s size=%s refs=%d", model, size, params.inputUrls?.length ?? 0);

  const res = await fetch(`${OPENCROW_SEEDREAM_BASE_URL}/v1/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(600_000), // 10 min — sync call, Seedream can be slow
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    let errMsg = `OpenCrow Seedream error ${res.status}: `;
    try {
      const json = JSON.parse(errText);
      const err = json.error ?? json;
      const type = err.type ?? err.code ?? "";
      const msg = err.message ?? err.detail ?? "";
      errMsg += type ? `[${type}] ${msg}` : msg || errText.slice(0, 500);
    } catch {
      errMsg += errText.slice(0, 500);
    }
    throw new Error(errMsg);
  }

  const result = await res.json() as any;

  if (result.usage) {
    console.log("[opencrow-seedream] usage: generated_images=%d", result.usage.generated_images ?? 0);
  }

  const url = result.data?.[0]?.url;
  if (url) {
    console.log("[opencrow-seedream] completed model=%s size=%s url=%s", model, result.data?.[0]?.size ?? size, url.slice(0, 100));
    return { remoteUrl: url };
  }

  throw new Error("OpenCrow Seedream: no url in response: " + JSON.stringify(result).slice(0, 500));
}

/**
 * OpenCrow Seedream edit (image blob → upload to S3 → presigned URL → API).
 */
export async function callOpenCrowSeedreamEdit(params: {
  baseModel: string;
  prompt: string;
  imageBlob: Blob;
  imageName: string;
  ratio: string | null;
  quality: string;
}): Promise<OpenCrowSeedreamResult> {
  // Upload blob to S3 and get a presigned URL
  const { uploadBlobToPublicUrl } = await import("./kie-image");
  const ext = params.imageName.split(".").pop() ?? "png";
  const publicUrl = await uploadBlobToPublicUrl(params.imageBlob, ext);

  return callOpenCrowSeedream({
    baseModel: params.baseModel,
    prompt: params.prompt,
    inputUrls: [publicUrl],
    ratio: params.ratio,
    quality: params.quality,
  });
}
