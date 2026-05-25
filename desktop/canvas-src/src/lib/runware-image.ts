// ── Runware API — GPT Image 2 ──
// Runware proxy for OpenAI GPT Image 2 (model: openai:gpt-image@2)
// Uses async delivery + polling (sync times out on 4K).
// Docs: https://runware.ai/docs/models/openai-gpt-image-2

const RUNWARE_API_URL = "https://api.runware.ai/v1";

// Size map — same constraints as OpenAI: min 480, max 3840, step 16
const RUNWARE_SIZE_MAP: Record<string, Record<string, { width: number; height: number }>> = {
  "1K": {
    "1:1": { width: 1024, height: 1024 },
    "4:3": { width: 1024, height: 768 }, "3:4": { width: 768, height: 1024 },
    "3:2": { width: 1536, height: 1024 }, "2:3": { width: 1024, height: 1536 },
    "16:9": { width: 1536, height: 1024 }, "9:16": { width: 1024, height: 1536 },
    "5:4": { width: 1280, height: 1024 }, "4:5": { width: 1024, height: 1280 },
    "21:9": { width: 1344, height: 576 },
    "2:1": { width: 1536, height: 768 }, "1:2": { width: 768, height: 1536 },
  },
  "2K": {
    "1:1": { width: 2048, height: 2048 },
    "4:3": { width: 2560, height: 1920 }, "3:4": { width: 1920, height: 2560 },
    "3:2": { width: 2560, height: 1712 }, "2:3": { width: 1712, height: 2560 },
    "16:9": { width: 2560, height: 1440 }, "9:16": { width: 1440, height: 2560 },
    "5:4": { width: 2560, height: 2048 }, "4:5": { width: 2048, height: 2560 },
    "21:9": { width: 2688, height: 1152 },
    "2:1": { width: 2560, height: 1280 }, "1:2": { width: 1280, height: 2560 },
  },
  "4K": {
    "1:1": { width: 2880, height: 2880 },
    "4:3": { width: 3264, height: 2448 }, "3:4": { width: 2448, height: 3264 },
    "3:2": { width: 3504, height: 2336 }, "2:3": { width: 2336, height: 3504 },
    "16:9": { width: 3840, height: 2160 }, "9:16": { width: 2160, height: 3840 },
    "5:4": { width: 3200, height: 2560 }, "4:5": { width: 2560, height: 3200 },
    "21:9": { width: 3840, height: 1648 },
    "2:1": { width: 3840, height: 1920 }, "1:2": { width: 1920, height: 3840 },
  },
};

function buildRunwareSize(ratio: string | null, quality: string): { width: number; height: number } {
  const qMap = RUNWARE_SIZE_MAP[quality] ?? RUNWARE_SIZE_MAP["1K"];
  if (!ratio) return qMap["1:1"] ?? { width: 1024, height: 1024 };
  return qMap[ratio] ?? qMap["1:1"] ?? { width: 1024, height: 1024 };
}

export function isRunwareConfigured(): boolean {
  return !!process.env.RUNWARE_API_KEY;
}

export interface RunwareGptImage2Result {
  remoteUrl: string;
}

export async function callRunwareGptImage2(params: {
  prompt: string;
  ratio: string | null;
  quality: string;
  outputQuality?: string;
  referenceImages?: string[];
}): Promise<RunwareGptImage2Result> {
  const apiKey = process.env.RUNWARE_API_KEY;
  if (!apiKey) throw new Error("RUNWARE_API_KEY is not configured");

  const { randomUUID } = await import("crypto");
  const taskUUID = randomUUID();
  const size = buildRunwareSize(params.ratio, params.quality);
  const qualityValue = params.outputQuality && ["low", "medium", "high"].includes(params.outputQuality)
    ? params.outputQuality
    : "high";

  const refs = params.referenceImages?.filter(Boolean) ?? [];
  console.log("[runware-gpt-image-2] request w=%d h=%d quality=%s refs=%d", size.width, size.height, qualityValue, refs.length);

  const task: Record<string, unknown> = {
    taskType: "imageInference",
    taskUUID,
    model: "openai:gpt-image@2",
    positivePrompt: params.prompt,
    width: size.width,
    height: size.height,
    outputType: "URL",
    outputFormat: "PNG",
    numberResults: 1,
    includeCost: true,
    deliveryMethod: "async",
    providerSettings: {
      openai: {
        quality: qualityValue,
        moderation: "low",
      },
    },
  };

  if (refs.length > 0) {
    task.inputs = { referenceImages: refs.slice(0, 16) };
  }

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };

  // Submit async
  const submitRes = await fetch(RUNWARE_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify([task]),
    signal: AbortSignal.timeout(30_000),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => "Unknown error");
    throw new Error(`Runware GPT Image 2 submit error ${submitRes.status}: ${errText.slice(0, 500)}`);
  }

  const submitBody = await submitRes.json() as any;
  if (submitBody.errors?.length) {
    throw new Error(`Runware GPT Image 2 submit: ${JSON.stringify(submitBody.errors).slice(0, 500)}`);
  }

  console.log("[runware-gpt-image-2] task submitted taskUUID=%s", taskUUID);

  // Poll for result
  const POLL_INTERVAL_MS = 5_000;
  const MAX_POLL_MS = 10 * 60 * 1000; // 10 min
  const startMs = Date.now();
  let attempt = 0;

  while (Date.now() - startMs < MAX_POLL_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    attempt++;

    const pollRes = await fetch(RUNWARE_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify([{ taskType: "getResponse", taskUUID }]),
      signal: AbortSignal.timeout(15_000),
    });

    const pollBody = await pollRes.json() as any;
    const item = pollBody.data?.[0];

    if (item?.imageURL) {
      console.log("[runware-gpt-image-2] completed attempt=%d cost=$%s url=%s", attempt, item.cost, item.imageURL);
      return { remoteUrl: item.imageURL };
    }

    if (item?.status === "failed") {
      throw new Error(`Runware task failed: ${JSON.stringify(item).slice(0, 500)}`);
    }

    if (pollBody.errors?.length) {
      const fatal = pollBody.errors.find((e: any) => e.code !== "taskNotFound" && e.code !== "taskStillProcessing");
      if (fatal) throw new Error(`Runware poll error: ${JSON.stringify(pollBody.errors).slice(0, 500)}`);
    }

    console.log("[runware-gpt-image-2] poll attempt=%d waiting...", attempt);
  }

  throw new Error("Runware GPT Image 2 timed out after 10 minutes");
}
