/**
 * Sanitize & localize user-facing text: strip internal provider names, model IDs,
 * token usage details, and translate known patterns based on locale.
 *
 * Used in: billing ledger API, job SSE, job recover, text route, etc.
 */

export type UserLocale = "zh" | "en";

// ── Internal model ID → user-friendly display name ──
const INTERNAL_MODEL_TO_DISPLAY: Record<string, string> = {
  "gemini-3.1-pro-preview-thinking-high": "Gemini 3.1 Pro",
  "gemini-2.5-flash-preview-05-20": "Gemini 2.5 Flash",
  "gemini-2.5-flash-thinking": "Gemini 2.5 Flash",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-3.1-pro": "Gemini 3.1 Pro",
  "nano-banana-pro": "Nano Banana Pro",
  "nano-banana-2": "Nano Banana 2",
  "gpt-image-2": "GPT Image 2",
  "gpt-image-2-lite": "GPT Image 2 Lite",
  "grok-imagine": "Grok Imagine",
  "z-image-turbo": "Z Image Turbo",
  "wan-2.7": "Wan 2.7",
  "wan-2.7-video": "Wan 2.7 Video",
  "doubao-seedream-4-5-251128": "Seedream 4.5",
  "doubao-seedream-5-0-260128": "Seedream 5.0",
  "gpt-5.5": "ChatGPT 5.5",
  "seedance": "Seedance",
  "seedance-2": "Seedance 2",
  "seedance-2-fast": "Seedance 2 Fast",
};

// ── Regex patterns for stripping ──
const PROVIDER_NAMES_RE = /\b(T8Star|t8star|T8STAR|KIE|kie|Duomi|duomi|DUOMI|OpenCrow|opencrow|OPENCROW|AtlasCloud|atlascloud|fal\.ai|fal-ai|openrouter|OpenRouter|Runware|runware)\b/gi;
const TOKEN_DETAILS_RE = /\d+in\/\d+out\s*→?\s*\d+\s*Xins?/gi;
const LLM_PREFIX_RE = /^LLM\s+(token billing|prompts?|extract-assets?|generate):?\s*/i;
const PRE_DEBIT_RE = /\s*\(pre-debit\)\s*/gi;
const API_KEY_RE = /API key[s]?\s*(not configured|is not configured|missing)/gi;
const NO_ADAPTER_RE = /No adapter for model:\s*\S+/gi;

// ── Locale-aware phrase translations (ordered longest-first to avoid partial matches) ──
const PHRASE_ZH: [string | RegExp, string][] = [
  // Refund / error descriptions (longest first)
  ["Video generation failed — full refund", "视频生成失败 — 全额退款"],
  ["Audio generation failed — full refund", "音频生成失败 — 全额退款"],
  ["Video enhance failed — full refund", "视频增强失败 — 全额退款"],
  ["Marketing video failed — full refund", "营销视频失败 — 全额退款"],
  ["Generation failed — full refund", "生成失败 — 全额退款"],
  ["Video edit failed — full refund", "视频编辑失败 — 全额退款"],
  ["Enhance failed — full refund", "增强失败 — 全额退款"],
  ["Outpaint failed — full refund", "扩图失败 — 全额退款"],
  ["RemoveBG failed — full refund", "去背景失败 — 全额退款"],
  ["Source image error — full refund", "源图片错误 — 全额退款"],
  ["Edit failed — full refund", "编辑失败 — 全额退款"],
  [/Video \w+ failed — full refund/g, "视频操作失败 — 全额退款"],
  ["Partial refund", "部分退款"],
  ["Text LLM stream error", "文本生成异常"],
  ["Text LLM failed", "文本生成失败"],
  ["Service temporarily unavailable", "服务暂时不可用"],
  ["Model unavailable", "模型不可用"],
  ["No response body", "服务无响应"],
  // Debit descriptions (prefix translations)
  ["Topaz video enhance", "视频增强"],
  ["Topaz enhance", "图片增强"],
  ["Image generation", "图片生成"],
  ["Video generation", "视频生成"],
  ["Text generation", "文本生成"],
  ["Video edit", "视频编辑"],
  ["Remove BG", "去背景"],
  ["Outpaint", "扩图"],
  ["Storyboard generate", "分镜生成"],
  ["Storyboard prompts", "分镜提示词"],
  ["Storyboard parse", "分镜解析"],
  ["Asset extraction", "资产提取"],
  ["Marketing Studio", "营销工作室"],
  ["Generation", "生成"],
  // Misc
  ["full refund", "全额退款"],
  [/(\d+)\/(\d+) failed/g, "$1/$2 失败"],
];

/** Detect locale from Referer header (path contains /zh/ or /en/) */
export function detectLocaleFromReferer(referer: string | null): UserLocale {
  if (!referer) return "en";
  try {
    const url = new URL(referer);
    const firstSeg = url.pathname.split("/")[1];
    if (firstSeg === "zh") return "zh";
  } catch { /* ignore malformed referer */ }
  return "en";
}

/** Sanitize and optionally localize a single string */
export function sanitizeForUser(text: string | null | undefined, locale?: UserLocale): string | null {
  if (!text) return text as null;
  let s = text;
  // Replace internal model IDs with display names
  for (const [internal, display] of Object.entries(INTERNAL_MODEL_TO_DISPLAY)) {
    s = s.replaceAll(internal, display);
  }
  // Strip provider names
  s = s.replace(PROVIDER_NAMES_RE, "");
  // Strip token usage details
  s = s.replace(TOKEN_DETAILS_RE, "");
  // Clean up LLM internal prefixes
  s = s.replace(LLM_PREFIX_RE, "");
  // Strip "(pre-debit)" marker
  s = s.replace(PRE_DEBIT_RE, "");
  // Replace API key messages with generic text
  s = s.replace(API_KEY_RE, "Service temporarily unavailable");
  // Replace adapter messages
  s = s.replace(NO_ADAPTER_RE, "Model unavailable");
  // Collapse multiple spaces/dashes/colons left behind
  s = s.replace(/\s{2,}/g, " ").replace(/—\s*—/g, "—").replace(/:\s*$/g, "").trim();
  // Locale-aware phrase translation
  if (locale === "zh") {
    for (const [pattern, replacement] of PHRASE_ZH) {
      if (typeof pattern === "string") {
        s = s.replaceAll(pattern, replacement);
      } else {
        s = s.replace(pattern, replacement);
      }
    }
  }
  return s || null;
}

/** Sanitize the `error` field inside a data object (if present) */
export function sanitizeErrorField<T extends Record<string, unknown>>(data: T, locale?: UserLocale): T {
  if (typeof data.error === "string") {
    return { ...data, error: sanitizeForUser(data.error, locale) };
  }
  return data;
}
