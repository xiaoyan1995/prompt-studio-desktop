import { readFile } from "fs/promises";
import { join } from "path";

// ── fal.ai shared utilities ──

const UPLOAD_DIR = join(process.cwd(), "data", "uploads");

/**
 * Lazily import and configure the fal.ai client.
 */
export async function getFalClient() {
  const { fal } = await import("@fal-ai/client");
  fal.config({ credentials: process.env.FAL_KEY ?? "" });
  return fal;
}

/**
 * Resolve a local /api/files/ path to a fal.ai storage URL,
 * or return remote URLs as-is.
 */
export async function resolveAndUploadToFal(url: string, fal?: any): Promise<string> {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/api/files/")) {
    const client = fal ?? await getFalClient();
    const relativePath = url.replace("/api/files/", "");
    const filePath = join(UPLOAD_DIR, relativePath);
    const buffer = await readFile(filePath);
    const ext = relativePath.split(".").pop() ?? "png";
    const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/webp";
    const file = new File([buffer], `ref.${ext}`, { type: mime });
    return await client.storage.upload(file);
  }
  return url;
}

/**
 * Upload a Blob to fal.ai storage and return the URL.
 */
export async function uploadBlobToFal(blob: Blob, fileName: string): Promise<string> {
  const fal = await getFalClient();
  const file = new File([blob], fileName, { type: blob.type || "image/png" });
  return await fal.storage.upload(file);
}

// ── Shared size/ratio mapping (used by z-image, wan-image) ──

export type FalImageSizeEnum = "square_hd" | "square" | "portrait_4_3" | "portrait_16_9" | "landscape_4_3" | "landscape_16_9";

export const FAL_RATIO_TO_SIZE: Record<string, FalImageSizeEnum | { width: number; height: number }> = {
  "1:1":  "square_hd",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
  "4:3":  "landscape_4_3",
  "3:4":  "portrait_4_3",
  "3:2":  { width: 1536, height: 1024 },
  "2:3":  { width: 1024, height: 1536 },
  "5:4":  { width: 1280, height: 1024 },
  "4:5":  { width: 1024, height: 1280 },
  "21:9": { width: 1344, height: 576 },
};

export function resolveFalImageSize(ratio: string | null): FalImageSizeEnum | { width: number; height: number } {
  if (ratio && ratio in FAL_RATIO_TO_SIZE) return FAL_RATIO_TO_SIZE[ratio];
  return "square_hd";
}

// ── GPT Image 2 via fal.ai ──

// fal.ai GPT Image 2 accepts explicit {width, height} — use quality tier for resolution
const FAL_GPT_IMAGE2_SIZE_MAP: Record<string, Record<string, { width: number; height: number }>> = {
  "1K": {
    "1:1": { width: 1024, height: 1024 },
    "4:3": { width: 1024, height: 768 }, "3:4": { width: 768, height: 1024 },
    "3:2": { width: 1536, height: 1024 }, "2:3": { width: 1024, height: 1536 },
    "16:9": { width: 1536, height: 864 }, "9:16": { width: 864, height: 1536 },
    "5:4": { width: 1280, height: 1024 }, "4:5": { width: 1024, height: 1280 },
    "21:9": { width: 1344, height: 576 },
  },
  "2K": {
    "1:1": { width: 2048, height: 2048 },
    "4:3": { width: 2560, height: 1920 }, "3:4": { width: 1920, height: 2560 },
    "3:2": { width: 2560, height: 1712 }, "2:3": { width: 1712, height: 2560 },
    "16:9": { width: 2560, height: 1440 }, "9:16": { width: 1440, height: 2560 },
    "5:4": { width: 2560, height: 2048 }, "4:5": { width: 2048, height: 2560 },
    "21:9": { width: 2688, height: 1152 },
  },
  "4K": {
    // fal.ai limit: total pixels < 8,294,400, max edge 3840px, both dims mult of 16
    "1:1": { width: 2864, height: 2864 },   // 8,202,496
    "4:3": { width: 3264, height: 2448 }, "3:4": { width: 2448, height: 3264 },   // 7,990,272
    "3:2": { width: 3504, height: 2336 }, "2:3": { width: 2336, height: 3504 },   // 8,185,344
    "16:9": { width: 3824, height: 2160 }, "9:16": { width: 2160, height: 3824 }, // 8,259,840
    "5:4": { width: 3200, height: 2560 }, "4:5": { width: 2560, height: 3200 },   // 8,192,000
    "21:9": { width: 3840, height: 1648 },  // 6,328,320
  },
};

function resolveFalGptImage2Size(ratio: string | null, quality: string): { width: number; height: number } | FalImageSizeEnum {
  const qMap = FAL_GPT_IMAGE2_SIZE_MAP[quality] ?? FAL_GPT_IMAGE2_SIZE_MAP["1K"];
  if (!ratio) return qMap["1:1"] ?? { width: 1024, height: 1024 };
  return qMap[ratio] ?? qMap["1:1"] ?? { width: 1024, height: 1024 };
}

export interface FalGptImage2Result {
  remoteUrl: string;
  requestId?: string;
}

export async function callFalGptImage2(params: {
  prompt: string;
  ratio: string | null;
  quality: string;
  outputQuality?: string;
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<FalGptImage2Result> {
  const fal = await getFalClient();
  const imageSize = resolveFalGptImage2Size(params.ratio, params.quality);
  const qualityValue = params.outputQuality && ["low", "medium", "high"].includes(params.outputQuality)
    ? params.outputQuality
    : "high";

  console.log("[fal-gpt-image-2] request size=%j quality=%s", imageSize, qualityValue);

  // Submit to queue (non-blocking) then poll — avoids race with recovery system
  const { request_id } = await fal.queue.submit("openai/gpt-image-2", {
    input: {
      prompt: params.prompt,
      image_size: imageSize,
      quality: qualityValue,
      num_images: 1,
      output_format: "png",
    },
  });

  console.log("[fal-gpt-image-2] task submitted requestId=%s", request_id);
  if (params.onTaskCreated) {
    params.onTaskCreated(request_id, "fal-gpt-image-2");
  }

  // Poll until complete (same function used by recovery)
  const pollResult = await pollFalGptImage2Task(request_id);
  return { remoteUrl: pollResult.imageUrl, requestId: request_id };
}

export async function pollFalGptImage2Task(requestId: string): Promise<{ imageUrl: string }> {
  const fal = await getFalClient();

  // Poll status until task leaves the queue
  const MAX_ATTEMPTS = 360; // ~30 min at 5s interval
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const status = await fal.queue.status("openai/gpt-image-2", { requestId, logs: false });
    const st = status.status as string;
    console.log("[fal-gpt-image-2] recovery poll attempt=%d status=%s", i + 1, st);
    if (st !== "IN_QUEUE" && st !== "IN_PROGRESS") break;
    await new Promise((r) => setTimeout(r, 5000));
  }

  const result = await fal.queue.result("openai/gpt-image-2", { requestId });
  const images = (result as any)?.data?.images ?? (result as any)?.images ?? [];
  const imageUrl = images[0]?.url;
  if (!imageUrl) throw new Error("fal.ai GPT Image 2 recovery: no image URL in response");
  return { imageUrl };
}
