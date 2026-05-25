import { getFalClient, resolveAndUploadToFal, uploadBlobToFal, resolveFalImageSize } from "./fal-image";
import { resolveUrlsForKie, uploadToKieStorage } from "./kie-image";

export const WAN_IMAGE_MODELS = new Set(["wan-2.7"]);

// ── KIE.ai WAN 2.7 Image adapter ──

const KIE_BASE_URL = "https://api.kie.ai";
const KIE_POLL_INTERVAL_MS = 5_000;
const KIE_MAX_POLL_ATTEMPTS = 120; // 10 minutes
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

function useKieForWan(): boolean {
  return !!process.env.KIE_API_KEY;
}

async function createKieWanImageTask(params: {
  prompt: string;
  quality: string;
  aspectRatio?: string | null;
  inputUrls?: string[];
  onTaskCreated?: (taskId: string) => void;
}): Promise<string> {
  const apiKey = process.env.KIE_API_KEY!;
  const isPro = params.quality === "2K";
  const model = isPro ? "wan/2-7-image-pro" : "wan/2-7-image";

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    n: 1,
    nsfw_checker: false,
    enable_sequential: false,
    thinking_mode: false,
    watermark: false,
    resolution: isPro ? "2K" : "1K",
  };
  if (params.aspectRatio) {
    input.aspect_ratio = params.aspectRatio;
  }
  if (params.inputUrls?.length) {
    input.input_urls = params.inputUrls;
  }

  console.log("[kie-wan-image] creating task model=%s quality=%s refs=%d",
    model, params.quality, params.inputUrls?.length ?? 0);

  const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    const mapped = KIE_ERROR_MAP[String(res.status)] ?? `HTTP ${res.status}`;
    throw new Error(`KIE WAN create task failed (${mapped}): ${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  const taskId = data.data?.taskId ?? data.data?.recordId;
  if (!taskId) {
    throw new Error(`KIE WAN: no taskId in response: ${JSON.stringify(data).slice(0, 500)}`);
  }

  console.log("[kie-wan-image] task created id=%s", taskId);
  params.onTaskCreated?.(taskId);
  return taskId;
}

export async function waitForKieWanImageResult(taskId: string): Promise<string[]> {
  const apiKey = process.env.KIE_API_KEY!;
  let consecutiveErrors = 0;
  let lastErrorMsg = "";

  for (let attempt = 0; attempt < KIE_MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        const mapped = KIE_ERROR_MAP[String(res.status)] ?? `HTTP ${res.status}`;
        throw new Error(`KIE poll ${mapped}`);
      }
      const data = await res.json();
      const state = (data.data?.state ?? "").toLowerCase();
      consecutiveErrors = 0;

      if (state === "success" || state === "succeeded" || state === "completed") {
        const resultJson = typeof data.data.resultJson === "string"
          ? JSON.parse(data.data.resultJson)
          : data.data.resultJson;
        const urls: string[] = resultJson?.resultUrls ?? [];
        if (!urls.length) throw new Error("KIE WAN task succeeded but no result URLs");
        console.log("[kie-wan-image] task=%s succeeded urls=%d", taskId, urls.length);
        return urls;
      }

      if (state === "fail" || state === "failed") {
        const failCode = data.data?.failCode ?? "";
        const failMsg = data.data?.failMsg ?? "Unknown failure";
        const mapped = KIE_ERROR_MAP[failCode] ?? "";
        throw new Error(`KIE WAN task failed${mapped ? ` (${mapped})` : ""}: ${failMsg.slice(0, 500)}`);
      }

      if (attempt % 6 === 0) {
        console.log("[kie-wan-image] task=%s poll #%d state=%s", taskId, attempt + 1, state);
      }
    } catch (err: any) {
      if (err.message?.includes("task failed") || err.message?.includes("task succeeded")) throw err;
      lastErrorMsg = err.message ?? "Unknown error";
      consecutiveErrors++;
      console.log("[kie-wan-image] poll task=%s attempt=%d error=%s consecutive=%d",
        taskId, attempt, lastErrorMsg.slice(0, 200), consecutiveErrors);
      if (consecutiveErrors >= KIE_MAX_CONSECUTIVE_ERRORS) {
        throw new Error(`KIE WAN poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg.slice(0, 500)})`);
      }
    }

    await new Promise((r) => setTimeout(r, KIE_POLL_INTERVAL_MS));
  }

  throw new Error(`KIE WAN task ${taskId} timed out after ${KIE_MAX_POLL_ATTEMPTS} attempts`);
}

// ── fal.ai error helper ──

function parseFalError(err: any): string {
  if (err.body?.detail) {
    const details = Array.isArray(err.body.detail) ? err.body.detail : [err.body.detail];
    for (const d of details) {
      if (d.type === "content_policy_violation") {
        return "Content policy violation: the prompt or reference image was flagged by the content checker.";
      }
    }
    const first = details[0];
    if (typeof first === "object" && first.msg) return first.msg;
    if (typeof first === "string") return first;
  }
  return err.message ?? "Unknown error";
}

// ── Public API ──

export interface WanImageResult {
  remoteUrl: string;
  revisedPrompt?: string;
}

export interface WanImageGenParams {
  prompt: string;
  ratio: string | null;
  quality: string;
  referenceImages?: string[];
  onTaskCreated?: (taskId: string, provider: string) => void;
}

export async function callWanImageGeneration(params: WanImageGenParams): Promise<WanImageResult> {
  const { prompt, ratio, quality, referenceImages, onTaskCreated } = params;
  const hasRefImages = referenceImages && referenceImages.length > 0;

  // ── KIE.ai route (preferred) ──
  if (useKieForWan()) {
    let inputUrls: string[] | undefined;
    if (hasRefImages) {
      inputUrls = await resolveUrlsForKie(referenceImages!.slice(0, 4));
    }
    const taskId = await createKieWanImageTask({
      prompt,
      quality,
      aspectRatio: ratio,
      inputUrls,
      onTaskCreated: onTaskCreated ? (id) => onTaskCreated(id, "kie-wan-image") : undefined,
    });
    const resultUrls = await waitForKieWanImageResult(taskId);
    return { remoteUrl: resultUrls[0] };
  }

  // ── fal.ai fallback ──
  const fal = await getFalClient();
  const isPro = quality === "2K";

  if (hasRefImages) {
    const resolvedUrls = await Promise.all(
      referenceImages!.slice(0, 4).map((u) => resolveAndUploadToFal(u, fal))
    );
    const endpoint = isPro ? "fal-ai/wan/v2.7/pro/edit" : "fal-ai/wan/v2.7/edit";
    let result;
    try {
      result = await fal.subscribe(endpoint, {
        input: {
          prompt,
          image_urls: resolvedUrls,
          image_size: resolveFalImageSize(ratio),
          num_images: 1,
          output_format: "png",
          enable_safety_checker: false,
        },
      });
    } catch (err: any) {
      throw new Error(parseFalError(err));
    }
    const data = result.data as any;
    const remoteUrl = data?.images?.[0]?.url;
    if (!remoteUrl) throw new Error(`No image returned from Wan 2.7 ${isPro ? "Pro" : ""} edit`);
    return { remoteUrl, revisedPrompt: data?.generated_text };
  }

  const endpoint = isPro ? "fal-ai/wan/v2.7/pro/text-to-image" : "fal-ai/wan/v2.7/text-to-image";
  let result;
  try {
    result = await fal.subscribe(endpoint, {
      input: {
        prompt,
        image_size: resolveFalImageSize(ratio),
        num_images: 1,
        output_format: "png",
        enable_safety_checker: false,
      },
    });
  } catch (err: any) {
    throw new Error(parseFalError(err));
  }
  const data = result.data as any;
  const remoteUrl = data?.images?.[0]?.url;
  if (!remoteUrl) throw new Error(`No image returned from Wan 2.7 ${isPro ? "Pro" : ""}`);
  return { remoteUrl, revisedPrompt: data?.generated_text };
}

export interface WanImageEditParams {
  prompt: string;
  imageBlob: Blob;
  imageName: string;
  quality: string;
}

export async function callWanImageEdit(params: WanImageEditParams): Promise<WanImageResult> {
  const { prompt, imageBlob, imageName, quality } = params;

  // ── KIE.ai route (preferred) ──
  if (useKieForWan()) {
    const ext = imageName.split(".").pop() ?? "png";
    const buf = Buffer.from(await imageBlob.arrayBuffer());
    const kieUrl = await uploadToKieStorage(buf, `wan-edit.${ext}`);
    const taskId = await createKieWanImageTask({
      prompt,
      quality,
      inputUrls: [kieUrl],
    });
    const resultUrls = await waitForKieWanImageResult(taskId);
    return { remoteUrl: resultUrls[0] };
  }

  // ── fal.ai fallback ──
  const fal = await getFalClient();
  const isPro = quality === "2K";
  const uploadedUrl = await uploadBlobToFal(imageBlob, imageName);

  const endpoint = isPro ? "fal-ai/wan/v2.7/pro/edit" : "fal-ai/wan/v2.7/edit";
  let result;
  try {
    result = await fal.subscribe(endpoint, {
      input: {
        prompt,
        image_urls: [uploadedUrl],
        image_size: "square_hd",
        num_images: 1,
        output_format: "png",
        enable_safety_checker: false,
      },
    });
  } catch (err: any) {
    throw new Error(parseFalError(err));
  }
  const data = result.data as any;
  const remoteUrl = data?.images?.[0]?.url;
  if (!remoteUrl) throw new Error(`No image returned from Wan 2.7 ${isPro ? "Pro" : ""} edit`);
  return { remoteUrl, revisedPrompt: data?.generated_text };
}
