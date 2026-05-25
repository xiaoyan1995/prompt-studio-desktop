import { uploadBlobToPublicUrl } from "./kie-image";

// ── Duomi API Image Generation (GPT Image 2 + Nano Banana) ──

const DUOMI_BASE_URL = "https://duomiapi.com";
const DUOMI_API_KEY = process.env.DUOMI_API_KEY || "";

const DUOMI_POLL_INTERVAL_MS = 5_000;
const DUOMI_MAX_POLL_ATTEMPTS = 720;
const DUOMI_MAX_CONSECUTIVE_ERRORS = 10;

export interface DuomiImageResult {
  remoteUrl: string;
  revisedPrompt?: string;
}

// ── GPT Image 2 size/quality maps (shared with T8Star) ──

const GPT_IMAGE_2_QUALITY_MAP: Record<string, string> = {
  "1K": "high",
  "2K": "high",
  "4K": "high",
};

const GPT_IMAGE_2_SIZE_MAP: Record<string, Record<string, string>> = {
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

function buildGptImage2Size(ratio: string | null, quality: string): string {
  if (!ratio) return GPT_IMAGE_2_SIZE_MAP[quality]?.["1:1"] ?? "1024x1024";
  return GPT_IMAGE_2_SIZE_MAP[quality]?.[ratio] ?? GPT_IMAGE_2_SIZE_MAP[quality]?.["1:1"] ?? "1024x1024";
}

// ── GPT Image 2 ──

export function useDuomiForGptImage2(): boolean {
  return !!DUOMI_API_KEY;
}

export async function pollDuomiTask(taskId: string): Promise<{ imageUrl: string }> {
  const queryUrl = `${DUOMI_BASE_URL}/v1/tasks/${taskId}`;
  let consecutiveErrors = 0;
  let lastErrorMsg = "";
  for (let attempt = 1; attempt <= DUOMI_MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, DUOMI_POLL_INTERVAL_MS));
    try {
      const res = await fetch(queryUrl, {
        headers: { Authorization: DUOMI_API_KEY },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        lastErrorMsg = `HTTP ${res.status}`;
        consecutiveErrors++;
        console.log("[duomi-gpt-image-2] poll %s attempt=%d status=%d consecutive_errors=%d", taskId, attempt, res.status, consecutiveErrors);
        if (consecutiveErrors >= DUOMI_MAX_CONSECUTIVE_ERRORS) {
          throw new Error(`Duomi task poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg})`);
        }
        continue;
      }
      consecutiveErrors = 0;
      const record = await res.json();
      const state = record.state ?? "";
      if (state === "succeeded") {
        const imageUrl = record.data?.images?.[0]?.url;
        if (!imageUrl) throw new Error("Duomi task succeeded but no image URL in response");
        return { imageUrl };
      }
      if (state === "failed" || state === "error") {
        const failMsg = record.data?.description || record.error || "Unknown error";
        throw new Error(`Duomi task failed: ${failMsg}`);
      }
      if (attempt % 10 === 0) {
        console.log("[duomi-gpt-image-2] poll %s attempt=%d state=%s progress=%s", taskId, attempt, state, record.progress ?? "?");
      }
    } catch (err: any) {
      if (err.message?.includes("task failed") || err.message?.includes("poll failed") || err.message?.includes("no image URL")) throw err;
      lastErrorMsg = err.message ?? "Unknown fetch error";
      consecutiveErrors++;
      console.log("[duomi-gpt-image-2] poll %s attempt=%d fetch error=%s consecutive_errors=%d", taskId, attempt, lastErrorMsg, consecutiveErrors);
      if (consecutiveErrors >= DUOMI_MAX_CONSECUTIVE_ERRORS) {
        throw new Error(`Duomi task poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg})`);
      }
    }
  }
  throw new Error(`Duomi task timed out after ${DUOMI_MAX_POLL_ATTEMPTS} attempts`);
}

export async function callDuomiGptImage2(params: {
  prompt: string;
  ratio: string | null;
  quality: string;
  referenceImageUrls?: string[];
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<DuomiImageResult> {
  const sizeValue = buildGptImage2Size(params.ratio, params.quality);
  const gptQuality = GPT_IMAGE_2_QUALITY_MAP[params.quality] ?? "auto";

  const body: Record<string, unknown> = {
    model: "gpt-image-2",
    prompt: params.prompt,
    n: 1,
    quality: gptQuality,
    size: sizeValue,
  };

  if (params.referenceImageUrls && params.referenceImageUrls.length > 0) {
    body.image = params.referenceImageUrls;
  }

  console.log("[duomi-gpt-image-2] async request size=%s quality=%s refs=%d",
    sizeValue, gptQuality, params.referenceImageUrls?.length ?? 0);

  const submitRes = await fetch(`${DUOMI_BASE_URL}/v1/images/generations?async=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: DUOMI_API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => "Unknown error");
    throw new Error(`Duomi GPT Image 2 submit error ${submitRes.status}: ${errText.slice(0, 2000)}`);
  }

  const submitResult = await submitRes.json();
  const taskId = submitResult.id;
  if (!taskId) {
    throw new Error(`No id in Duomi response: ${JSON.stringify(submitResult).slice(0, 500)}`);
  }

  console.log("[duomi-gpt-image-2] task submitted id=%s", taskId);
  params.onTaskCreated?.(taskId, "duomi-gpt-image-2");
  const asyncResult = await pollDuomiTask(taskId);
  return { remoteUrl: asyncResult.imageUrl };
}

export async function callDuomiGptImage2Edit(params: {
  prompt: string;
  imageBlob: Blob;
  imageName: string;
  ratio: string | null;
  quality: string;
}): Promise<DuomiImageResult> {
  const ext = params.imageName.split(".").pop() ?? "png";
  const publicUrl = await uploadBlobToPublicUrl(params.imageBlob, ext);
  return callDuomiGptImage2({
    prompt: params.prompt,
    ratio: params.ratio,
    quality: params.quality,
    referenceImageUrls: [publicUrl],
  });
}

// ── Nano Banana ──

const DUOMI_NANO_BANANA_MODEL_MAP: Record<string, string> = {
  "nano-banana-2": "gemini-3.1-flash-image-preview",
  "nano-banana-pro": "gemini-3-pro-image-preview",
};

export function useDuomiForNanoBanana(): boolean {
  return !!DUOMI_API_KEY;
}

export async function pollDuomiNanoBananaTask(taskId: string): Promise<{ imageUrl: string }> {
  const queryUrl = `${DUOMI_BASE_URL}/api/gemini/nano-banana/${taskId}`;
  let consecutiveErrors = 0;
  let lastErrorMsg = "";
  for (let attempt = 1; attempt <= DUOMI_MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, DUOMI_POLL_INTERVAL_MS));
    try {
      const res = await fetch(queryUrl, {
        headers: { Authorization: DUOMI_API_KEY },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        lastErrorMsg = `HTTP ${res.status}`;
        consecutiveErrors++;
        console.log("[duomi-nano-banana] poll %s attempt=%d status=%d consecutive_errors=%d", taskId, attempt, res.status, consecutiveErrors);
        if (consecutiveErrors >= DUOMI_MAX_CONSECUTIVE_ERRORS) {
          throw new Error(`Duomi nano-banana poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg})`);
        }
        continue;
      }
      consecutiveErrors = 0;
      const json = await res.json();
      const record = json.data ?? json;
      const state = record.state ?? "";
      if (state === "succeeded") {
        const imageUrl = record.data?.images?.[0]?.url;
        if (!imageUrl) throw new Error("Duomi nano-banana task succeeded but no image URL in response");
        return { imageUrl };
      }
      if (state === "failed" || state === "error") {
        const failMsg = record.data?.description || record.msg || "Unknown error";
        throw new Error(`Duomi nano-banana task failed: ${failMsg}`);
      }
      if (attempt % 10 === 0) {
        console.log("[duomi-nano-banana] poll %s attempt=%d state=%s", taskId, attempt, state);
      }
    } catch (err: any) {
      if (err.message?.includes("task failed") || err.message?.includes("poll failed") || err.message?.includes("no image URL")) throw err;
      lastErrorMsg = err.message ?? "Unknown fetch error";
      consecutiveErrors++;
      console.log("[duomi-nano-banana] poll %s attempt=%d fetch error=%s consecutive_errors=%d", taskId, attempt, lastErrorMsg, consecutiveErrors);
      if (consecutiveErrors >= DUOMI_MAX_CONSECUTIVE_ERRORS) {
        throw new Error(`Duomi nano-banana poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg})`);
      }
    }
  }
  throw new Error(`Duomi nano-banana task timed out after ${DUOMI_MAX_POLL_ATTEMPTS} attempts`);
}

export async function callDuomiNanoBanana(params: {
  prompt: string;
  baseModel: string;
  ratio: string | null;
  quality: string;
  referenceImageUrls?: string[];
  onTaskCreated?: (taskId: string, provider: string) => void;
}): Promise<DuomiImageResult> {
  const duomiModel = DUOMI_NANO_BANANA_MODEL_MAP[params.baseModel] ?? "gemini-3.1-flash-image-preview";
  const hasRefs = params.referenceImageUrls && params.referenceImageUrls.length > 0;
  const endpoint = hasRefs
    ? `${DUOMI_BASE_URL}/api/gemini/nano-banana-edit`
    : `${DUOMI_BASE_URL}/api/gemini/nano-banana`;

  const body: Record<string, unknown> = {
    model: duomiModel,
    prompt: params.prompt,
    image_size: params.quality,
    aspect_ratio: params.ratio ?? "",
  };

  if (hasRefs) {
    body.image_urls = params.referenceImageUrls;
  }

  console.log("[duomi-nano-banana] %s model=%s size=%s ratio=%s refs=%d",
    hasRefs ? "edit" : "t2i", duomiModel, params.quality, params.ratio ?? "", params.referenceImageUrls?.length ?? 0);

  const submitRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: DUOMI_API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => "Unknown error");
    throw new Error(`Duomi nano-banana submit error ${submitRes.status}: ${errText.slice(0, 2000)}`);
  }

  const submitResult = await submitRes.json();
  const taskId = submitResult.data?.task_id;
  if (!taskId) {
    throw new Error(`No task_id in Duomi nano-banana response: ${JSON.stringify(submitResult).slice(0, 500)}`);
  }

  console.log("[duomi-nano-banana] task submitted id=%s", taskId);
  params.onTaskCreated?.(taskId, "duomi-nano-banana");
  const asyncResult = await pollDuomiNanoBananaTask(taskId);
  return { remoteUrl: asyncResult.imageUrl };
}

export async function callDuomiNanoBananaEdit(params: {
  prompt: string;
  baseModel: string;
  imageBlob: Blob;
  imageName: string;
  ratio: string | null;
  quality: string;
}): Promise<DuomiImageResult> {
  const ext = params.imageName.split(".").pop() ?? "png";
  const publicUrl = await uploadBlobToPublicUrl(params.imageBlob, ext);
  return callDuomiNanoBanana({
    prompt: params.prompt,
    baseModel: params.baseModel,
    ratio: params.ratio,
    quality: params.quality,
    referenceImageUrls: [publicUrl],
  });
}
