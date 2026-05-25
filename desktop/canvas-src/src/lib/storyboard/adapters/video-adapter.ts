import { join } from "path";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import { probeVideo, validateVideoConstraints } from "../video-segmenter";
import { extractFrames } from "../video-frame-extractor";
import {
  normalizeLlmShotsToRows,
  extractJsonValue,
  coerceLlmPayload,
} from "../schema";
import { STORYBOARD_SKILL_PROMPT } from "../storyboard-skill";
import type { ShotRow } from "@/types/storyboard";
import type { StoryboardParseModelId } from "../parse-models";
import { getOpenRouterConfig } from "@/lib/openrouter";

const UPLOAD_DIR = join(process.cwd(), "data", "uploads");
const MAX_COMPOSE_GUIDE_CHARS = 6000;

export interface VideoParseProgress {
  phase: "probing" | "analyzing" | "extracting" | "done";
  current?: number;
  total?: number;
}

async function resolveVideoFile(
  videoUrl: string,
): Promise<{ localPath: string; isTemp: boolean }> {
  if (videoUrl.startsWith("/api/files/")) {
    const relPath = videoUrl.replace("/api/files/", "");
    return { localPath: join(UPLOAD_DIR, relPath), isTemp: false };
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  const tmpName = `sb-tmp-${randomUUID()}.mp4`;
  const tmpPath = join(UPLOAD_DIR, tmpName);

  const res = await fetch(videoUrl, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(tmpPath, buf);

  return { localPath: tmpPath, isTemp: true };
}

function buildNativeVideoPrompt(
  maxShots?: number,
  composeGuide?: string,
  locale: "en" | "zh" = "en",
) {
  const isZh = locale === "zh";
  const shotInstruction =
    maxShots != null && maxShots > 0
      ? isZh
        ? `将视频精确拆分为 ${maxShots} 个分镜。`
        : `Split the video into exactly ${maxShots} shots.`
      : isZh
        ? "根据画面内容的场景切换、运镜变化和叙事节拍，自动判断最佳分镜数量和切分点。"
        : "Determine the optimal number of shots from scene changes, camera transitions, and narrative rhythm.";
  const guide = composeGuide?.trim().slice(0, MAX_COMPOSE_GUIDE_CHARS);
  const guideBlock = guide
    ? isZh
      ? `\n导演规划上下文（除非与素材冲突，否则必须遵循）：\n${guide}\n`
      : `\nDirector planning context (must follow unless it conflicts with source footage):\n${guide}\n`
    : "";

  if (isZh) {
    return `${STORYBOARD_SKILL_PROMPT}
## 任务

你是一位专业的影视分镜师。请分析用户提供的视频，将其拆解为分镜表。
${guideBlock}

${shotInstruction}

每个分镜必须包含精确的起止时间戳（秒）。时间戳应对齐实际的画面转场、镜头切换或显著内容变化。

返回 JSON 对象（不要 markdown 代码块）：
{"shots":[{
  "startS": number,
  "endS": number,
  "visualDescription": "画面描述",
  "contentDescription": "叙事功能",
  "shotSize": "景别(特写/近景/中景/全景/远景)",
  "cameraNote": "运镜",
  "sceneTag": "场景标签",
  "characterName": "角色名",
  "characterDescription": "角色外貌",
  "characterAction": "角色动作",
  "emotion": "情绪/氛围",
  "lightingAtmosphere": "光影氛围",
  "soundEffect": "音效设计",
  "dialogue": "对白/旁白",
  "imagePrompt": "AI生图提示词(中文，重建该画面)",
  "videoMotionPrompt": "AI生视频提示词(中文，包含运镜与动态)"
}]}

规则：
- 分镜按时间顺序排列，不得有间隙或重叠。
- 第 N+1 镜的 startS 必须等于第 N 镜的 endS。
- 首镜 startS = 0，末镜 endS = 视频总时长。
- visualDescription 和 contentDescription 必填。
- 所有字段（包括 imagePrompt 和 videoMotionPrompt）都使用中文输出。
- imagePrompt 末尾必须追加 "'分镜N' in the top-left corner"，并追加 "No timecode, no subtitles." 保持画面干净。`;
  }

  return `${STORYBOARD_SKILL_PROMPT}
## Task

You are a professional storyboard artist. Analyze the user video and break it into a structured shot list.
${guideBlock}

${shotInstruction}

Each shot must include accurate start/end timestamps in seconds, aligned to real cuts, transitions, or major visual changes.

Return a JSON object only (no markdown fences):
{"shots":[{
  "startS": number,
  "endS": number,
  "visualDescription": "visual description",
  "contentDescription": "narrative function",
  "shotSize": "shot size (CU/MCU/MS/FS/LS/ELS)",
  "cameraNote": "camera movement",
  "sceneTag": "scene tag",
  "characterName": "character name",
  "characterDescription": "character appearance",
  "characterAction": "character action",
  "emotion": "emotion/mood",
  "lightingAtmosphere": "lighting atmosphere",
  "soundEffect": "sound design",
  "dialogue": "dialogue/voiceover",
  "imagePrompt": "AI image prompt (English, recreate the shot)",
  "videoMotionPrompt": "AI video prompt (English, includes camera and motion)"
}]}

Rules:
- Keep shots in timeline order with no gaps or overlaps.
- startS of shot N+1 must equal endS of shot N.
- First shot startS = 0; last shot endS = full video duration.
- visualDescription and contentDescription are required.
- Use English for every field, including imagePrompt and videoMotionPrompt.
- imagePrompt must end with "'Shot N' in the top-left corner" and append "No timecode, no subtitles."`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Send video natively to Gemini for intelligent scene analysis,
 * then extract thumbnail frames at the timestamps Gemini chose.
 */
export async function parseVideoToShots(
  videoUrl: string,
  modelId: StoryboardParseModelId,
  maxShots?: number,
  composeGuide?: string,
  locale: "en" | "zh" = "en",
  onProgress?: (progress: VideoParseProgress) => void | Promise<void>,
): Promise<ShotRow[]> {
  await onProgress?.({ phase: "probing" });
  const { localPath, isTemp } = await resolveVideoFile(videoUrl);

  try {
    const meta = probeVideo(localPath);
    validateVideoConstraints(meta);
    console.log(
      `[video-adapter] probe: ${meta.durationS.toFixed(1)}s ${meta.width}x${meta.height} ${meta.fps.toFixed(0)}fps ${meta.codec}`,
    );

    // ── Send entire video to Gemini for native understanding ──
    await onProgress?.({ phase: "analyzing" });
    const videoBuf = await readFile(localPath);
    const ext = localPath.split(".").pop()?.toLowerCase() ?? "mp4";
    const mimeMap: Record<string, string> = {
      mp4: "video/mp4",
      webm: "video/webm",
      mkv: "video/x-matroska",
      mov: "video/quicktime",
    };
    const mime = mimeMap[ext] || "video/mp4";
    const dataUri = `data:${mime};base64,${videoBuf.toString("base64")}`;

    console.log(
      `[video-adapter] sending ${(videoBuf.length / 1024 / 1024).toFixed(1)}MB video to ${modelId}…`,
    );

    const { url, headers } = getOpenRouterConfig();

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: buildNativeVideoPrompt(maxShots, composeGuide, locale) },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUri } },
              { type: "text", text: locale === "zh" ? "请分析这段视频并生成分镜表。" : "Analyze this video and generate a storyboard shot list." },
            ],
          },
        ],
        stream: false,
        temperature: 0.3,
        max_tokens: 24576,
      }),
      signal: AbortSignal.timeout(600_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `Video VLM failed (${res.status}): ${errText.slice(0, 500)}`,
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const text = data?.choices?.[0]?.message?.content ?? "";
    if (!String(text).trim()) throw new Error("Empty response from model");

    let json: unknown;
    try {
      json = coerceLlmPayload(extractJsonValue(String(text)));
    } catch {
      throw new Error("Could not parse JSON from model response");
    }

    // Extract timestamps before normalization (schema doesn't include startS/endS)
    const rawPayload = json as {
      shots?: Array<Record<string, unknown>>;
    };
    const rawTimestamps = (rawPayload?.shots ?? []).map((s) => ({
      startS: typeof s.startS === "number" ? s.startS : undefined,
      endS: typeof s.endS === "number" ? s.endS : undefined,
    }));

    const rows = normalizeLlmShotsToRows(json);

    for (let i = 0; i < rows.length; i++) {
      const ts = rawTimestamps[i];
      if (ts?.startS != null) rows[i].startS = round2(ts.startS);
      if (ts?.endS != null) rows[i].endS = round2(ts.endS);
      if (ts?.startS != null && ts?.endS != null) {
        rows[i].durationS = round2(ts.endS - ts.startS);
      }
    }

    // ── Extract thumbnail frames at Gemini's chosen timestamps ──
    const shotsWithTime = rows.filter((r) => r.startS != null);
    if (shotsWithTime.length > 0) {
      await onProgress?.({ phase: "extracting", current: 0, total: shotsWithTime.length });
      const timestamps = rows
        .map((r, i) => ({
          index: i,
          timestampS:
            r.startS != null && r.endS != null
              ? round2((r.startS + r.endS) / 2)
              : (r.startS ?? 0),
        }))
        .filter((t) => t.timestampS >= 0);

      const frames = await extractFrames(
        localPath,
        timestamps,
        (cur, tot) =>
          void onProgress?.({ phase: "extracting", current: cur, total: tot }),
      );

      for (const frame of frames) {
        if (rows[frame.segmentIndex]) {
          const existing = rows[frame.segmentIndex].thumbnailUrls ?? [];
          rows[frame.segmentIndex].thumbnailUrls = [...existing, frame.servePath];
        }
      }
    }

    await onProgress?.({ phase: "done" });
    return rows;
  } finally {
    if (isTemp) await unlink(localPath).catch(() => {});
  }
}
