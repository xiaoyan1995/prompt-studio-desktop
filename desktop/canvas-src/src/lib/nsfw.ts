import { db } from "./db";
import { logger } from "./logger";

const BLOCKED_KEYWORDS = [
  "nude", "naked", "porn", "xxx", "hentai", "nsfw",
  "sexual", "erotic", "explicit", "genitalia",
  "child abuse", "underage", "lolita",
  "gore", "dismember", "torture",
  "裸体", "色情", "成人", "黄色", "暴力", "血腥",
];

export function quickNsfwCheck(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return BLOCKED_KEYWORDS.some((kw) => lower.includes(kw));
}

async function isLlmNsfwEnabled(): Promise<boolean> {
  try {
    const config = await db.systemConfig.findUnique({ where: { key: "NSFW_LLM_ENABLED" } });
    return (config?.value as any)?.enabled === true;
  } catch {
    return false;
  }
}

async function llmNsfwClassify(prompt: string): Promise<{ blocked: boolean; reason?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { blocked: false };

  try {
    const systemPrompt = `You are a content safety classifier. Analyze the following prompt and determine if it requests generating NSFW, violent, illegal, or otherwise harmful content. 
Respond with ONLY a JSON object: {"safe": true} or {"safe": false, "reason": "brief explanation"}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nPrompt to classify: "${prompt}"` }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 100 },
        }),
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!res.ok) {
      logger.warn({ status: res.status }, "LLM NSFW check failed, allowing prompt");
      return { blocked: false };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { blocked: false };

    const result = JSON.parse(jsonMatch[0]);
    if (result.safe === false) {
      return { blocked: true, reason: result.reason ?? "LLM classified as unsafe" };
    }
    return { blocked: false };
  } catch (error) {
    logger.warn({ error }, "LLM NSFW classification error, allowing prompt");
    return { blocked: false };
  }
}

export async function nsfwPromptPreCheck(prompt: string): Promise<{ blocked: boolean; reason?: string }> {
  // Step 1: Fast keyword check
  if (quickNsfwCheck(prompt)) {
    return { blocked: true, reason: "Prompt contains blocked keywords" };
  }

  // Step 2: LLM classification (if enabled)
  const llmEnabled = await isLlmNsfwEnabled();
  if (llmEnabled) {
    return llmNsfwClassify(prompt);
  }

  return { blocked: false };
}

const NSFW_THRESHOLD_DEFAULT = 0.8;

async function falNsfwDetect(imageUrl: string): Promise<{ nsfw_probability: number }> {
  const { fal } = await import("@fal-ai/client");
  fal.config({ credentials: process.env.FAL_KEY ?? "" });

  const result = await fal.subscribe("fal-ai/imageutils/nsfw", {
    input: { image_url: imageUrl },
    pollInterval: 1000,
  });
  const data = result.data as { nsfw_probability: number };
  return { nsfw_probability: data.nsfw_probability ?? 0 };
}

export async function nsfwUploadCheck(_imageUrl: string): Promise<{ flagged: boolean; reason?: string }> {
  // Disabled: fal.ai NSFW detection costs money and upstream providers already filter
  return { flagged: false };
}

export async function nsfwPostCheck(_assetUrl: string): Promise<{ flagged: boolean; reason?: string }> {
  // Disabled: fal.ai NSFW detection costs money and upstream providers already filter
  return { flagged: false };
}

export async function nsfwSpotCheck(_assetId: string, _assetUrl: string): Promise<void> {
  // Disabled: fal.ai NSFW detection costs money and upstream providers already filter
}
