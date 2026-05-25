/**
 * Runware API client for video enhancement.
 * Model: topazlabs:starlight-precise@2.5
 * API docs: https://docs.runware.ai
 *
 * Uses submit + poll pattern via the Runware v1 API.
 */

const RUNWARE_API_URL = "https://api.runware.ai/v1";

export interface RunwareVideoEnhanceParams {
  videoUrl: string;
  width: number;
  height: number;
  fps?: number;
  jobId: string;
  publishProgress: (jobId: string, data: any) => Promise<void>;
}

export interface RunwareVideoEnhanceResult {
  videoURL: string;
  cost?: number;
}

/** Submit a video upscale task to Runware and poll until completion. */
export async function runwareVideoEnhance(opts: RunwareVideoEnhanceParams): Promise<RunwareVideoEnhanceResult> {
  const apiKey = process.env.RUNWARE_API_KEY;
  if (!apiKey) throw new Error("RUNWARE_API_KEY not set");

  const { randomUUID } = await import("crypto");
  const taskUUID = randomUUID();

  const task: Record<string, unknown> = {
    taskType: "upscale",
    taskUUID,
    model: "topazlabs:starlight-precise@2.5",
    width: opts.width,
    height: opts.height,
    includeCost: true,
    deliveryMethod: "async",
    inputs: { video: opts.videoUrl },
  };
  if (opts.fps && opts.fps >= 15) task.fps = opts.fps;

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

  // Submit
  const submitRes = await fetch(RUNWARE_API_URL, { method: "POST", headers, body: JSON.stringify([task]) });
  const submitData = await submitRes.json() as any;
  if (submitData.errors?.length) throw new Error(`Runware submit: ${JSON.stringify(submitData.errors)}`);
  console.log("[runware] submitted taskUUID=%s w=%d h=%d fps=%s", taskUUID, opts.width, opts.height, opts.fps ?? "original");

  // Poll
  const maxWaitMs = 60 * 60 * 1000;
  const pollMs = 10_000;
  const startedMs = Date.now();

  while (Date.now() - startedMs < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollMs));

    const pollRes = await fetch(RUNWARE_API_URL, { method: "POST", headers, body: JSON.stringify([{ taskType: "getResponse", taskUUID }]) });
    const pollData = await pollRes.json() as any;
    const item = pollData.data?.[0];

    if (item?.videoURL) {
      console.log("[runware] done cost=$%s url=%s", item.cost, item.videoURL);
      return { videoURL: item.videoURL, cost: item.cost };
    }
    if (item?.status === "failed") throw new Error(`Runware task failed: ${JSON.stringify(item)}`);

    if (pollData.errors?.length) {
      const fatal = pollData.errors.find((e: any) => e.code !== "taskNotFound" && e.code !== "taskStillProcessing");
      if (fatal) throw new Error(`Runware error: ${JSON.stringify(pollData.errors)}`);
    }

    await opts.publishProgress(opts.jobId, { status: "RUNNING", stage: "RUNWARE_QUEUE" });
  }
  throw new Error("Runware timed out after 60 minutes");
}

// ── ByteDance Video Upscaler (bytedance:50@1) ──

export interface RunwareBytedanceUpscaleParams {
  videoUrl: string;
  jobId: string;
  publishProgress: (jobId: string, data: any) => Promise<void>;
}

/** Submit a ByteDance video upscale task to Runware and poll until completion. */
export async function runwareBytedanceUpscale(opts: RunwareBytedanceUpscaleParams): Promise<RunwareVideoEnhanceResult> {
  const apiKey = process.env.RUNWARE_API_KEY;
  if (!apiKey) throw new Error("RUNWARE_API_KEY not set");

  const { randomUUID } = await import("crypto");
  const taskUUID = randomUUID();

  const task: Record<string, unknown> = {
    taskType: "upscale",
    taskUUID,
    model: "bytedance:50@1",
    inputs: { video: opts.videoUrl },
    outputFormat: "MP4",
    includeCost: true,
    deliveryMethod: "async",
  };

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

  // Submit
  const submitRes = await fetch(RUNWARE_API_URL, { method: "POST", headers, body: JSON.stringify([task]) });
  const submitData = await submitRes.json() as any;
  if (submitData.errors?.length) throw new Error(`Runware ByteDance submit: ${JSON.stringify(submitData.errors)}`);
  console.log("[runware-bytedance] submitted taskUUID=%s url=%s", taskUUID, opts.videoUrl.slice(0, 80));

  // Poll
  const maxWaitMs = 60 * 60 * 1000;
  const pollMs = 10_000;
  const startedMs = Date.now();

  while (Date.now() - startedMs < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollMs));

    const pollRes = await fetch(RUNWARE_API_URL, { method: "POST", headers, body: JSON.stringify([{ taskType: "getResponse", taskUUID }]) });
    const pollData = await pollRes.json() as any;
    const item = pollData.data?.[0];

    if (item?.videoURL) {
      console.log("[runware-bytedance] done cost=$%s url=%s", item.cost, item.videoURL);
      return { videoURL: item.videoURL, cost: item.cost };
    }
    if (item?.status === "failed") throw new Error(`Runware ByteDance task failed: ${JSON.stringify(item)}`);

    if (pollData.errors?.length) {
      const fatal = pollData.errors.find((e: any) => e.code !== "taskNotFound" && e.code !== "taskStillProcessing");
      if (fatal) throw new Error(`Runware ByteDance error: ${JSON.stringify(pollData.errors)}`);
    }

    await opts.publishProgress(opts.jobId, { status: "RUNNING", stage: "RUNWARE_QUEUE" });
  }
  throw new Error("Runware ByteDance timed out after 60 minutes");
}
