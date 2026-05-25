import { readFile } from "fs/promises";
import { join } from "path";
import { z } from "zod";
import { extractJsonValue } from "./schema";
import { STORYBOARD_SKILL_PROMPT } from "./storyboard-skill";
import type { StoryboardParseModelId } from "./parse-models";
import { getOpenRouterConfig } from "@/lib/openrouter";
import type { StoryboardDirectorPlan } from "@/types/storyboard";

const UPLOAD_DIR = join(process.cwd(), "data", "uploads");
const MAX_DIRECTOR_RULES_CHARS = 4000;
const MAX_SCRIPT_CHARS = 48_000;
const MAX_IMAGE_INPUTS = 20;
const MAX_PLAN_LIST_ITEMS = 12;

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
};

const directorPlanSchema = z.object({
  planSummary: z.string().min(1),
  narrativeGoal: z.string().optional(),
  emotionCurve: z.string().optional(),
  visualStyle: z.string().optional(),
  continuityRules: z.array(z.string()).optional(),
  beats: z.array(z.object({
    beat: z.string(),
    intent: z.string().optional(),
  })).optional(),
  riskFlags: z.array(z.string()).optional(),
  recommendedShotCount: z.number().int().min(1).max(120).optional(),
});

function clampText(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function normalizeDirectorPlan(raw: unknown): StoryboardDirectorPlan {
  const parsed = directorPlanSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Invalid director plan JSON shape");
  }

  const continuityRules = (parsed.data.continuityRules ?? [])
    .map((x) => clampText(x, 160))
    .filter(Boolean) as string[];
  const riskFlags = (parsed.data.riskFlags ?? [])
    .map((x) => clampText(x, 160))
    .filter(Boolean) as string[];
  const beats = (parsed.data.beats ?? [])
    .map((b) => ({
      beat: clampText(b.beat, 220) ?? "",
      intent: clampText(b.intent, 220),
    }))
    .filter((b) => !!b.beat);

  return {
    planSummary: clampText(parsed.data.planSummary, 1000) ?? "Storyboard director plan generated.",
    narrativeGoal: clampText(parsed.data.narrativeGoal, 300),
    emotionCurve: clampText(parsed.data.emotionCurve, 300),
    visualStyle: clampText(parsed.data.visualStyle, 300),
    continuityRules: continuityRules.slice(0, MAX_PLAN_LIST_ITEMS),
    beats: beats.slice(0, MAX_PLAN_LIST_ITEMS),
    riskFlags: riskFlags.slice(0, MAX_PLAN_LIST_ITEMS),
    recommendedShotCount: parsed.data.recommendedShotCount,
  };
}

async function resolveLocalOrRemoteDataUri(url: string): Promise<string> {
  if (url.startsWith("/api/files/")) {
    const relPath = url.replace("/api/files/", "").split("?")[0];
    if (!relPath || relPath.includes("..")) {
      throw new Error("Invalid local media path");
    }
    const filePath = join(UPLOAD_DIR, relPath);
    const buf = await readFile(filePath);
    const ext = relPath.split(".").pop()?.toLowerCase() ?? "webp";
    const mime = MIME_MAP[ext] ?? "application/octet-stream";
    return `data:${mime};base64,${buf.toString("base64")}`;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  throw new Error(`Unsupported media URL: ${url}`);
}

async function callDirectorPlanner(
  modelId: StoryboardParseModelId,
  messages: Array<{
    role: "system" | "user";
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }>,
  timeoutMs: number,
): Promise<StoryboardDirectorPlan> {
  const { url, headers } = getOpenRouterConfig();

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: modelId,
      messages,
      stream: false,
      temperature: 0.2,
      max_tokens: 16384,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Director planning failed (${res.status}): ${errText.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = data?.choices?.[0]?.message?.content ?? "";
  if (!String(content).trim()) {
    throw new Error("Director planning returned empty output");
  }

  let json: unknown;
  try {
    json = extractJsonValue(String(content));
  } catch {
    throw new Error("Could not parse director planning JSON");
  }

  return normalizeDirectorPlan(json);
}

function buildDirectorSystemPrompt(
  sourceType: "text" | "images" | "video",
  maxShots?: number,
  directorRules?: string,
) {
  const rulesBlock = clampText(directorRules, MAX_DIRECTOR_RULES_CHARS)
    ? `Director rules from user:\n${clampText(directorRules, MAX_DIRECTOR_RULES_CHARS)}\n`
    : "Director rules from user: none\n";
  const shotConstraint = maxShots
    ? `Recommended shot count must be <= ${maxShots}.`
    : "Choose a reasonable recommended shot count.";

  return `${STORYBOARD_SKILL_PROMPT}
## Task: Director Planning Phase

Source type: ${sourceType}.
${rulesBlock}
Using the storyboard principles above, think about narrative intent, emotional rhythm, visual consistency, and production risk.
Then return ONLY one JSON object (no markdown) with this exact shape:
{
  "planSummary":"string",
  "narrativeGoal":"string optional",
  "emotionCurve":"string optional",
  "visualStyle":"string optional",
  "continuityRules":["string optional"],
  "beats":[{"beat":"string","intent":"string optional"}],
  "riskFlags":["string optional"],
  "recommendedShotCount": number optional
}
Rules:
- Keep planSummary concise but actionable (3-8 sentences).
- continuityRules should be reusable constraints for shot composing.
- beats should describe sequence-level structure.
- ${shotConstraint}
- Use the same language as user content if possible.`;
}

export function directorPlanToComposeGuide(
  plan: StoryboardDirectorPlan | undefined,
  directorRules?: string,
): string | undefined {
  if (!plan && !directorRules?.trim()) return undefined;

  const lines: string[] = [];
  const rules = clampText(directorRules, MAX_DIRECTOR_RULES_CHARS);
  if (rules) {
    lines.push("Director Rules:", rules);
  }
  if (plan) {
    lines.push("Director Plan Summary:", plan.planSummary);
    if (plan.narrativeGoal) lines.push(`Narrative Goal: ${plan.narrativeGoal}`);
    if (plan.emotionCurve) lines.push(`Emotion Curve: ${plan.emotionCurve}`);
    if (plan.visualStyle) lines.push(`Visual Style: ${plan.visualStyle}`);
    if (plan.continuityRules?.length) {
      lines.push("Continuity Rules:");
      for (const rule of plan.continuityRules.slice(0, MAX_PLAN_LIST_ITEMS)) {
        lines.push(`- ${rule}`);
      }
    }
    if (plan.beats?.length) {
      lines.push("Beat Plan:");
      for (const beat of plan.beats.slice(0, MAX_PLAN_LIST_ITEMS)) {
        lines.push(beat.intent ? `- ${beat.beat} (${beat.intent})` : `- ${beat.beat}`);
      }
    }
  }
  return lines.join("\n");
}

export async function buildDirectorPlanFromText(
  text: string,
  modelId: StoryboardParseModelId,
  maxShots?: number,
  directorRules?: string,
): Promise<StoryboardDirectorPlan> {
  const trimmed = text.trim().slice(0, MAX_SCRIPT_CHARS);
  if (!trimmed) throw new Error("Empty text for director planning");

  return callDirectorPlanner(
    modelId,
    [
      { role: "system", content: buildDirectorSystemPrompt("text", maxShots, directorRules) },
      { role: "user", content: trimmed },
    ],
    180_000,
  );
}

export async function buildDirectorPlanFromImages(
  imageUrls: string[],
  modelId: StoryboardParseModelId,
  maxShots?: number,
  directorRules?: string,
): Promise<StoryboardDirectorPlan> {
  const normalized = imageUrls.filter(Boolean).slice(0, MAX_IMAGE_INPUTS);
  if (normalized.length === 0) throw new Error("No images for director planning");

  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  for (const url of normalized) {
    const modelUrl = await resolveLocalOrRemoteDataUri(url);
    content.push({ type: "image_url", image_url: { url: modelUrl } });
  }
  content.push({
    type: "text",
    text: `These are ordered storyboard references (${normalized.length} images). Build a director-level plan before shot composition.`,
  });

  return callDirectorPlanner(
    modelId,
    [
      { role: "system", content: buildDirectorSystemPrompt("images", maxShots, directorRules) },
      { role: "user", content },
    ],
    240_000,
  );
}

export async function buildDirectorPlanFromVideo(
  videoUrl: string,
  modelId: StoryboardParseModelId,
  maxShots?: number,
  directorRules?: string,
): Promise<StoryboardDirectorPlan> {
  const modelUrl = await resolveLocalOrRemoteDataUri(videoUrl);
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: "image_url", image_url: { url: modelUrl } },
    {
      type: "text",
      text: "Analyze this full video and produce a director-level plan before detailed shot composition.",
    },
  ];

  return callDirectorPlanner(
    modelId,
    [
      { role: "system", content: buildDirectorSystemPrompt("video", maxShots, directorRules) },
      { role: "user", content },
    ],
    600_000,
  );
}
