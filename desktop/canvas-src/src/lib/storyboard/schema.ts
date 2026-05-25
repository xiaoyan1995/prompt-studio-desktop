import { z } from "zod";
import type { ShotRow } from "@/types/storyboard";
import {
  STORYBOARD_MAX_DESC_CHARS,
  STORYBOARD_MAX_SHOTS,
  clampShotDescription,
  createEmptyShotRow,
} from "@/types/storyboard";

/** LLM 单行结构（字段名尽量稳定便于 prompt 约束） */
export const llmShotRowSchema = z.object({
  visualDescription: z.string().optional().default(""),
  contentDescription: z.string().optional().default(""),
  durationS: z.number().optional(),
  shotSize: z.string().optional(),
  cameraNote: z.string().optional(),
  sceneTag: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  characterName: z.string().optional(),
  characterDescription: z.string().optional(),
  characterAction: z.string().optional(),
  emotion: z.string().optional(),
  lightingAtmosphere: z.string().optional(),
  soundEffect: z.string().optional(),
  dialogue: z.string().optional(),
  imagePrompt: z.string().optional(),
  videoMotionPrompt: z.string().optional(),
  refImageIndices: z.array(z.number().int().min(0)).optional(),
});

export const llmShotsResponseSchema = z.object({
  shots: z.array(llmShotRowSchema),
});

export type LlmShotRow = z.infer<typeof llmShotRowSchema>;

/**
 * 将 LLM 解析结果规范为 ShotRow[]（补齐 id、shotIndex，截断长度与条数）。
 */
/** 允许模型返回 `{ shots:[] }` 或顶层数组 */
export function coerceLlmPayload(raw: unknown): unknown {
  if (Array.isArray(raw)) return { shots: raw };
  return raw;
}

export function normalizeLlmShotsToRows(raw: unknown): ShotRow[] {
  const parsed = llmShotsResponseSchema.safeParse(coerceLlmPayload(raw));
  if (!parsed.success) {
    throw new Error("Invalid LLM storyboard shape: " + parsed.error.message);
  }
  const shots = parsed.data.shots.slice(0, STORYBOARD_MAX_SHOTS);
  const clampUrl = (u?: string) => {
    const t = u?.trim();
    return t && /^https?:\/\//i.test(t) ? t : undefined;
  };
  const clampShort = (s?: string, max = 120) => s?.slice(0, max) || undefined;

  return shots.map((s, i) => {
    const row = createEmptyShotRow(i + 1);
    return {
      ...row,
      visualDescription: clampShotDescription(s.visualDescription ?? ""),
      contentDescription: clampShotDescription(s.contentDescription ?? ""),
      durationS: typeof s.durationS === "number" && Number.isFinite(s.durationS) ? s.durationS : undefined,
      shotSize: clampShort(s.shotSize, 64),
      cameraNote: s.cameraNote ? clampShotDescription(s.cameraNote) : undefined,
      sceneTag: clampShort(s.sceneTag),
      thumbnailUrl: clampUrl(s.thumbnailUrl),
      characterName: clampShort(s.characterName, 64),
      characterDescription: s.characterDescription ? clampShotDescription(s.characterDescription) : undefined,
      characterAction: s.characterAction ? clampShotDescription(s.characterAction) : undefined,
      emotion: clampShort(s.emotion),
      lightingAtmosphere: s.lightingAtmosphere ? clampShotDescription(s.lightingAtmosphere) : undefined,
      soundEffect: s.soundEffect ? clampShotDescription(s.soundEffect) : undefined,
      dialogue: s.dialogue ? clampShotDescription(s.dialogue) : undefined,
      imagePrompt: s.imagePrompt ? clampShotDescription(s.imagePrompt) : undefined,
      videoMotionPrompt: s.videoMotionPrompt ? clampShotDescription(s.videoMotionPrompt) : undefined,
    };
  });
}

/** 从模型原始文本中抽出 JSON 对象或数组 */
export function extractJsonValue(text: string): unknown {
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) return JSON.parse(obj[0]);
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) return JSON.parse(arr[0]);
  throw new Error("No JSON in model output");
}
