import { ensurePublicUrl } from "./t8star-video";
import { uploadBlobToPublicUrl } from "./t8star-image";
import { getFalClient, resolveAndUploadToFal, uploadBlobToFal } from "./fal-image";
import { resolveUrlsForKie, uploadToKieStorage } from "./kie-image";

/** Extract a meaningful error message from fal.ai errors. */
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

export const GROK_IMAGINE_MODELS = new Set(["grok-imagine"]);

export const GROK_SUPPORTED_RATIOS = new Set([
  "2:1", "20:9", "19.5:9", "16:9", "4:3", "3:2", "1:1",
  "2:3", "3:4", "9:16", "9:19.5", "9:20", "1:2",
]);

export interface GrokImagineResult {
  remoteUrl: string;
  remoteUrls?: string[];
  revisedPrompt?: string;
}

// ── KIE.ai Grok Imagine adapter ──

const KIE_BASE_URL = "https://api.kie.ai";
const KIE_POLL_INTERVAL_MS = 5_000;
const KIE_MAX_POLL_ATTEMPTS = 120; // 10 minutes
const KIE_MAX_CONSECUTIVE_ERRORS = 10;

function useKieForGrokImagine(): boolean {
  return !!process.env.KIE_API_KEY;
}

async function createKieGrokImagineTask(params: {
  prompt: string;
  aspectRatio?: string;
  imageUrls?: string[];
  enablePro?: boolean;
}): Promise<string> {
  const apiKey = process.env.KIE_API_KEY!;
  const hasImages = params.imageUrls && params.imageUrls.length > 0;
  const model = hasImages ? "grok-imagine/image-to-image" : "grok-imagine/text-to-image";

  const input: Record<string, unknown> = { prompt: params.prompt };
  if (hasImages) {
    input.image_urls = params.imageUrls;
  } else if (params.aspectRatio) {
    input.aspect_ratio = params.aspectRatio;
  }
  if (params.enablePro) {
    input.enable_pro = true;
  }

  console.log("[kie-grok-imagine] creating task model=%s ratio=%s refs=%d pro=%s",
    model, params.aspectRatio ?? "auto", params.imageUrls?.length ?? 0, !!params.enablePro);

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
    throw new Error(`KIE Grok Imagine create task failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const taskId = data.data?.taskId ?? data.data?.recordId;
  if (!taskId) {
    throw new Error(`KIE Grok Imagine: no taskId in response: ${JSON.stringify(data).slice(0, 500)}`);
  }

  console.log("[kie-grok-imagine] task created id=%s", taskId);
  return taskId;
}

async function pollKieGrokImagineTask(taskId: string): Promise<{ imageUrls: string[]; status: string; errorMessage: string }> {
  const apiKey = process.env.KIE_API_KEY!;
  const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`KIE Grok Imagine poll failed (${res.status}): ${errText.slice(0, 2000)}`);
  }

  const data = await res.json();
  const record = data.data ?? {};
  const rawState = (record.state ?? "unknown").toLowerCase();

  let imageUrls: string[] = [];
  if (record.resultJson) {
    try {
      const result = typeof record.resultJson === "string" ? JSON.parse(record.resultJson) : record.resultJson;
      const urls = result.resultUrls ?? result.result_urls ?? [];
      imageUrls = Array.isArray(urls) ? urls : [];
    } catch {
      console.warn("[kie-grok-imagine] failed to parse resultJson:", record.resultJson);
    }
  }

  let status: string;
  if (rawState === "success" || rawState === "succeeded" || rawState === "completed") {
    status = "succeeded";
  } else if (rawState === "waiting" || rawState === "running" || rawState === "processing" || rawState === "queued" || rawState === "pending") {
    status = "running";
  } else {
    status = "failed";
  }

  const errorMessage = record.failMsg ?? "";
  if (status !== "running") {
    console.log("[kie-grok-imagine] poll task=%s state=%s urls=%d", taskId, status, imageUrls.length);
  }

  return { imageUrls, status, errorMessage };
}

async function waitForKieGrokImagineResult(taskId: string): Promise<string[]> {
  let consecutiveErrors = 0;
  let lastErrorMsg = "";

  for (let attempt = 1; attempt <= KIE_MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const { imageUrls, status, errorMessage } = await pollKieGrokImagineTask(taskId);
      consecutiveErrors = 0;

      if (status === "succeeded") {
        if (imageUrls.length === 0) throw new Error("KIE Grok Imagine task succeeded but no image URLs");
        console.log("[kie-grok-imagine] task=%s succeeded urls=%d (attempt %d)", taskId, imageUrls.length, attempt);
        return imageUrls;
      }

      if (status === "failed") {
        throw new Error(`KIE Grok Imagine task failed: ${errorMessage || "unknown error"}`);
      }
    } catch (err: any) {
      if (err.message?.includes("task failed") || err.message?.includes("task succeeded")) throw err;
      lastErrorMsg = err.message ?? "Unknown error";
      consecutiveErrors++;
      console.log("[kie-grok-imagine] poll task=%s attempt=%d error=%s consecutive=%d", taskId, attempt, lastErrorMsg.slice(0, 200), consecutiveErrors);
      if (consecutiveErrors >= KIE_MAX_CONSECUTIVE_ERRORS) {
        throw new Error(`KIE Grok Imagine poll failed: ${consecutiveErrors} consecutive errors (last: ${lastErrorMsg.slice(0, 500)})`);
      }
    }

    await new Promise((r) => setTimeout(r, KIE_POLL_INTERVAL_MS));
  }

  throw new Error(`KIE Grok Imagine task ${taskId} timed out after ${KIE_MAX_POLL_ATTEMPTS} attempts`);
}

// ── Public API ──

export interface GrokImagineGenParams {
  prompt: string;
  ratio: string | null;
  referenceImages?: string[];
  enablePro?: boolean;
}

/**
 * T2I / I2I(with refs) via KIE.ai (preferred) or fal.ai (fallback).
 */
export async function callGrokImagineGeneration(params: GrokImagineGenParams): Promise<GrokImagineResult> {
  const { prompt, ratio, referenceImages, enablePro } = params;
  const hasRefImages = referenceImages && referenceImages.length > 0;

  // ── KIE.ai route (preferred) ──
  if (useKieForGrokImagine()) {
    const grokRatio = ratio && GROK_SUPPORTED_RATIOS.has(ratio) ? ratio : "1:1";
    let imageUrls: string[] | undefined;
    if (hasRefImages) {
      imageUrls = await resolveUrlsForKie(referenceImages!);
    }
    const taskId = await createKieGrokImagineTask({
      prompt,
      aspectRatio: hasRefImages ? undefined : grokRatio,
      imageUrls,
      enablePro,
    });
    const resultUrls = await waitForKieGrokImagineResult(taskId);
    return { remoteUrl: resultUrls[0], remoteUrls: resultUrls.length > 1 ? resultUrls : undefined };
  }

  // ── fal.ai fallback ──
  const fal = await getFalClient();

  if (hasRefImages) {
    const resolvedUrls = await Promise.all(
      referenceImages!.map((url) => resolveAndUploadToFal(url, fal)),
    );
    let result;
    try {
      result = await fal.subscribe("xai/grok-imagine-image/edit", {
        input: {
          prompt,
          image_urls: resolvedUrls.slice(0, 3),
          num_images: 1,
          output_format: "png",
          sync_mode: true,
        },
      });
    } catch (err: any) {
      throw new Error(parseFalError(err));
    }
    const data = result.data as any;
    const remoteUrl = data?.images?.[0]?.url;
    if (!remoteUrl) throw new Error("No image returned from Grok Imagine");
    return { remoteUrl, revisedPrompt: data?.revised_prompt };
  }

  const grokRatio = ratio && GROK_SUPPORTED_RATIOS.has(ratio) ? ratio : "1:1";
  let result;
  try {
    result = await fal.subscribe("xai/grok-imagine-image", {
      input: {
        prompt,
        aspect_ratio: grokRatio,
        num_images: 1,
        output_format: "png",
        sync_mode: true,
      },
    });
  } catch (err: any) {
    throw new Error(parseFalError(err));
  }
  const data = result.data as any;
  const remoteUrl = data?.images?.[0]?.url;
  if (!remoteUrl) throw new Error("No image returned from Grok Imagine");
  return { remoteUrl, revisedPrompt: data?.revised_prompt };
}

export interface GrokImagineEditParams {
  prompt: string;
  imageBlob: Blob;
  imageName: string;
  enablePro?: boolean;
}

/**
 * I2I (image edit) via KIE.ai (preferred) or fal.ai (fallback).
 */
export async function callGrokImagineEdit(params: GrokImagineEditParams): Promise<GrokImagineResult> {
  const { prompt, imageBlob, imageName, enablePro } = params;

  // ── KIE.ai route (preferred) ──
  if (useKieForGrokImagine()) {
    const ext = imageName.split(".").pop() ?? "png";
    const buf = Buffer.from(await imageBlob.arrayBuffer());
    const kieUrl = await uploadToKieStorage(buf, `edit.${ext}`);
    const taskId = await createKieGrokImagineTask({
      prompt,
      imageUrls: [kieUrl],
      enablePro,
    });
    const resultUrls = await waitForKieGrokImagineResult(taskId);
    return { remoteUrl: resultUrls[0], remoteUrls: resultUrls.length > 1 ? resultUrls : undefined };
  }

  // ── fal.ai fallback ──
  const fal = await getFalClient();
  const uploadedUrl = await uploadBlobToFal(imageBlob, imageName);

  let editResult;
  try {
    editResult = await fal.subscribe("xai/grok-imagine-image/edit", {
      input: {
        prompt,
        image_urls: [uploadedUrl],
        num_images: 1,
        output_format: "png",
        sync_mode: true,
      },
    });
  } catch (err: any) {
    throw new Error(parseFalError(err));
  }
  const data = editResult.data as any;
  const remoteUrl = data?.images?.[0]?.url;
  if (!remoteUrl) throw new Error("No image returned from Grok Imagine edit");
  return { remoteUrl, revisedPrompt: data?.revised_prompt };
}
