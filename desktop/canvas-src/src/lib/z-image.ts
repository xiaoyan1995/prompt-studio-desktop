import { getFalClient, uploadBlobToFal, resolveFalImageSize } from "./fal-image";

export const Z_IMAGE_MODELS = new Set(["z-image-turbo"]);

// ── KIE.ai Z-Image adapter ──

const KIE_BASE_URL = "https://api.kie.ai";
const KIE_POLL_INTERVAL_MS = 5_000;
const KIE_MAX_POLL_ATTEMPTS = 120;
const KIE_MAX_CONSECUTIVE_ERRORS = 10;

const KIE_ERROR_MAP: Record<string, string> = {
  "401": "Authentication failed",
  "402": "Insufficient KIE credits",
  "404": "KIE endpoint not found",
  "422": "Validation error — invalid parameters",
  "429": "Rate limited — too many requests",
  "433": "KIE sub-key usage limit exceeded",
  "455": "KIE service under maintenance",
  "500": "KIE server error",
  "501": "Generation failed",
  "505": "Feature disabled on KIE",
};

function useKieForZImage(): boolean {
  return !!process.env.KIE_API_KEY;
}

async function createKieZImageTask(params: {
  prompt: string;
  aspectRatio?: string | null;
  onTaskCreated?: (taskId: string) => void;
}): Promise<string> {
  const apiKey = process.env.KIE_API_KEY!;

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    nsfw_checker: false,
  };
  if (params.aspectRatio) {
    input.aspect_ratio = params.aspectRatio;
  }

  console.log("[kie-z-image] creating task ratio=%s", params.aspectRatio ?? "default");

  const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "z-image", input }),
    signal: AbortSignal.timeout(60_000),
  });

  const data = await res.json() as any;
  const code = String(data.code ?? res.status);
  if (code !== "200") {
    const mapped = KIE_ERROR_MAP[code];
    throw new Error(mapped ?? `KIE Z-Image create failed (${code}): ${data.msg ?? ""}`);
  }

  const taskId = data.data?.taskId ?? data.data?.recordId;
  if (!taskId) {
    throw new Error(`KIE Z-Image: no taskId in response: ${JSON.stringify(data).slice(0, 500)}`);
  }

  console.log("[kie-z-image] task created id=%s", taskId);
  params.onTaskCreated?.(taskId);
  return taskId;
}

export async function waitForKieZImageResult(taskId: string): Promise<string[]> {
  const apiKey = process.env.KIE_API_KEY!;
  let consecutiveErrors = 0;
  let lastErrorMsg = "";

  for (let attempt = 0; attempt < KIE_MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
      });

      const data = await res.json() as any;
      const code = String(data.code ?? res.status);
      if (code !== "200") {
        const mapped = KIE_ERROR_MAP[code];
        if (mapped) throw new Error(mapped);
        lastErrorMsg = `KIE poll ${code}: ${data.msg ?? ""}`;
        consecutiveErrors++;
        if (consecutiveErrors >= KIE_MAX_CONSECUTIVE_ERRORS) throw new Error(lastErrorMsg);
        await new Promise((r) => setTimeout(r, KIE_POLL_INTERVAL_MS));
        continue;
      }

      consecutiveErrors = 0;
      const state = (data.data?.state ?? "").toLowerCase();

      if (state === "success" || state === "succeeded" || state === "completed") {
        let result = data.data?.resultJson;
        if (typeof result === "string") result = JSON.parse(result);
        const urls: string[] = result?.resultUrls ?? [];
        if (urls.length === 0) throw new Error("KIE Z-Image returned no images");
        console.log("[kie-z-image] done, %d image(s)", urls.length);
        return urls;
      }

      if (state === "fail" || state === "failed") {
        const failCode = String(data.data?.failCode ?? "");
        const failMsg = data.data?.failMsg ?? "unknown";
        const mapped = KIE_ERROR_MAP[failCode];
        throw new Error(mapped ?? `KIE Z-Image failed (${failCode}): ${failMsg}`);
      }

      if (attempt % 12 === 0) {
        console.log("[kie-z-image] poll #%d state=%s", attempt + 1, state);
      }
    } catch (err: any) {
      if (err.message && (err.message.includes("KIE") || err.message.includes("Generation failed"))) throw err;
      lastErrorMsg = err.message ?? "Unknown poll error";
      consecutiveErrors++;
      if (consecutiveErrors >= KIE_MAX_CONSECUTIVE_ERRORS) throw new Error(lastErrorMsg);
    }

    await new Promise((r) => setTimeout(r, KIE_POLL_INTERVAL_MS));
  }

  throw new Error("KIE Z-Image generation timed out");
}

// ── fal.ai error helper ──

function parseFalError(err: any): string {
  if (err.body?.detail) {
    const details = Array.isArray(err.body.detail) ? err.body.detail : [err.body.detail];
    for (const d of details) {
      if (d.type === "content_policy_violation") {
        return "Content policy violation: the prompt was flagged by the content checker.";
      }
    }
    const first = details[0];
    if (typeof first === "object" && first.msg) return first.msg;
    if (typeof first === "string") return first;
  }
  return err.message ?? "Unknown error";
}

// ── Public API ──

export interface ZImageResult {
  remoteUrl: string;
  revisedPrompt?: string;
}

export interface ZImageGenParams {
  prompt: string;
  ratio: string | null;
  referenceImages?: string[];
  negative_prompt?: string;
  guidance_scale?: number;
  num_inference_steps?: number;
  seed?: number;
  onTaskCreated?: (taskId: string, provider: string) => void;
}

export async function callZImageGeneration(params: ZImageGenParams): Promise<ZImageResult> {
  const { prompt, ratio, onTaskCreated } = params;

  // ── KIE.ai route (preferred, T2I only — Z-Image does not support I2I) ──
  if (useKieForZImage()) {
    const taskId = await createKieZImageTask({
      prompt,
      aspectRatio: ratio,
      onTaskCreated: onTaskCreated ? (id) => onTaskCreated(id, "kie-z-image") : undefined,
    });
    const resultUrls = await waitForKieZImageResult(taskId);
    return { remoteUrl: resultUrls[0] };
  }

  // ── fal.ai fallback ──
  const fal = await getFalClient();
  const imageSize = resolveFalImageSize(ratio);
  const { negative_prompt, guidance_scale, num_inference_steps, seed } = params;
  let result;
  try {
    result = await fal.subscribe("fal-ai/z-image/turbo", {
      input: {
        prompt,
        image_size: imageSize,
        num_inference_steps: num_inference_steps ?? 8,
        num_images: 1,
        output_format: "png",
        enable_safety_checker: false,
        sync_mode: true,
        ...(negative_prompt ? { negative_prompt } : {}),
        ...(guidance_scale != null ? { guidance_scale } : {}),
        ...(seed != null ? { seed } : {}),
      },
    });
  } catch (err: any) {
    throw new Error(parseFalError(err));
  }
  const data = result.data as any;
  const remoteUrl = data?.images?.[0]?.url;
  if (!remoteUrl) throw new Error("No image returned from Z-Image Turbo");
  return { remoteUrl, revisedPrompt: data?.prompt };
}

export interface ZImageEditParams {
  prompt: string;
  imageBlob: Blob;
  imageName: string;
}

export async function callZImageEdit(params: ZImageEditParams): Promise<ZImageResult> {
  // Z-Image Turbo does not support I2I on KIE, use fal.ai
  const { prompt, imageBlob, imageName } = params;
  const fal = await getFalClient();
  const uploadedUrl = await uploadBlobToFal(imageBlob, imageName);

  let result;
  try {
    result = await fal.subscribe("fal-ai/z-image/turbo/image-to-image", {
      input: {
        prompt,
        image_url: uploadedUrl,
        image_size: "auto",
        num_inference_steps: 8,
        num_images: 1,
        output_format: "png",
        enable_safety_checker: false,
        sync_mode: true,
      },
    });
  } catch (err: any) {
    throw new Error(parseFalError(err));
  }
  const data = result.data as any;
  const remoteUrl = data?.images?.[0]?.url;
  if (!remoteUrl) throw new Error("No image returned from Z-Image Turbo edit");
  return { remoteUrl, revisedPrompt: data?.prompt };
}
