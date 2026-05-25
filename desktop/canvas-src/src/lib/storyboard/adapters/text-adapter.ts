import { join } from "path";
import { readFile } from "fs/promises";
import { normalizeLlmShotsToRows, extractJsonValue, coerceLlmPayload } from "@/lib/storyboard/schema";
import { STORYBOARD_SKILL_PROMPT } from "@/lib/storyboard/storyboard-skill";
import type { StoryboardParseModelId } from "@/lib/storyboard/parse-models";
import { getOpenRouterConfig } from "@/lib/openrouter";
import type { ShotRow } from "@/types/storyboard";

const MAX_SCRIPT_CHARS = 48_000;
const MAX_COMPOSE_GUIDE_CHARS = 6000;
const MAX_REFERENCE_IMAGES = 20;
const UPLOAD_DIR = join(process.cwd(), "data", "uploads");

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

async function resolveImageToDataUri(url: string): Promise<string | null> {
  try {
    if (url.startsWith("/api/files/")) {
      const rel = url.replace("/api/files/", "");
      const localPath = join(UPLOAD_DIR, rel);
      const buf = await readFile(localPath);
      const ext = rel.split(".").pop()?.toLowerCase() ?? "jpeg";
      const mime = MIME_BY_EXT[ext] || "image/jpeg";
      return `data:${mime};base64,${buf.toString("base64")}`;
    }
    if (/^https?:\/\//i.test(url)) return url;
    return null;
  } catch {
    return null;
  }
}

function buildSystemPrompt(
  maxShots?: number,
  composeGuide?: string,
  refImageCount?: number,
  locale: "en" | "zh" = "en",
) {
  const isZh = locale === "zh";
  const shotConstraint = maxShots
    ? `produce at most ${maxShots} shots.`
    : `decide the appropriate number of shots based on the script content.`;
  const guide = composeGuide?.trim().slice(0, MAX_COMPOSE_GUIDE_CHARS);
  const guideBlock = guide
    ? `\nDirector planning context (must follow as hard constraints unless impossible):\n${guide}\n`
    : "";

  const refImageBlock =
    refImageCount && refImageCount > 0
      ? `\nThe user has provided ${refImageCount} reference image(s) (labeled ref_image_0 through ref_image_${refImageCount - 1}) alongside the script.
For each shot, set "refImageIndices" to an array of 0-based indices of ALL reference images that are visually relevant to that shot.
A shot may reference multiple images (e.g. character reference + environment reference). Multiple shots may reference the same image.
If no reference image is relevant, omit "refImageIndices".
IMPORTANT: Incorporate the visual details from the matched reference images into the shot's visualDescription, characterDescription, lightingAtmosphere, and imagePrompt fields.\n`
      : "";

  return `${STORYBOARD_SKILL_PROMPT}
## Task

Split the user's script or outline into individual shots for a production storyboard table. Apply the storyboard principles above to every decision you make.
${guideBlock}${refImageBlock}
Return ONLY a single JSON object (no markdown fences) with this exact shape:
{"shots":[{
  "visualDescription":"string",
  "contentDescription":"string",
  "durationS":number optional,
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
  "videoMotionPrompt":"string optional"${refImageCount ? ',\n  "refImageIndices":[number] optional' : ""}
}]}

Field guide:
- visualDescription: composition and what the viewer sees in frame.
- contentDescription: narrative beat or story summary for this shot.
- durationS: estimated duration in seconds.
- shotSize: shot size (e.g. 特写/近景/中景/全景/远景, or CU/MCU/MS/FS/LS/ELS).
- cameraNote: camera angle and movement (e.g. 平视/俯拍/仰拍, 推镜/拉镜/跟拍/固定).
- sceneTag: scene or location label.
- characterName: main character in this shot (if any).
- characterDescription: detailed character appearance/costume (reusable across shots with the same character).
- characterAction: specific physical actions the character performs.
- emotion: character's emotional state or the shot's mood.
- lightingAtmosphere: lighting and atmosphere description.
- soundEffect: sound design cues.
- dialogue: spoken lines or inner monologue.
- imagePrompt: a ready-to-use prompt for AI image generation combining composition, character, action, lighting, and style.
- videoMotionPrompt: a ready-to-use prompt for AI video generation describing camera movement, character motion, physics, and timing.${refImageCount ? "\n- refImageIndices: array of 0-based indices of all relevant reference images for this shot (omit if none)." : ""}

Rules:
- Order shots in story order; ${shotConstraint}
- Do not include base64 or data URIs.
- Use ${isZh ? "Chinese" : "English"} for all text fields.
- imagePrompt and videoMotionPrompt should be detailed, self-contained prompts.
- For imagePrompt: include a shot label at the end — use "${isZh ? "'分镜N' in the top-left corner" : "'Shot N' in the top-left corner"}". Also append "No timecode, no subtitles." to keep the frame clean.`;
}

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

/**
 * 将剧本文本解析为 ShotRow[]（经 OpenRouter，Gemini 2.5 Flash / 3.1 Pro）。
 * 可选传入参考图 URL，会以多模态方式发送给 LLM。
 */
export async function parseScriptToShots(
  script: string,
  modelId: StoryboardParseModelId,
  maxShots?: number,
  composeGuide?: string,
  referenceImageUrls?: string[],
  locale: "en" | "zh" = "en",
): Promise<ShotRow[]> {
  const { url, headers } = getOpenRouterConfig();

  const trimmed = script.trim().slice(0, MAX_SCRIPT_CHARS);
  if (!trimmed) {
    throw new Error("Empty script");
  }

  const validRefUrls = (referenceImageUrls ?? [])
    .filter((u) => !!u && (/^https?:\/\//i.test(u) || u.startsWith("/api/files/")))
    .slice(0, MAX_REFERENCE_IMAGES);

  let resolvedRefs: string[] = [];
  if (validRefUrls.length > 0) {
    const resolved = await Promise.all(validRefUrls.map(resolveImageToDataUri));
    resolvedRefs = resolved.filter((u): u is string => u !== null);
    console.log(`[text-adapter] resolved ${resolvedRefs.length}/${validRefUrls.length} reference images`);
  }

  const hasRefs = resolvedRefs.length > 0;
  const systemContent = buildSystemPrompt(
    maxShots,
    composeGuide,
    hasRefs ? resolvedRefs.length : undefined,
    locale,
  );

  let userContent: string | ContentPart[];
  if (hasRefs) {
    const parts: ContentPart[] = resolvedRefs.map((url, i) => ({
      type: "image_url" as const,
      image_url: { url },
    }));
    parts.push({ type: "text" as const, text: trimmed });
    userContent = parts;
  } else {
    userContent = trimmed;
  }

  const timeout = hasRefs ? 180_000 : 120_000;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userContent },
      ],
      stream: false,
      temperature: 0.3,
      max_tokens: 24576,
    }),
    signal: AbortSignal.timeout(timeout),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Storyboard parse failed (${res.status}): ${errText.slice(0, 500)}`);
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

  const rawPayload = json as { shots?: Array<Record<string, unknown>> };
  const rawRefIndicesPerShot = (rawPayload?.shots ?? []).map((s) => {
    if (Array.isArray(s.refImageIndices)) {
      return (s.refImageIndices as unknown[])
        .filter((v): v is number => typeof v === "number" && v >= 0)
    }
    if (typeof s.refImageIndex === "number") return [s.refImageIndex];
    return [];
  });

  if (hasRefs) {
    console.log(`[text-adapter] LLM refImageIndices per shot:`, JSON.stringify(rawRefIndicesPerShot));
  }

  const rows = normalizeLlmShotsToRows(json);

  if (hasRefs) {
    for (let i = 0; i < rows.length; i++) {
      const indices = rawRefIndicesPerShot[i] ?? [];
      const urls = indices
        .filter((idx) => idx >= 0 && idx < validRefUrls.length)
        .map((idx) => validRefUrls[idx]);
      if (urls.length > 0) {
        rows[i].referenceImageUrls = [...new Set(urls)];
      }
    }
    console.log(`[text-adapter] assigned refs:`, rows.map((r, i) => `shot${i+1}=${(r.referenceImageUrls ?? []).length}`).join(', '));
  }

  return rows;
}
