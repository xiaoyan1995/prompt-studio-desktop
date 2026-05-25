import { normalizeLlmShotsToRows, extractJsonValue, coerceLlmPayload } from "@/lib/storyboard/schema";
import { STORYBOARD_SKILL_PROMPT } from "@/lib/storyboard/storyboard-skill";
import type { StoryboardParseModelId } from "@/lib/storyboard/parse-models";
import { getOpenRouterConfig } from "@/lib/openrouter";
import { join } from "path";
import { readFile } from "fs/promises";

const MAX_IMAGES = 50;
const UPLOAD_DIR = join(process.cwd(), "data", "uploads");
const MAX_COMPOSE_GUIDE_CHARS = 6000;

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
};

function buildSystemPrompt(
  imageCount: number,
  composeGuide?: string,
  locale: "en" | "zh" = "en",
) {
  const isZh = locale === "zh";
  const guide = composeGuide?.trim().slice(0, MAX_COMPOSE_GUIDE_CHARS);
  const guideBlock = guide
    ? `\nDirector planning context (must follow as hard constraints unless impossible):\n${guide}\n`
    : "";

  return `${STORYBOARD_SKILL_PROMPT}
## Task

The user provides ${imageCount} ordered image(s) representing a storyboard or shot sequence. Apply the storyboard principles above to analyze each image.
${guideBlock}
For EACH image, create one shot entry that describes what the viewer sees.

Return ONLY a single JSON object (no markdown fences) with this exact shape:
{"shots":[{
  "visualDescription":"string",
  "contentDescription":"string",
  "shotSize":"string optional",
  "cameraNote":"string optional",
  "sceneTag":"string optional",
  "characterName":"string optional",
  "characterDescription":"string optional",
  "characterAction":"string optional",
  "emotion":"string optional",
  "lightingAtmosphere":"string optional",
  "soundEffect":"string optional",
  "dialogue":"string optional",
  "imagePrompt":"string optional",
  "videoMotionPrompt":"string optional"
}]}

Field guide:
- visualDescription: composition and what the viewer sees in frame.
- contentDescription: narrative beat or purpose of this shot.
- shotSize: shot size (e.g. 特写/近景/中景/全景/远景).
- cameraNote: camera angle and movement cues visible.
- sceneTag: scene or location label.
- characterName: main character visible (if any).
- characterDescription: detailed appearance of the character as seen.
- characterAction: physical actions the character performs.
- emotion: character's emotional state or the shot's mood.
- lightingAtmosphere: lighting and atmosphere.
- soundEffect: inferred sound design.
- dialogue: any visible text or inferred speech.
- imagePrompt: a detailed AI image generation prompt reconstructing this frame.
- videoMotionPrompt: a detailed AI video generation prompt with camera and motion.

Rules:
- One shot per image, in the order the images appear.
- Do not hallucinate content that isn't inferable from the images.
- Respond in ${isZh ? "Chinese" : "English"} for all text fields.
- For imagePrompt: include a shot label at the end — use "${isZh ? "'分镜N' in the top-left corner" : "'Shot N' in the top-left corner"}". Also append "No timecode, no subtitles." to keep the frame clean.`;
}

function buildUserContent(imageUrls: string[]) {
  const parts: Array<{ type: string; image_url?: { url: string }; text?: string }> = [];
  for (const url of imageUrls) {
    parts.push({ type: "image_url", image_url: { url } });
  }
  parts.push({ type: "text", text: `These are ${imageUrls.length} storyboard frames in order. Analyze each and create one shot entry per image.` });
  return parts;
}

async function resolveImageUrlForModel(url: string): Promise<string> {
  if (/^https?:\/\//i.test(url)) return url;

  if (url.startsWith("/api/files/")) {
    const relPath = url.replace("/api/files/", "").split("?")[0];
    if (!relPath || relPath.includes("..")) {
      throw new Error("Invalid local image path");
    }
    const filePath = join(UPLOAD_DIR, relPath);
    const buf = await readFile(filePath);
    const ext = relPath.split(".").pop()?.toLowerCase() ?? "webp";
    const mime = MIME_MAP[ext] ?? "image/webp";
    return `data:${mime};base64,${buf.toString("base64")}`;
  }

  throw new Error(`Unsupported image URL: ${url}`);
}

export async function parseImagesToShots(
  imageUrls: string[],
  modelId: StoryboardParseModelId,
  composeGuide?: string,
  locale: "en" | "zh" = "en",
): Promise<ReturnType<typeof normalizeLlmShotsToRows>> {
  const { url, headers } = getOpenRouterConfig();

  const inputUrls = imageUrls.filter((u) => !!u).slice(0, MAX_IMAGES);
  if (inputUrls.length === 0) {
    throw new Error("No valid image URLs provided");
  }

  const resolved: Array<{ originalUrl: string; modelUrl: string }> = [];
  for (const url of inputUrls) {
    try {
      const modelUrl = await resolveImageUrlForModel(url);
      resolved.push({ originalUrl: url, modelUrl });
    } catch (err) {
      console.warn("[storyboard:image-adapter] skip unreadable image:", url, err);
    }
  }
  if (resolved.length === 0) {
    throw new Error("No readable image sources");
  }

  const modelImageUrls = resolved.map((r) => r.modelUrl);
  const originalImageUrls = resolved.map((r) => r.originalUrl);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: buildSystemPrompt(modelImageUrls.length, composeGuide, locale) },
        { role: "user", content: buildUserContent(modelImageUrls) },
      ],
      stream: false,
      temperature: 0.3,
      max_tokens: 16384,
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Image storyboard parse failed (${res.status}): ${errText.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!String(text).trim()) {
    throw new Error("Empty response from model");
  }

  let json: unknown;
  try {
    json = coerceLlmPayload(extractJsonValue(String(text)));
  } catch {
    throw new Error("Could not parse JSON from model response");
  }

  const rows = normalizeLlmShotsToRows(json);

  for (let i = 0; i < rows.length && i < originalImageUrls.length; i++) {
    rows[i].thumbnailUrls = [originalImageUrls[i]];
  }

  return rows;
}
