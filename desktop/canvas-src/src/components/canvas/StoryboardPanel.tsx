"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslations, useLocale } from "next-intl";
import { MeteorShowerOverlay } from "@/components/canvas/nodes/MeteorShowerOverlay";
import {
  X,
  FileText,
  Clapperboard,
  Sparkles,
  Atom,
  Package,
  Loader2,
  Check,
  Image as ImageIcon,
  Video,
  Music,
  Upload,
  LayoutGrid,
  Pencil,
  Trash2,
  Send,
  ChevronDown,
  Eye,
  ScrollText,
  ArrowRight,
  RotateCcw,
  History,
  Undo2,
  FolderOpen,
  ChevronLeft,
  Download,
  Aperture,
  Navigation,
  EllipsisVertical,
  ImagePlus,
} from "lucide-react";
import { uploadFile, openFilePicker } from "@/lib/upload-client";
import { showToast } from "@/components/ui/GlobalToast";
import { useCanvasStore } from "@/stores/canvas-store";
import { useAllPricing } from "@/hooks/use-pricing-promo";
import { TEXT_MODELS, GeminiIcon, OpenAIIcon, DeepSeekIcon, IMAGE_MODELS, MODEL_QUALITY_PRICE, ASPECT_RATIOS, GROK_ONLY_RATIOS, ImageModelIcon, AspectRatioIcon, OUTPUT_QUALITY_OPTIONS, OUTPUT_QUALITY_MODELS, useClickOutside } from "./nodes/panel-shared";
import { PromptEditor } from "./nodes/PromptEditor";
import { useReactFlow, type Node } from "@xyflow/react";
import type { NodeData, NodeType } from "@/types/canvas";

/* ─── Types ───────────────────────────────────────────── */

interface MaterialItem {
  id: string;
  category: string;
  folder_id?: string | null;
  name: string;
  description?: string;
  type: "IMAGE" | "VIDEO" | "AUDIO";
  storage_key: string;
  thumbnail_url?: string;
  width?: number;
  height?: number;
  tags: string[];
}

interface MaterialFolder {
  id: string;
  parent_id?: string | null;
  name: string;
  material_count: number;
}

interface StoryboardShot {
  id: string;
  shotNumber: string;
  duration: string;
  shotType: string;
  movement: string;
  visual: string;
  audio: string;
  dialogue: string;
  note: string;
}

type AssetRole = "scene" | "character" | "prop";

interface MaterialAssignment {
  role: AssetRole;
  name: string;
  desc: string;
}

type AssetSource = "generated" | "uploaded" | "library";

interface StoryboardAsset {
  id: string;
  type: "character" | "scene" | "prop";
  name: string;
  description: string;
  imagePrompt: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  source?: AssetSource;
  materialId?: string;
  canvasNodeId?: string;
  _genJobId?: string;
  _genFailed?: boolean;
  _genError?: string;
  _prevImageUrl?: string;
  _prevThumbnailUrl?: string;
  genModelId?: string;
  genImageSize?: string;
  genAspectRatio?: string;
}

interface StoryboardSnapshot {
  timestamp: string;
  label: string;
  script: string;
  globalPrefix: string;
  materialRoles: Record<string, MaterialAssignment>;
  shots: StoryboardShot[];
  finalPrompts: string;
  assets?: StoryboardAsset[];
}

const MAX_STEP_HISTORY = 5;

interface AssetsHistoryEntry {
  timestamp: string;
  label: string;
  llmModel: string;
  assets: StoryboardAsset[];
}

interface StoryboardHistoryEntry {
  timestamp: string;
  label: string;
  llmModel: string;
  shots: StoryboardShot[];
  generationLog: string;
}

interface PromptsHistoryEntry {
  timestamp: string;
  label: string;
  llmModel: string;
  finalPrompts: string;
}

interface StoryboardData {
  script: string;
  globalPrefix: string;
  /** materialId → assignment (role + custom name/desc) */
  materialRoles: Record<string, MaterialAssignment>;
  shots: StoryboardShot[];
  generationLog: string;
  finalPrompts: string;
  history?: StoryboardSnapshot[];
  llmModel?: string;
  assets?: StoryboardAsset[];
}

type AspectRatioValue = "16:9" | "9:16" | "21:9" | "4:3" | "3:4" | "1:1";

interface StoryboardSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  currentStep: number;
  script: string;
  aspectRatio: AspectRatioValue;
  stylePreset: string | null;
  styleDescription: string;
  styleImageUrl?: string;
  assets: StoryboardAsset[];
  materialRoles: Record<string, MaterialAssignment>;
  shots: StoryboardShot[];
  generationLog: string;
  finalPrompts: string;
  llmModel: string;
  history?: StoryboardSnapshot[];
  assetsHistory?: AssetsHistoryEntry[];
  storyboardHistory?: StoryboardHistoryEntry[];
  promptsHistory?: PromptsHistoryEntry[];
}

type StepStatus = "completed" | "active" | "pending";

interface StepDef {
  num: number;
  key: string;
  labelKey: string;
  icon: typeof FileText;
}

interface StoryboardPanelProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

const DEFAULT_LLM_MODEL = TEXT_MODELS[0]?.id || "gemini-3.1-pro-preview";

/** Max pre-debit per LLM call (token-based billing refunds difference after completion) */
const LLM_MAX_PRICE: Record<string, number> = {
  "gemini-3.1-pro-preview-thinking-high": 15,
  "gpt-5.5": 15,
  "gemini-2.5-flash-preview-05-20": 15,
};

/** Tokens per Xin (output) for display in model picker.
 *  Formula: (0.01 / 1.10) / (outputPerM / 1M) = 9091 / outputPerM */
const LLM_TOKENS_PER_XIN: Record<string, string> = {
  "gemini-2.5-flash-preview-05-20": "1.5万词元",
  "deepseek-v4-flash": "3.6万词元",
  "gpt-5.5": "300词元",
};

const EMPTY_STORYBOARD: StoryboardData = {
  script: "",
  globalPrefix: "",
  materialRoles: {},
  shots: [],
  generationLog: "",
  finalPrompts: "",
  history: [],
  llmModel: DEFAULT_LLM_MODEL,
  assets: [],
};

const STYLE_PRESETS = [
  { id: "realistic", labelKey: "styleRealistic", color: "#4A7C59" },
  { id: "3d-fantasy", labelKey: "style3DFantasy", color: "#6B4C9A" },
  { id: "period-drama", labelKey: "stylePeriodDrama", color: "#8B6914" },
  { id: "3d-realistic", labelKey: "style3DRealistic", color: "#2E6B8A" },
  { id: "2d-anime", labelKey: "style2DAnime", color: "#D4534A" },
  { id: "2d-cinema", labelKey: "style2DCinema", color: "#5A7D9A" },
  { id: "hollywood", labelKey: "styleHollywood", color: "#C4A000" },
  { id: "3d-chibi", labelKey: "style3DChibi", color: "#FF7EB3" },
  { id: "2d-korean", labelKey: "style2DKorean", color: "#B08FC7" },
  { id: "2d-fantasy-anime", labelKey: "style2DFantasyAnime", color: "#4E8CC2" },
  { id: "retro-wuxia", labelKey: "styleRetroWuxia", color: "#7A5230" },
  { id: "jp-3d-2d", labelKey: "styleJp3D2D", color: "#E06666" },
  { id: "retro-hk", labelKey: "styleRetroHK", color: "#C94C4C" },
  { id: "2d-shonen", labelKey: "style2DShonen", color: "#E8432E" },
  { id: "2d-urban-spirit", labelKey: "style2DUrbanSpirit", color: "#3D5A80" },
  { id: "2d-ghibli", labelKey: "style2DGhibli", color: "#7CB342" },
  { id: "3d-render-2d", labelKey: "style3DRender2D", color: "#5C7A99" },
  { id: "2d-chibi", labelKey: "style2DChibi", color: "#FFB347" },
  { id: "2d-death-god", labelKey: "style2DDeathGod", color: "#2C2C54" },
  { id: "3d-american", labelKey: "style3DAmerican", color: "#FF6B35" },
  { id: "2d-retro-anime", labelKey: "style2DRetroAnime", color: "#D4A373" },
  { id: "2d-american-anime", labelKey: "style2DAmericanAnime", color: "#4ECDC4" },
  { id: "2d-retro-girl", labelKey: "style2DRetroGirl", color: "#F4A7BB" },
  { id: "stop-motion", labelKey: "styleStopMotion", color: "#A67C52" },
  { id: "figure-stop-motion", labelKey: "styleFigureStopMotion", color: "#8D6E63" },
  { id: "clay-stop-motion", labelKey: "styleClayStopMotion", color: "#BCAAA4" },
  { id: "block-stop-motion", labelKey: "styleBlockStopMotion", color: "#E6A817" },
  { id: "plush-stop-motion", labelKey: "stylePlushStopMotion", color: "#F8BBD0" },
  { id: "2d-rubber-hose", labelKey: "style2DRubberHose", color: "#424242" },
  { id: "2d-pixel", labelKey: "style2DPixel", color: "#66BB6A" },
  { id: "2d-gongbi", labelKey: "style2DGongbi", color: "#A1887F" },
  { id: "2d-sketch", labelKey: "style2DSketch", color: "#9E9E9E" },
  { id: "2d-watercolor", labelKey: "style2DWatercolor", color: "#64B5F6" },
  { id: "2d-comic", labelKey: "style2DComic", color: "#EF5350" },
  { id: "2d-shoujo", labelKey: "style2DShoujo", color: "#F48FB1" },
  { id: "2d-horror", labelKey: "style2DHorror", color: "#37474F" },
  { id: "cyberpunk", labelKey: "styleCyberpunk", color: "#00E5FF" },
];

const STEPS: StepDef[] = [
  { num: 1, key: "script", labelKey: "stepScript", icon: FileText },
  { num: 2, key: "style", labelKey: "stepStyle", icon: Aperture },
  { num: 3, key: "assets", labelKey: "stepAssets", icon: Package },
  { num: 4, key: "storyboard", labelKey: "stepStoryboard", icon: Clapperboard },
  { num: 5, key: "prompts", labelKey: "stepPrompts", icon: ScrollText },
];

function createEmptySession(): StoryboardSession {
  return {
    id: crypto.randomUUID(),
    title: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentStep: 1,
    script: "",
    aspectRatio: "16:9",
    stylePreset: null,
    styleDescription: "",
    assets: [],
    materialRoles: {},
    shots: [],
    generationLog: "",
    finalPrompts: "",
    llmModel: DEFAULT_LLM_MODEL,
    history: [],
    assetsHistory: [],
    storyboardHistory: [],
    promptsHistory: [],
  };
}

function sessionTitle(s: StoryboardSession): string {
  if (s.title) return s.title;
  const firstLine = s.script.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
  return firstLine.slice(0, 30) || "";
}

const DEFAULT_ROLE_MAP: Record<string, AssetRole> = {
  CHARACTER: "character",
  SCENE: "scene",
  ITEM: "prop",
  STYLE: "prop",
  SOUND_EFFECT: "prop",
  OTHERS: "prop",
};

const CATEGORY_MAP: Record<string, string> = {
  CHARACTER: "assetCharacter",
  SCENE: "assetScene",
  ITEM: "assetProp",
  STYLE: "assetStyle",
  SOUND_EFFECT: "assetSound",
  OTHERS: "assetOthers",
};

/* ─── Rebuild markdown table from shots array ─── */

function rebuildStoryboardMarkdown(shots: StoryboardShot[]): string {
  if (shots.length === 0) return "";
  const header = "| 镜号 | 时长(s) | 景别 | 运镜 | 画面描述 | 音效 | 台词 | 备注 |";
  const sep = "| --- | --- | --- | --- | --- | --- | --- | --- |";
  const rows = shots.map((s) =>
    `| ${s.shotNumber} | ${s.duration} | ${s.shotType} | ${s.movement} | ${s.visual} | ${s.audio} | ${s.dialogue || ""} | ${s.note} |`
  );
  return [header, sep, ...rows].join("\n");
}

/* ─── Auto-repair shots from generationLog if columns are misaligned ─── */

function repairShotsFromLog(shots: StoryboardShot[], generationLog?: string): StoryboardShot[] {
  if (!shots.length || !generationLog || !generationLog.includes("|")) return shots;
  let needsRepair = false;

  // Detect misalignment: if most durations look like pure integers (1,2,3...) instead of decimals
  const badCount = shots.slice(0, 10).filter((s) => {
    const d = s.duration.trim();
    return /^\d+$/.test(d) && parseInt(d, 10) <= shots.length;
  }).length;
  if (badCount >= 3) needsRepair = true;

  // Detect shot count mismatch: generationLog has many more tables than saved shots
  // This catches the bug where only the last scene's shots were saved
  if (!needsRepair && shots.length < 50) {
    const tableCount = (generationLog.match(/\|---/g) || []).length;
    if (tableCount >= 3 && shots.length < tableCount * 2) needsRepair = true;
  }

  // Detect excessive shots: if shot count doubles what's expected (restarting numbers)
  // This catches GPT 5.5 multi-iteration merged tables. Skip if numbers are sequential.
  if (shots.length > 100) {
    const lastNum = parseInt(shots[shots.length - 1]?.shotNumber, 10) || shots.length;
    // If last number ≈ total count, it's sequential (multi-scene) — no repair needed
    // If last number << total count, it's iteration merging — needs repair
    if (lastNum < shots.length * 0.7) needsRepair = true;
  }

  if (!needsRepair) return shots;
  // Re-parse from raw markdown with the smart parser (takes only the last table)
  const reparsed = parseStoryboardTable(generationLog);
  return reparsed.length > 0 ? reparsed : shots;
}

/* ─── Auto-renumber shots if model reset numbering ─── */

function cleanShotNumber(raw: string): string {
  // GPT 5.5 may output "[01] @ 3 场景名..." — extract just the number
  const atMatch = raw.match(/@\s*(\d+)/);
  if (atMatch) return atMatch[1];
  const numMatch = raw.match(/(\d+)/);
  return numMatch ? numMatch[1] : raw;
}

function filterValidShots(shots: StoryboardShot[]): StoryboardShot[] {
  // Remove shots that are clearly review/feedback rows (no visual, or visual is too short to be a real shot description)
  return shots.filter((s) => {
    // Valid shot must have visual description with meaningful content (>10 chars, contains 机位/关注 or Chinese text)
    const v = s.visual.trim();
    if (!v) return false;
    if (v.length < 10 && !/[\u4e00-\u9fff]/.test(v)) return false;
    return true;
  });
}

function renumberShots(shots: StoryboardShot[]): StoryboardShot[] {
  // Filter out invalid/review rows first
  const valid = filterValidShots(shots);
  // Clean any messy shot numbers (e.g. "[01] @ 3 场景名...")
  const cleaned = valid.map((s) => {
    const clean = cleanShotNumber(s.shotNumber);
    return clean !== s.shotNumber ? { ...s, shotNumber: clean } : s;
  });
  if (cleaned.length <= 1) return cleaned;
  let needsRenumber = false;
  for (let i = 1; i < cleaned.length; i++) {
    const prev = parseInt(cleaned[i - 1].shotNumber, 10);
    const curr = parseInt(cleaned[i].shotNumber, 10);
    if (!isNaN(prev) && !isNaN(curr) && curr < prev) {
      needsRenumber = true;
      break;
    }
  }
  if (!needsRenumber) return cleaned;
  return cleaned.map((s, i) => ({ ...s, shotNumber: String(i + 1) }));
}

/* ─── Humanize job error for user-facing toast ─────── */
function humanizeJobError(raw: string, t: (key: string) => string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("fetch failed") || lower.includes("network") || lower.includes("econnrefused") || lower.includes("timeout"))
    return t("errorNetwork");
  if (raw.includes("模型拒绝") || lower.includes("content_policy") || lower.includes("refused"))
    return raw; // already user-friendly from worker
  if (lower.includes("insufficient_balance") || lower.includes("余额"))
    return t("insufficientBalance");
  if (lower.includes("canceled") || lower.includes("cancelled"))
    return t("errorCanceled");
  // Fallback: if it looks like Chinese, pass through; otherwise use generic message
  if (/[\u4e00-\u9fff]/.test(raw)) return raw;
  return t("errorGeneric");
}

/* ─── Parse markdown table into shots ──────────────── */

// Build column index map from header cells using pattern matching (priority order)
function buildColumnMap(headerCells: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const used = new Set<number>();
  // Priority order: shot → duration → shotType → movement → visual → audio → note
  const matchers: [string, RegExp][] = [
    ["shot", /镜号|^shot/i],
    ["duration", /时长|duration/i],
    ["shotType", /景别|shot[\s_]*type/i],
    ["movement", /运镜|^movement$/i],
    ["visual", /visual|画面|内容/i],
    ["audio", /音效|^sfx$|audio|音频|声音/i],
    ["dialogue", /台词|对白|dialogue|旁白/i],
    ["note", /note|备注|意图|情绪|目标/i],
  ];
  for (const [key, regex] of matchers) {
    for (let i = 0; i < headerCells.length; i++) {
      if (used.has(i)) continue;
      if (regex.test(headerCells[i])) {
        map[key] = i;
        used.add(i);
        break;
      }
    }
  }
  return map;
}

function parseSingleTable(lines: string[]): StoryboardShot[] {
  const shots: StoryboardShot[] = [];
  let isTable = false;
  let colMap: Record<string, number> | null = null;
  let headerOffset = -1;

  for (const line of lines) {
    if (line.trim().startsWith("|") && line.includes("---")) {
      isTable = true;
      continue;
    }
    if (line.trim().startsWith("|") && !isTable) {
      if (line.includes("镜号") || line.includes("Visual") || line.includes("Shot")) {
        const hCells = line.trim().split("|").map((c) => c.trim()).filter(Boolean);
        // Only treat as storyboard table if header has visual/画面 column (skip review tables)
        const hasVisualCol = hCells.some((c) => /visual|画面|内容|描述/i.test(c));
        if (!hasVisualCol && hCells.length < 7) {
          // This is likely a review/feedback table (e.g. | 镜号 | 问题 | 修改建议 |) — skip
          continue;
        }
        colMap = buildColumnMap(hCells);
        // Fallback offset for non-standard columns
        const durationIdx = hCells.findIndex((c) => /时长|duration/i.test(c));
        headerOffset = durationIdx >= 2 ? durationIdx - 1 : 0;
        continue;
      }
    }
    if (isTable && line.trim().startsWith("|")) {
      const rawCells = line.trim().split("|");
      if (rawCells[0] === "") rawCells.shift();
      if (rawCells[rawCells.length - 1] === "") rawCells.pop();
      const cells = rawCells.map((c) => c.trim());

      // Use header-based column map if available, otherwise fallback to offset
      if (colMap && colMap.shot != null) {
        const shotIdx = colMap.shot;
        if (cells.length > shotIdx && cells[shotIdx]?.match(/\d/)) {
          const visual = cells[colMap.visual ?? shotIdx + 4] || "";
          // Skip rows that are clearly director review/feedback (no visual description, contains review keywords)
          if (!visual && cells.length < 6) continue;
          shots.push({
            id: `shot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            shotNumber: cleanShotNumber(cells[shotIdx]),
            duration: cells[colMap.duration ?? shotIdx + 1] || "",
            shotType: cells[colMap.shotType ?? shotIdx + 2] || "",
            movement: colMap.movement != null ? (cells[colMap.movement] || "") : "",
            visual,
            audio: cells[colMap.audio ?? shotIdx + 5] || "",
            dialogue: cells[colMap.dialogue ?? shotIdx + 6] || "",
            note: cells[colMap.note ?? shotIdx + 7] || "",
          });
        }
      } else {
        // Legacy offset-based fallback
        let offset = headerOffset >= 0 ? headerOffset : 0;
        if (headerOffset < 0 && cells.length >= 8 && cells[0].match(/\d/)) {
          const c1 = parseFloat(cells[1]);
          const c2 = parseFloat(cells[2]);
          if (!isNaN(c1) && Number.isInteger(c1) && !isNaN(c2) && cells[2].includes(".")) {
            offset = 1;
          }
        }
        const shotIdx = offset;
        const minCols = 7 + offset;
        if (cells.length >= minCols && cells[shotIdx].match(/\d/)) {
          const hasDialogueCol = cells.length >= 8 + offset;
          shots.push({
            id: `shot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            shotNumber: cleanShotNumber(cells[shotIdx]),
            duration: cells[1 + offset],
            shotType: cells[2 + offset],
            movement: cells[3 + offset],
            visual: cells[4 + offset],
            audio: cells[5 + offset],
            dialogue: hasDialogueCol ? cells[6 + offset] : "",
            note: hasDialogueCol ? (cells[7 + offset] || "") : (cells[6 + offset] || ""),
          });
        }
      }
    }
    if (!line.trim().startsWith("|") && line.trim().length > 0 && isTable) {
      isTable = false;
    }
  }
  return shots;
}

function parseStoryboardTable(markdown: string): StoryboardShot[] {
  const lines = markdown.split("\n");

  // Find all table start positions (separator lines with ---)
  const tableStarts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("|") && lines[i].includes("---")) {
      tableStarts.push(i);
    }
  }

  if (tableStarts.length === 0) return [];

  // Strategy: parse ALL tables from the entire text first.
  // Models like DeepSeek output one table per scene (24 tables = 200 shots).
  // Models like GPT 5.5 output draft → review → final (multiple iterations).
  const allShots = parseSingleTable(lines);

  if (tableStarts.length === 1) {
    // Only one table — use it directly
    return renumberShots(allShots);
  }

  // Multiple tables found. Parse each table individually and pick the best strategy.
  // Cases:
  // A) Multi-scene: model outputs one table per scene, shot numbers sequential or per-scene (1→N)
  // B) Iteration: model outputs draft → review → final (shot numbers restart)
  //    In iteration, the LAST table with the most shots is the final version.

  // Parse each table separately
  const tableShots: StoryboardShot[][] = [];
  for (let t = 0; t < tableStarts.length; t++) {
    // Find header line above separator
    const sepIdx = tableStarts[t];
    let hStart = sepIdx;
    for (let i = sepIdx - 1; i >= 0; i--) {
      if (lines[i].trim().startsWith("|")) hStart = i;
      else break;
    }
    // Table ends at next table or end of file
    const nextSep = t + 1 < tableStarts.length ? tableStarts[t + 1] : lines.length;
    // Find where next table's header starts (go back from nextSep)
    let endIdx = nextSep;
    if (t + 1 < tableStarts.length) {
      for (let i = nextSep - 1; i >= 0; i--) {
        if (lines[i].trim().startsWith("|")) endIdx = i;
        else break;
      }
    }
    const tableLines = lines.slice(hStart, endIdx);
    const parsed = parseSingleTable(tableLines);
    if (parsed.length > 0) tableShots.push(parsed);
  }

  if (tableShots.length === 0) return renumberShots(allShots);

  // Find the table with the most shots (likely the final/complete version)
  const maxTable = tableShots.reduce((a, b) => a.length >= b.length ? a : b);

  // If the largest table has ≥ 70% of allShots, it's likely the complete final version
  // (iteration pattern: draft + final, final is the largest)
  if (maxTable.length >= allShots.length * 0.4 && maxTable.length < allShots.length * 0.95) {
    return renumberShots(maxTable);
  }

  // Otherwise, all tables together form the full storyboard (multi-scene pattern)
  return renumberShots(allShots);
}

/* ─── Parse [SEGMENT X/Y] into individual segments ─── */

interface PromptSegment {
  index: string;
  title: string;
  content: string;
}

function parsePromptSegments(text: string): PromptSegment[] {
  // Step 1: Locate the FINAL output section (skip drafts, reviews, revisions)
  // The LLM outputs multiple rounds: 动画师初稿 → 导演审核 → 动画师修改 → 导演复审 → 最终输出
  // We only want the LAST set of segments.
  const finalMarkers = ["【最终提示词输出】", "【最终版本】", "最终确认的 Phase", "最终确认的Phase"];
  let finalStart = -1;
  for (const marker of finalMarkers) {
    const idx = text.lastIndexOf(marker);
    if (idx > finalStart) finalStart = idx;
  }
  // If no explicit final marker, try to find the last occurrence of [SEGMENT 1/
  const lastSeg1 = text.lastIndexOf("[SEGMENT 1/");
  if (lastSeg1 > finalStart) finalStart = lastSeg1;

  const searchText = finalStart > 0 ? text.slice(finalStart) : text;

  // Primary: split on [SEGMENT X/Y] markers in the final section
  const parts = searchText.split(/\[SEGMENT\s+(\d+\/\d+)\]/i);
  const segments: PromptSegment[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const index = parts[i];
    const content = (parts[i + 1] || "").trim();
    const titleMatch = content.match(/-\s*段落标题[：:]\s*(.+)/);
    const title = titleMatch ? titleMatch[1].trim() : `Segment ${index}`;
    segments.push({ index, title, content });
  }
  if (segments.length > 0) return segments;

  // Fallback: split on "- 段落标题：" boundaries in the final section
  const segBoundaryRegex = /(?:^|\n)\s*(?:-\s*)?段落标题[：:]\s*(.+)/g;
  const boundaries = [...searchText.matchAll(segBoundaryRegex)];
  if (boundaries.length > 0) {
    const total = boundaries.length;
    for (let i = 0; i < boundaries.length; i++) {
      const startIdx = boundaries[i].index!;
      const endIdx = i + 1 < boundaries.length ? boundaries[i + 1].index! : searchText.length;
      const content = searchText.slice(startIdx, endIdx).trim();
      const title = boundaries[i][1].trim();
      segments.push({ index: `${i + 1}/${total}`, title, content });
    }
    return segments;
  }

  // Fallback 2: split on "段落X [时间范围]" pattern
  const altRegex = /(?:^|\n)\s*段落\s*(\d+)\s*[\[【]/g;
  const altMatches = [...searchText.matchAll(altRegex)];
  if (altMatches.length > 0) {
    const total = altMatches.length;
    for (let i = 0; i < altMatches.length; i++) {
      const startIdx = altMatches[i].index!;
      const endIdx = i + 1 < altMatches.length ? altMatches[i + 1].index! : searchText.length;
      const content = searchText.slice(startIdx, endIdx).trim();
      const titleMatch = content.match(/段落标题[：:]\s*(.+)/);
      const title = titleMatch ? titleMatch[1].trim() : `Segment ${i + 1}`;
      segments.push({ index: `${i + 1}/${total}`, title, content });
    }
  }
  return segments;
}

/**
 * Strip metadata lines from segment content, keeping only shot visual descriptions.
 * Removes: 段落标题/段落目标/段落时长 header lines, 音频 lines.
 * Keeps: 镜头X [time], 景别/机位/运镜, 关注/visual descriptions.
 */
function cleanSegmentForPrompt(raw: string): string {
  const lines = raw.split("\n");
  const cleaned: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Stop processing at director review / audit markers (these are NOT part of the prompt)
    if (/^【导演/.test(trimmed)) break;
    if (/^【动画师/.test(trimmed)) break;
    if (/^\*{3,}$/.test(trimmed)) break;  // *** separator
    if (/^-{3,}$/.test(trimmed)) break;   // --- separator
    if (/^导演[：:]/.test(trimmed)) break;
    if (/^问题清单[：:]/.test(trimmed)) break;
    if (/^Level\s*\d/.test(trimmed)) break;
    // Skip segment metadata lines
    if (/^-?\s*段落标题[：:]/.test(trimmed)) continue;
    if (/^-?\s*段落目标[：:]/.test(trimmed)) continue;
    if (/^-?\s*段落时长[：:]/.test(trimmed)) continue;
    // Skip audio description lines (SFX/环境声 — not needed for visual prompt)
    if (/^音频[：:]/.test(trimmed)) continue;
    // Skip lines that are only markdown headings (####, ###, ##, #)
    if (/^#{1,6}\s*$/.test(trimmed)) continue;
    // Strip markdown formatting: headings prefix, bold, italic
    let clean = line;
    clean = clean.replace(/^(\s*)#{1,6}\s+/, "$1"); // ### Heading → Heading
    clean = clean.replace(/\*\*([^*]+)\*\*/g, "$1"); // **bold** → bold
    clean = clean.replace(/\*([^*]+)\*/g, "$1");     // *italic* → italic
    cleaned.push(clean);
  }
  // Collapse leading/trailing blank lines
  return cleaned.join("\n").replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n").trim();
}

/* ─── Component ─────────────────────────────────────── */

export function StoryboardPanel({ open, onClose, projectId }: StoryboardPanelProps) {
  const t = useTranslations("storyboard");
  const locale = useLocale();

  const [loaded, setLoaded] = useState(false);
  const [currentView, setCurrentView] = useState<"list" | "editor">("list");
  const [currentStep, setCurrentStep] = useState(1);
  const [sessions, setSessions] = useState<StoryboardSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [stylePreset, setStylePreset] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioValue>("16:9");
  const [styleImageUrl, setStyleImageUrl] = useState<string | undefined>(undefined);
  const [editingTitle, setEditingTitle] = useState("");

  // Storyboard state
  const [script, setScript] = useState("");
  const [globalPrefix, setGlobalPrefix] = useState("");
  const [materialRoles, setMaterialRoles] = useState<Record<string, MaterialAssignment>>({});
  const [shots, setShots] = useState<StoryboardShot[]>([]);
  const [generationLog, setGenerationLog] = useState("");
  const [finalPrompts, setFinalPrompts] = useState("");
  const [history, setHistory] = useState<StoryboardSnapshot[]>([]);
  const [assetsHistory, setAssetsHistory] = useState<AssetsHistoryEntry[]>([]);
  const [storyboardHistory, setStoryboardHistory] = useState<StoryboardHistoryEntry[]>([]);
  const [promptsHistory, setPromptsHistory] = useState<PromptsHistoryEntry[]>([]);
  const [assets, setAssets] = useState<StoryboardAsset[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [llmModel, setLlmModel] = useState(DEFAULT_LLM_MODEL);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  // Materials from library
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [materialFolders, setMaterialFolders] = useState<MaterialFolder[]>([]);
  const [materialsLoaded, setMaterialsLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Save
  const versionRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const dataLoadedRef = useRef(false);

  // ─── Load storyboard data on open ───
  useEffect(() => {
    if (!open) return;
    if (dataLoadedRef.current) return;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/storyboard`);
        if (!res.ok) { setLoaded(true); return; }
        const data = await res.json();
        const raw = data.storyboard_data ?? {};
        versionRef.current = data.version ?? 0;

        const LEGACY_MODEL_MAP: Record<string, string> = {
          "gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite-preview-thinking-high",
          "gemini-3.1-pro-preview": "gemini-3.1-pro-preview-thinking-high",
        };

        // Check for sessions array (new format)
        if (Array.isArray(raw.sessions) && raw.sessions.length > 0) {
          const loadedSessions: StoryboardSession[] = raw.sessions.map((s: StoryboardSession) => ({
            ...s,
            llmModel: LEGACY_MODEL_MAP[s.llmModel] ?? s.llmModel ?? DEFAULT_LLM_MODEL,
            shots: repairShotsFromLog(renumberShots(s.shots ?? []), s.generationLog),
          }));
          // Recover top-level finalPrompts saved by worker (wrong level) into most recent session
          const topLevelPrompts = typeof raw.finalPrompts === "string" ? raw.finalPrompts : "";
          if (topLevelPrompts.length > 100) {
            // Find most recently updated session, or fallback to last
            const sorted = [...loadedSessions].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
            const target = sorted[0];
            if (target && (!target.finalPrompts || topLevelPrompts.length > target.finalPrompts.length)) {
              const idx = loadedSessions.findIndex((s) => s.id === target.id);
              if (idx >= 0) {
                loadedSessions[idx] = { ...loadedSessions[idx], finalPrompts: topLevelPrompts };
                console.log(`[storyboard] recovered top-level finalPrompts (${topLevelPrompts.length} chars) into session "${target.title || target.id}"`);
              }
            }
          }
          setSessions(loadedSessions);
          setCurrentView("list");
        } else if (raw.script && typeof raw.script === "string" && raw.script.trim()) {
          // Legacy single-storyboard format → migrate to session
          const sb: StoryboardData = raw;
          const rawRoles = sb.materialRoles ?? {};
          const migratedRoles: Record<string, MaterialAssignment> = {};
          for (const [id, val] of Object.entries(rawRoles)) {
            if (typeof val === "string") {
              migratedRoles[id] = { role: val as AssetRole, name: "", desc: "" };
            } else if (val && typeof val === "object") {
              migratedRoles[id] = val as MaterialAssignment;
            }
          }
          const savedModel = sb.llmModel ?? DEFAULT_LLM_MODEL;
          const migratedSession: StoryboardSession = {
            id: crypto.randomUUID(),
            title: "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            currentStep: sb.finalPrompts ? 5 : sb.shots?.length ? 4 : sb.assets?.length ? 3 : 1,
            script: sb.script ?? "",
            aspectRatio: "16:9",
            stylePreset: null,
            styleDescription: sb.globalPrefix ?? "",
            assets: sb.assets ?? [],
            materialRoles: migratedRoles,
            shots: repairShotsFromLog(renumberShots(sb.shots ?? []), sb.generationLog),
            generationLog: sb.generationLog ?? "",
            finalPrompts: sb.finalPrompts ?? "",
            llmModel: LEGACY_MODEL_MAP[savedModel] ?? savedModel,
            history: sb.history ?? [],
          };
          setSessions([migratedSession]);
          setCurrentView("list");
        } else {
          // Empty — show list (no sessions)
          setCurrentView("list");
        }

        dataLoadedRef.current = true;
        setLoaded(true);
      } catch {
        setLoaded(true);
      }
    })();
  }, [open, projectId]);

  // ─── Auto-save ───
  const buildPayload = useCallback(() => {
    // Update the active session with current editing state before saving
    let updatedSessions = sessions;
    if (activeSessionId) {
      updatedSessions = sessions.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              title: editingTitle,
              script,
              aspectRatio,
              stylePreset,
              styleDescription: globalPrefix,
              styleImageUrl,
              materialRoles,
              shots,
              generationLog,
              finalPrompts,
              history,
              llmModel,
              assets,
              currentStep,
              updatedAt: new Date().toISOString(),
            }
          : s
      );
    }
    return { storyboard_data: { sessions: updatedSessions }, version: versionRef.current };
  }, [sessions, activeSessionId, editingTitle, script, aspectRatio, stylePreset, globalPrefix, styleImageUrl, materialRoles, shots, generationLog, finalPrompts, history, llmModel, assets, currentStep]);

  const doSave = useCallback(async (payload: ReturnType<typeof buildPayload>) => {
    setSaveStatus("saving");
    try {
      let res = await fetch(`/api/projects/${projectId}/storyboard`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 409) {
        res = await fetch(`/api/projects/${projectId}/storyboard`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (res.ok) {
        const data = await res.json();
        versionRef.current = data.version;
        setSaveStatus("saved");
        console.log("[storyboard] saved, version:", data.version);
      } else {
        const errBody = await res.text().catch(() => "");
        console.error("[storyboard] save failed:", res.status, errBody);
        setSaveStatus("unsaved");
      }
    } catch (err) { console.error("[storyboard] save error:", err); setSaveStatus("unsaved"); }
  }, [projectId]);

  const saveRef = useRef<() => Promise<void>>(undefined);
  saveRef.current = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    await doSave(buildPayload());
    savingRef.current = false;
  };

  // Force immediate save (used after generation completes)
  const forceSave = useCallback(async (extraData?: Partial<StoryboardSession>) => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    // Build updated sessions with current state + extraData merged into active session
    const now = new Date().toISOString();
    const updatedSessions = sessions.map((s) =>
      s.id === activeSessionId
        ? { ...s, title: editingTitle, script, aspectRatio, stylePreset, styleDescription: globalPrefix, styleImageUrl, materialRoles, shots, generationLog, finalPrompts, history, assetsHistory, storyboardHistory, promptsHistory, llmModel, assets, currentStep, updatedAt: now, ...extraData }
        : s
    );
    const payload = { storyboard_data: { sessions: updatedSessions }, version: versionRef.current };
    savingRef.current = true;
    await doSave(payload);
    // Also update local sessions state so it stays in sync
    setSessions(updatedSessions);
    savingRef.current = false;
  }, [sessions, activeSessionId, editingTitle, script, aspectRatio, stylePreset, globalPrefix, styleImageUrl, materialRoles, shots, generationLog, finalPrompts, history, assetsHistory, storyboardHistory, promptsHistory, llmModel, assets, currentStep, doSave]);

  const scheduleSave = useCallback(() => {
    if (!loaded || !activeSessionId) return;
    setSaveStatus("unsaved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveRef.current?.(), 1500);
  }, [loaded, activeSessionId]);

  useEffect(() => {
    if (!loaded || !dataLoadedRef.current || !activeSessionId) return;
    scheduleSave();
  }, [editingTitle, script, globalPrefix, aspectRatio, stylePreset, styleImageUrl, materialRoles, shots, generationLog, finalPrompts, history, assetsHistory, storyboardHistory, promptsHistory, llmModel, assets, currentStep, loaded, activeSessionId, scheduleSave]);

  // ─── Flush save on page unload / panel close ───
  const flushSaveRef = useRef<() => void>(undefined);
  flushSaveRef.current = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!dataLoadedRef.current || !loaded || !activeSessionId) return;
    const now = new Date().toISOString();
    const updatedSessions = sessions.map((s) =>
      s.id === activeSessionId
        ? { ...s, title: editingTitle, script, aspectRatio, stylePreset, styleDescription: globalPrefix, styleImageUrl, materialRoles, shots, generationLog, finalPrompts, history, assetsHistory, storyboardHistory, promptsHistory, llmModel, assets, currentStep, updatedAt: now }
        : s
    );
    const body = JSON.stringify({ storyboard_data: { sessions: updatedSessions }, version: versionRef.current });
    // Use fetch with keepalive (supports payloads up to ~few MB, unlike sendBeacon's 64KB limit)
    fetch(`/api/projects/${projectId}/storyboard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  };

  useEffect(() => {
    const handler = () => flushSaveRef.current?.();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Save when panel closes (open → false) or component unmounts
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current && !open) {
      flushSaveRef.current?.();
    }
    prevOpenRef.current = open;
    return () => { flushSaveRef.current?.(); };
  }, [open]);

  // ─── Click outside to close model picker ───
  useEffect(() => {
    if (!showModelPicker) return;
    const handler = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as globalThis.Node)) {
        setShowModelPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showModelPicker]);

  // ─── Fetch materials + folders from library ───
  useEffect(() => {
    if (!open || materialsLoaded) return;
    (async () => {
      try {
        const [matRes, folderRes] = await Promise.all([
          fetch("/api/materials?limit=200"),
          fetch("/api/materials/folders"),
        ]);
        if (matRes.ok) {
          const data = await matRes.json();
          setMaterials(data.materials ?? []);
        }
        if (folderRes.ok) {
          const data = await folderRes.json();
          setMaterialFolders(data.folders ?? []);
        }
      } catch { /* ignore */ }
      setMaterialsLoaded(true);
    })();
  }, [open, materialsLoaded]);

  const toggleMaterial = useCallback((id: string, category: string, defaultName: string) => {
    setMaterialRoles((prev) => {
      if (id in prev) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { role: DEFAULT_ROLE_MAP[category] ?? "prop", name: defaultName, desc: "" } };
    });
  }, []);

  const setMaterialRole = useCallback((id: string, role: AssetRole) => {
    setMaterialRoles((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, role } };
    });
  }, []);

  const setMaterialMeta = useCallback((id: string, field: "name" | "desc", value: string) => {
    setMaterialRoles((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, [field]: value } };
    });
  }, []);

  const refreshMaterials = useCallback(async () => {
    try {
      const [matRes, folderRes] = await Promise.all([
        fetch("/api/materials?limit=200"),
        fetch("/api/materials/folders"),
      ]);
      if (matRes.ok) {
        const data = await matRes.json();
        setMaterials(data.materials ?? []);
      }
      if (folderRes.ok) {
        const data = await folderRes.json();
        setMaterialFolders(data.folders ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  const renameMaterial = useCallback(async (id: string, newName: string) => {
    try {
      const res = await fetch(`/api/materials/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        setMaterials((prev) => prev.map((m) => m.id === id ? { ...m, name: newName } : m));
      }
    } catch { /* ignore */ }
  }, []);

  const deleteMaterial = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/materials/${id}`, { method: "DELETE" });
      if (res.ok) {
        setMaterials((prev) => prev.filter((m) => m.id !== id));
        setMaterialRoles((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    } catch { /* ignore */ }
  }, []);

  const uploadMaterial = useCallback(async () => {
    const file = await openFilePicker("media");
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadFile(file, { projectId });
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      const mediaType = isVideo ? "VIDEO" : isImage ? "IMAGE" : "AUDIO";
      const storageKey = isVideo
        ? (result as { videoUrl: string }).videoUrl
        : isImage
          ? (result as { url: string }).url
          : (result as { audioUrl: string }).audioUrl;
      const thumbnailUrl = "thumbnailUrl" in result ? (result.thumbnailUrl as string) : undefined;
      const width = "width" in result ? (result.width as number) : undefined;
      const height = "height" in result ? (result.height as number) : undefined;

      const matRes = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "OTHERS",
          name: file.name.replace(/\.[^.]+$/, ""),
          type: mediaType,
          storage_key: storageKey,
          storage_bucket: "local",
          mime_type: file.type,
          file_size_bytes: file.size,
          width,
          height,
          thumbnail_url: thumbnailUrl,
          tags: [],
        }),
      });
      if (matRes.ok) {
        const { material } = await matRes.json();
        await refreshMaterials();
        // Auto-select with default role
        setMaterialRoles((prev) => ({ ...prev, [material.id]: { role: "prop", name: file.name.replace(/\.[^.]+$/, ""), desc: "" } }));
      }
    } catch (err) {
      console.error("[storyboard] upload error:", err);
    } finally {
      setUploading(false);
    }
  }, [refreshMaterials]);

  // ─── Add canvas node as material ───
  const addFromCanvas = useCallback(async (nodeId: string) => {
    const node = useCanvasStore.getState().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const d = node.data;
    const hasImage = !!(d.imageUrl || d.originalUrl);
    const hasVideo = !!d.videoUrl;
    const hasAudio = !!d.audioUrl;
    if (!hasImage && !hasVideo && !hasAudio) return;

    const mediaType = hasVideo ? "VIDEO" : hasAudio ? "AUDIO" : "IMAGE";
    const storageKey = hasVideo
      ? String(d.videoUrl)
      : hasAudio
        ? String(d.audioUrl)
        : String(d.imageUrl ?? d.originalUrl);
    const thumbnailUrl = d.thumbnailUrl ? String(d.thumbnailUrl) : undefined;

    try {
      const matRes = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "OTHERS",
          name: String(d.label || "Canvas Asset"),
          type: mediaType,
          storage_key: storageKey,
          storage_bucket: "local",
          mime_type: hasVideo ? "video/mp4" : hasAudio ? "audio/mpeg" : "image/webp",
          file_size_bytes: 0,
          width: d.width ? Number(d.width) : undefined,
          height: d.height ? Number(d.height) : undefined,
          thumbnail_url: thumbnailUrl,
          tags: [],
        }),
      });
      if (matRes.ok) {
        const { material } = await matRes.json();
        await refreshMaterials();
        setMaterialRoles((prev) => ({ ...prev, [material.id]: { role: "prop", name: String(d.label || "Canvas Asset"), desc: "" } }));
        showToast(t("materialAdded"), "success");
      }
    } catch (err) {
      console.error("[storyboard] addFromCanvas error:", err);
    }
  }, [refreshMaterials, t]);

  // ─── Real-time sync: listen for material-saved events from canvas ───
  useEffect(() => {
    if (!open) return;
    const handler = () => { refreshMaterials(); };
    window.addEventListener("material-saved", handler);
    return () => window.removeEventListener("material-saved", handler);
  }, [open, refreshMaterials]);

  // ─── Escape to close (skip if detail view is open — let it close first) ───
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || isGenerating) return;
      if (useCanvasStore.getState().detailView) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, isGenerating]);

  // ─── AI: Extract assets from script (worker-based) ───
  const extractAssetsSseRef = useRef<EventSource | null>(null);
  const extractAssetsJobIdRef = useRef<string | null>(null);

  const extractAssets = useCallback(async () => {
    if (isExtracting || !script.trim()) return;

    // Save current assets as history before re-extracting
    if (assets.length > 0) {
      setAssetsHistory((prev) => [...prev, {
        timestamp: new Date().toISOString(),
        label: `资产 v${prev.length + 1}`,
        llmModel,
        assets: [...assets],
      }].slice(-MAX_STEP_HISTORY));
    }

    setIsExtracting(true);
    setCurrentStep(3);

    try {
      const res = await fetch(`/api/projects/${projectId}/storyboard/extract-assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, globalPrefix: globalPrefix || undefined, model: llmModel, locale }),
      });

      if (!res.ok) {
        const rawText = await res.text().catch(() => "");
        let err: any = {};
        try { err = JSON.parse(rawText); } catch { err = { rawText }; }
        console.error(`[storyboard] extract-assets error: HTTP ${res.status}`, err);
        if (err.code === "INSUFFICIENT_BALANCE" || err.error?.code === "INSUFFICIENT_BALANCE") showToast(t("insufficientBalance"), "warning");
        setIsExtracting(false);
        return;
      }

      const { jobId } = await res.json();
      extractAssetsJobIdRef.current = jobId;

      // Subscribe to job SSE for result
      const evtSource = new EventSource(`/api/jobs/${jobId}/sse`);
      extractAssetsSseRef.current = evtSource;

      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const status = data.status as string;

          if (status === "SUCCEEDED" && data.kind === "storyboard.extract-assets") {
            evtSource.close();
            extractAssetsSseRef.current = null;
            extractAssetsJobIdRef.current = null;

            const extracted: StoryboardAsset[] = (data.assets || []).map((a: any, i: number) => ({
              id: `asset-${Date.now()}-${i}`,
              type: a.type as "character" | "scene" | "prop",
              name: a.name || "",
              description: a.description || "",
              imagePrompt: a.imagePrompt || "",
            }));
            if (extracted.length > 0) setAssets(extracted);
            setIsExtracting(false);
          }

          if (status === "FAILED" || status === "CANCELED") {
            evtSource.close();
            extractAssetsSseRef.current = null;
            extractAssetsJobIdRef.current = null;
            setIsExtracting(false);
            if (data.error) {
              console.warn("[storyboard] extract-assets job failed:", data.error);
              showToast(humanizeJobError(data.error, t), "warning");
            }
          }
        } catch { /* skip */ }
      };

      let reconnectAttempts = 0;
      evtSource.onerror = () => {
        evtSource.close();
        extractAssetsSseRef.current = null;
        // Auto-reconnect with backoff (max 10 attempts)
        if (reconnectAttempts < 10 && extractAssetsJobIdRef.current) {
          reconnectAttempts++;
          const delay = Math.min(2000 * reconnectAttempts, 15000);
          console.log(`[storyboard] extract-assets SSE reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
          setTimeout(() => {
            const currentJobId = extractAssetsJobIdRef.current;
            if (!currentJobId) return;
            const newEvt = new EventSource(`/api/jobs/${currentJobId}/sse`);
            extractAssetsSseRef.current = newEvt;
            newEvt.onmessage = evtSource.onmessage;
            newEvt.onerror = evtSource.onerror;
          }, delay);
        } else {
          extractAssetsJobIdRef.current = null;
          setIsExtracting(false);
        }
      };
    } catch (err) {
      console.error("[storyboard] extract-assets error:", err);
      setIsExtracting(false);
    }
  }, [isExtracting, script, globalPrefix, projectId, llmModel]);

  // ─── AI: Generate storyboard (worker-based) ───
  const generateSseRef = useRef<EventSource | null>(null);
  const generateJobIdRef = useRef<string | null>(null);

  const generateStoryboard = useCallback(async () => {
    if (isGenerating || !script.trim()) return;

    // Save current storyboard as history before regenerating
    if (shots.length > 0) {
      setStoryboardHistory((prev) => [...prev, {
        timestamp: new Date().toISOString(),
        label: `分镜 v${prev.length + 1} (${shots.length} 镜头)`,
        llmModel,
        shots: [...shots],
        generationLog,
      }].slice(-MAX_STEP_HISTORY));
    }

    setIsGenerating(true);
    setCurrentStep(4);
    setGenerationLog("");

    try {
      // Build asset list from selected materials with assigned roles
      const selectedMats = materials.filter((m) => m.id in materialRoles);
      const assetList = selectedMats.map((m) => {
        const a = materialRoles[m.id];
        return {
          type: a?.role ?? "prop",
          name: a?.name || m.name,
          description: a?.desc || m.description || "",
        };
      });

      // Submit job to worker (analyze + generate both run inside worker)
      const res = await fetch(`/api/projects/${projectId}/storyboard/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          assets: assetList,
          globalPrefix: globalPrefix || undefined,
          model: llmModel,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { code: "UNKNOWN", message: "Unknown error" } }));
        const errCode = err.code || err.error?.code || "UNKNOWN";
        const errMsg = err.message || err.error?.message || `HTTP ${res.status}`;
        console.error("[storyboard] generate error:", errCode, errMsg, err);
        if (errCode === "INSUFFICIENT_BALANCE") showToast(t("insufficientBalance"), "warning");
        else showToast(errMsg, "warning");
        setIsGenerating(false);
        return;
      }

      const { jobId } = await res.json();
      generateJobIdRef.current = jobId;

      // Subscribe to job SSE for streaming progress
      const evtSource = new EventSource(`/api/jobs/${jobId}/sse`);
      generateSseRef.current = evtSource;

      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const status = data.status as string;

          if (status === "RUNNING" && data.kind === "storyboard.generate") {
            // Show phase status (no streaming text — worker accumulates internally)
            if (data.phase === "analyzing") {
              setGenerationLog(data.text || "正在分析剧本结构...");
            } else if (data.phase === "generating") {
              setGenerationLog("正在生成分镜表...");
            } else if (data.phase === "checking") {
              setGenerationLog("正在进行品控自检...");
            } else if (data.phase === "fixing") {
              setGenerationLog("正在修复问题...");
            }
          }

          if (status === "SUCCEEDED" && data.kind === "storyboard.generate") {
            evtSource.close();
            generateSseRef.current = null;
            generateJobIdRef.current = null;

            // Worker sends complete result only on success
            const fullText = data.fullText || "";
            if (fullText) setGenerationLog(fullText);

            const finalShots = parseStoryboardTable(fullText);
            if (finalShots.length > 0) {
              setShots(finalShots);
              void forceSave({ shots: finalShots, generationLog: fullText });
            }
            setIsGenerating(false);
          }

          if (status === "FAILED" || status === "CANCELED") {
            evtSource.close();
            generateSseRef.current = null;
            generateJobIdRef.current = null;
            setIsGenerating(false);
            if (data.error) {
              console.warn("[storyboard] generate job failed:", data.error);
              showToast(humanizeJobError(data.error, t), "warning");
            }
            setGenerationLog("");
          }
        } catch { /* skip */ }
      };

      let reconnectAttempts = 0;
      evtSource.onerror = () => {
        evtSource.close();
        generateSseRef.current = null;
        // Auto-reconnect with backoff (max 10 attempts)
        if (reconnectAttempts < 10 && generateJobIdRef.current) {
          reconnectAttempts++;
          const delay = Math.min(2000 * reconnectAttempts, 15000);
          console.log(`[storyboard] SSE reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
          setTimeout(() => {
            const currentJobId = generateJobIdRef.current;
            if (!currentJobId) return;
            const newEvt = new EventSource(`/api/jobs/${currentJobId}/sse`);
            generateSseRef.current = newEvt;
            newEvt.onmessage = evtSource.onmessage;
            newEvt.onerror = evtSource.onerror;
          }, delay);
        } else {
          generateJobIdRef.current = null;
          setIsGenerating(false);
        }
      };
    } catch (err: unknown) {
      console.error("[storyboard] generate error:", err);
      setIsGenerating(false);
    }
  }, [isGenerating, script, materials, materialRoles, globalPrefix, projectId, history, finalPrompts, forceSave, llmModel]);

  const cancelGeneration = useCallback(() => {
    generateSseRef.current?.close();
    generateSseRef.current = null;
    generateJobIdRef.current = null;
    setIsGenerating(false);
  }, []);

  // ─── AI: Generate prompts (worker-based) ───
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false);
  const [promptsProgress, setPromptsProgress] = useState("");
  const promptJobIdRef = useRef<string | null>(null);
  const promptSseRef = useRef<EventSource | null>(null);

  const generatePrompts = useCallback(async () => {
    if (isGeneratingPrompts || shots.length === 0) return;

    // Save current prompts as history before regenerating
    if (finalPrompts.trim().length > 0) {
      setPromptsHistory((prev) => [...prev, {
        timestamp: new Date().toISOString(),
        label: `提示词 v${prev.length + 1}`,
        llmModel,
        finalPrompts,
      }].slice(-MAX_STEP_HISTORY));
    }

    setIsGeneratingPrompts(true);
    setCurrentStep(5);
    setFinalPrompts("");
    setPromptsProgress("");

    try {
      const selectedMats = materials.filter((m) => m.id in materialRoles);
      const assetList: { type: string; name: string; description: string }[] = selectedMats.map((m) => {
        const a = materialRoles[m.id];
        return {
          type: a?.role ?? "prop",
          name: a?.name || m.name,
          description: a?.desc || m.description || "",
        };
      });
      const matNames = new Set(assetList.map((a) => a.name));
      for (const a of assets) {
        if (!a.name || matNames.has(a.name)) continue;
        assetList.push({ type: a.type, name: a.name, description: a.description || "" });
      }

      // Submit job to worker
      const res = await fetch(`/api/projects/${projectId}/storyboard/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyboardMarkdown: rebuildStoryboardMarkdown(shots),
          assets: assetList,
          globalPrefix: globalPrefix || undefined,
          model: llmModel,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        console.error("[storyboard] prompts error:", res.status, err);
        if (err.code === "INSUFFICIENT_BALANCE") showToast(t("insufficientBalance"), "warning");
        setIsGeneratingPrompts(false);
        return;
      }

      const { jobId } = await res.json();
      promptJobIdRef.current = jobId;
      setPromptsProgress("0/0");

      // Subscribe to job SSE for progress
      const segmentTexts: string[] = [];
      const evtSource = new EventSource(`/api/jobs/${jobId}/sse`);
      promptSseRef.current = evtSource;

      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const status = data.status as string;

          if (status === "RUNNING" && data.kind === "storyboard.prompts") {
            if (data.progress) setPromptsProgress(data.progress);
            // Accumulate segment text when worker sends completed segment
            if (data.segmentText && data.segmentIndex != null) {
              segmentTexts[data.segmentIndex] = data.segmentText;
              const fullText = segmentTexts.filter(Boolean).join("\n\n");
              setFinalPrompts(fullText);
              // Progressive save — don't wait for SUCCEEDED
              void forceSave({ finalPrompts: fullText });
            }
          }

          if (status === "SUCCEEDED") {
            evtSource.close();
            promptSseRef.current = null;
            promptJobIdRef.current = null;
            setPromptsProgress("");

            // Use accumulated text as final result
            const fullText = segmentTexts.filter(Boolean).join("\n\n");
            setFinalPrompts(fullText);
            void forceSave({ finalPrompts: fullText });
            setIsGeneratingPrompts(false);
          }

          if (status === "FAILED" || status === "CANCELED") {
            evtSource.close();
            promptSseRef.current = null;
            promptJobIdRef.current = null;
            setPromptsProgress("");
            setIsGeneratingPrompts(false);
            if (data.error) {
              console.warn("[storyboard] prompts job failed:", data.error);
              showToast(humanizeJobError(data.error, t), "warning");
            }
          }
        } catch { /* skip malformed SSE */ }
      };

      let reconnectAttempts = 0;
      evtSource.onerror = () => {
        evtSource.close();
        promptSseRef.current = null;
        // Auto-reconnect with backoff (max 10 attempts)
        if (reconnectAttempts < 10 && promptJobIdRef.current) {
          reconnectAttempts++;
          const delay = Math.min(2000 * reconnectAttempts, 15000);
          console.log(`[storyboard] prompts SSE reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
          setPromptsProgress(t("promptsConnectionLost"));
          setTimeout(() => {
            const currentJobId = promptJobIdRef.current;
            if (!currentJobId) return;
            const newEvt = new EventSource(`/api/jobs/${currentJobId}/sse`);
            promptSseRef.current = newEvt;
            newEvt.onmessage = evtSource.onmessage;
            newEvt.onerror = evtSource.onerror;
          }, delay);
        } else {
          promptJobIdRef.current = null;
          setIsGeneratingPrompts(false);
          setPromptsProgress("");
        }
      };
    } catch (err: unknown) {
      console.error("[storyboard] prompts submit error:", err);
      setIsGeneratingPrompts(false);
    }
  }, [isGeneratingPrompts, shots, materials, materialRoles, globalPrefix, projectId, history, script, forceSave, llmModel, assets, t]);

  const cancelPromptGeneration = useCallback(async () => {
    const jobId = promptJobIdRef.current;
    if (jobId) {
      try {
        await fetch(`/api/jobs/${jobId}/cancel`, { method: "POST" });
      } catch { /* best-effort */ }
    }
    promptSseRef.current?.close();
    promptSseRef.current = null;
    promptJobIdRef.current = null;
    setPromptsProgress("");
    setIsGeneratingPrompts(false);
  }, []);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      promptSseRef.current?.close();
    };
  }, []);

  // ─── Send to canvas ───
  const addNodeWithData = useCanvasStore((s) => s.addNodeWithData);
  const addEdgeById = useCanvasStore((s) => s.addEdgeById);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const handleSendToCanvas = useCallback(async () => {
    if (!finalPrompts) return;

    const segments = parsePromptSegments(finalPrompts);
    if (segments.length === 0) return;

    // Default negative prompt for Seedance video
    const negativePrompt = "blur, distort, low quality, deformed, ugly, bad anatomy, watermark, text overlay";

    // Validate / recreate asset image nodes on canvas
    const canvasNodes = useCanvasStore.getState().nodes;
    const canvasNodeIds = new Set(canvasNodes.map((n) => n.id));
    let updatedAssets = [...assets];
    const assetCenter = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    let placedCount = updatedAssets.filter((a) => a.canvasNodeId && canvasNodeIds.has(a.canvasNodeId)).length;

    for (let i = 0; i < updatedAssets.length; i++) {
      const a = updatedAssets[i];
      if (!a.imageUrl) continue;
      // Node still exists → keep it
      if (a.canvasNodeId && canvasNodeIds.has(a.canvasNodeId)) continue;
      // Node missing or never created → probe actual image dimensions
      let aw: number, ah: number, ratio: string;
      const iw = a.imageWidth, ih = a.imageHeight;
      let pw = iw, ph = ih;
      if ((!pw || !ph) && a.imageUrl) {
        try {
          const dim = await new Promise<{ w: number; h: number }>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = reject;
            img.src = a.imageUrl!;
          });
          pw = dim.w; ph = dim.h;
        } catch { /* probe failed */ }
      }
      if (pw && ph && pw > 0 && ph > 0) {
        const short = 260;
        const r = pw / ph;
        if (r >= 1) { aw = Math.round(short * r); ah = short; }
        else { aw = short; ah = Math.round(short / r); }
        ratio = `${pw}:${ph}`;
      } else {
        const size = assetNodeSize(a.type);
        aw = size.w; ah = size.h;
        ratio = (ASSET_TYPE_GEN_CONFIG[a.type] ?? ASSET_TYPE_GEN_CONFIG.prop).ratio;
      }
      const ASSET_COLS = 6;
      const ASSET_CELL_W = aw + 40;
      const ASSET_CELL_H = ah + 40;
      const col = placedCount % ASSET_COLS;
      const row = Math.floor(placedCount / ASSET_COLS);
      const ax = assetCenter.x - (Math.min(updatedAssets.filter((a2) => a2.imageUrl).length, ASSET_COLS) * ASSET_CELL_W) / 2 + col * ASSET_CELL_W;
      const ay = assetCenter.y - ah / 2 - 300 + row * ASSET_CELL_H; // above video nodes
      const newId = addNodeWithData("image-gen", ax, ay, {
        label: a.name || "Asset",
        imageUrl: a.imageUrl,
        originalUrl: a.imageUrl,
        thumbnailUrl: a.thumbnailUrl || a.imageUrl,
        status: "succeeded",
        prompt: a.imagePrompt || "",
        aspect_ratio: ratio,
      }, { w: aw, h: ah });
      updatedAssets[i] = { ...a, canvasNodeId: newId };
      placedCount++;
    }
    // Persist updated canvasNodeIds
    setAssets(updatedAssets);

    // Build material name → info lookup for @mention resolution (with fuzzy keys)
    type MatInfo = { id: string; name: string; thumbnail_url?: string; type: "image" | "video" | "audio"; isAsset?: boolean };
    const selectedMats = materials.filter((m) => m.id in materialRoles);
    const matInfos: MatInfo[] = selectedMats.map((m) => ({
      id: m.id,
      name: materialRoles[m.id]?.name || m.name,
      thumbnail_url: m.thumbnail_url,
      type: m.type.toLowerCase() as "image" | "video" | "audio",
    }));
    // Build multi-key lookup: exact name, first word, name without parenthetical, etc.
    const matLookup = new Map<string, MatInfo>();
    for (const info of matInfos) {
      matLookup.set(info.name, info);
      // Strip parenthetical: "서연 (Seo-yeon)" → "서연"
      const stripped = info.name.replace(/\s*[（(][^)）]*[)）]\s*$/, "").trim();
      if (stripped && stripped !== info.name) matLookup.set(stripped, info);
      // First word: "City Background" → "City"
      const firstWord = info.name.split(/[\s,，]+/)[0];
      if (firstWord && firstWord !== info.name && !matLookup.has(firstWord)) matLookup.set(firstWord, info);
    }
    // Merge storyboard assets into lookup (canvasNodeId as ref target)
    for (const a of updatedAssets) {
      if (!a.canvasNodeId || !a.name) continue;
      const assetInfo: MatInfo = { id: a.canvasNodeId, name: a.name, thumbnail_url: a.thumbnailUrl || a.imageUrl, type: "image", isAsset: true };
      if (!matLookup.has(a.name)) matLookup.set(a.name, assetInfo);
      const stripped = a.name.replace(/\s*[（(][^)）]*[)）]\s*$/, "").trim();
      if (stripped && stripped !== a.name && !matLookup.has(stripped)) matLookup.set(stripped, assetInfo);
    }
    // Build regex: match @name (longest key first for greedy matching)
    const allKeys = [...matLookup.keys()].sort((a, b) => b.length - a.length);
    const mentionRegex = allKeys.length > 0
      ? new RegExp(`@(${allKeys.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=\\s|[，。,;；！!？?、]|$)`, "g")
      : null;

    // Convert a line of text to TipTap paragraph content, resolving @mentions to refMention nodes
    const lineToTipTapContent = (line: string): any[] => {
      if (!line || !mentionRegex) return line ? [{ type: "text", text: line }] : [];
      const nodes: any[] = [];
      let lastIdx = 0;
      mentionRegex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = mentionRegex.exec(line)) !== null) {
        if (match.index > lastIdx) nodes.push({ type: "text", text: line.slice(lastIdx, match.index) });
        const mat = matLookup.get(match[1]);
        if (mat) {
          nodes.push({
            type: "refMention",
            attrs: {
              id: mat.isAsset ? mat.id : `material-${mat.id}`,
              label: mat.name,
              thumbnailUrl: mat.thumbnail_url || null,
              refType: mat.type,
            },
          });
        } else {
          nodes.push({ type: "text", text: match[0] });
        }
        lastIdx = match.index + match[0].length;
      }
      if (lastIdx < line.length) nodes.push({ type: "text", text: line.slice(lastIdx) });
      return nodes.length > 0 ? nodes : [];
    };

    // Layout config — chain-friendly: fewer columns, more gap for edge arrows
    const NODE_W = 420;
    const NODE_H = 280;
    const GAP = 60;
    const COLS = 4;
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const gridW = Math.min(segments.length, COLS) * (NODE_W + GAP) - GAP;
    const startX = center.x - gridW / 2;
    const startY = center.y - NODE_H / 2;

    // Build asset name → canvasNodeId lookup for auto-connection
    // Match both @name and plain name in segment text for robust linking
    const assetEntries: { name: string; canvasNodeId: string }[] = [];
    for (const a of updatedAssets) {
      if (!a.canvasNodeId || !a.name) continue;
      assetEntries.push({ name: a.name, canvasNodeId: a.canvasNodeId });
      // Also match without parenthetical: "서연 (Seo-yeon)" → "서연"
      const stripped = a.name.replace(/\s*[（(][^)）]*[)）]\s*$/, "").trim();
      if (stripped && stripped !== a.name) assetEntries.push({ name: stripped, canvasNodeId: a.canvasNodeId });
    }

    const createdNodeIds: string[] = [];

    segments.forEach((seg, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = startX + col * (NODE_W + GAP);
      const y = startY + row * (NODE_H + GAP);

      // Extract duration from raw segment (before cleaning strips 段落时长 line)
      const durMatch = seg.content.match(/段落时长[：:]\s*([\d.]+)/);
      const segDuration = durMatch ? Math.round(parseFloat(durMatch[1])) : 5;
      // Clamp to Seedance 2.0 valid range [4-15]
      const duration = Math.max(4, Math.min(15, segDuration || 5));

      // Clean segment: strip metadata (段落标题/目标/时长/音频), keep only visual shot descriptions
      let segContent = cleanSegmentForPrompt(seg.content);

      // Reset absolute timestamps to start from 0 within each segment
      // Matches patterns like [8.0 - 12.0秒] or [8.0-12.0s]
      const tsMatches = [...segContent.matchAll(/\[([\d.]+)\s*[-–]\s*([\d.]+)\s*[秒s]\]/g)];
      if (tsMatches.length > 0) {
        const baseTime = Math.min(...tsMatches.map((m) => parseFloat(m[1])));
        if (baseTime > 0) {
          segContent = segContent.replace(
            /\[([\d.]+)\s*([-–])\s*([\d.]+)\s*([秒s])\]/g,
            (_, start, dash, end, unit) => {
              const s = (parseFloat(start) - baseTime).toFixed(1);
              const e = (parseFloat(end) - baseTime).toFixed(1);
              return `[${s}${dash}${e}${unit}]`;
            },
          );
        }
      }

      // Build final prompt: globalPrefix + segment content
      // Only prepend globalPrefix if LLM didn't already include it in the segment
      const promptParts: string[] = [];
      if (globalPrefix.trim() && !segContent.includes(globalPrefix.trim())) {
        promptParts.push(globalPrefix.trim());
      }
      promptParts.push(segContent);
      let fullPrompt = promptParts.join("\n\n");

      // Normalize @mentions: ensure space before @ and after name so they parse as standalone mention tags
      if (allKeys.length > 0) {
        const namesEsc = allKeys.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
        // Insert space before @ if preceded by non-whitespace (e.g. "描述@角色" → "描述 @角色")
        fullPrompt = fullPrompt.replace(new RegExp(`(\\S)(@(?:${namesEsc}))`, "g"), "$1 $2");
        // Insert space after @name if followed by non-whitespace/non-punctuation (e.g. "@角色走路" → "@角色 走路")
        fullPrompt = fullPrompt.replace(new RegExp(`(@(?:${namesEsc}))([^\\s，。,;；！!？?、\\n])`, "g"), "$1 $2");
      }

      // Build TipTap JSON with material @mentions resolved to refMention nodes
      const promptJson = {
        type: "doc",
        content: fullPrompt.split("\n").map((line) => ({
          type: "paragraph",
          content: lineToTipTapContent(line),
        })),
      };

      const nodeId = addNodeWithData("video-gen" as NodeType, x, y, {
        label: `Segment ${seg.index}`,
        prompt: fullPrompt,
        prompt_json: promptJson,
        promptNegative: negativePrompt,
        model_id: "seedance-2",
        aspect_ratio: "16:9",
        duration_s: duration,
        generate_audio: true,
        resolution: "720p",
        video_ref_mode: "imageRef",
        fps: "25",
        status: "idle",
      } as Partial<NodeData>, { w: NODE_W, h: NODE_H });

      createdNodeIds.push(nodeId);

      // Connect asset image nodes referenced in this segment (match @name or plain name)
      const connected = new Set<string>();
      const normalizedSegContent = seg.content;
      for (const entry of assetEntries) {
        if (connected.has(entry.canvasNodeId)) continue;
        if (normalizedSegContent.includes(`@${entry.name}`) || normalizedSegContent.includes(entry.name)) {
          addEdgeById(entry.canvasNodeId, nodeId);
          connected.add(entry.canvasNodeId);
        }
      }
    });

    // Auto-connect sequential segments to form a video chain (seg1 → seg2 → seg3 → ...)
    for (let i = 0; i < createdNodeIds.length - 1; i++) {
      addEdgeById(createdNodeIds[i], createdNodeIds[i + 1]);
    }

    // Close panel and fit view to new nodes
    onClose();
    requestAnimationFrame(() => {
      fitView({ nodes: createdNodeIds.map((id) => ({ id })), padding: 0.15, duration: 400 });
    });
  }, [finalPrompts, globalPrefix, materials, materialRoles, assets, setAssets, addNodeWithData, addEdgeById, screenToFlowPosition, onClose, fitView]);


  // ─── Import / Export handlers ───
  const handleImport = useCallback((tab: "script" | "storyboard" | "prompts") => {
    const input = document.createElement("input");
    input.type = "file";
    if (tab === "script") input.accept = ".docx,.txt,.md,.text";
    else if (tab === "storyboard") input.accept = ".xlsx,.xls,.csv";
    else input.accept = ".md,.txt,.text";

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        if (tab === "script") {
          if (file.name.endsWith(".docx")) {
            const mammoth = await import("mammoth");
            const buf = await file.arrayBuffer();
            const result = await mammoth.default.extractRawText({ arrayBuffer: buf });
            setScript((result.value || "").slice(0, 50000));
          } else {
            const text = await file.text();
            setScript(text.slice(0, 50000));
          }
          showToast(t("scriptImportSuccess"), "success");
        } else if (tab === "storyboard") {
          const XLSX = await import("xlsx");
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws);
          const imported: StoryboardShot[] = rows.map((r, i) => ({
            id: `imported-${Date.now()}-${i}`,
            shotNumber: String(r["镜号"] || r["Shot"] || r["#"] || i + 1),
            duration: String(r["时长"] || r["Duration"] || ""),
            shotType: String(r["景别"] || r["Shot Type"] || ""),
            movement: String(r["运镜"] || r["Movement"] || ""),
            visual: String(r["画面描述"] || r["Visual"] || ""),
            audio: String(r["音效"] || r["音频"] || r["SFX"] || r["Audio"] || ""),
            dialogue: String(r["台词"] || r["对白"] || r["Dialogue"] || ""),
            note: String(r["备注"] || r["Note"] || ""),
          }));
          if (imported.length > 0) {
            setShots(imported);
            showToast(t("storyboardImportSuccess", { count: imported.length }), "success");
          } else {
            showToast(t("storyboardImportFailed"), "warning");
          }
        } else {
          const text = await file.text();
          setFinalPrompts(text);
          showToast(t("promptsImportSuccess"), "success");
        }
      } catch (err) {
        console.error("[storyboard] import error:", err);
        const msg = tab === "script" ? t("scriptImportFailed") : tab === "storyboard" ? t("storyboardImportFailed") : t("promptsImportFailed");
        showToast(msg, "warning");
      }
    };
    input.click();
  }, [setScript, setShots, setFinalPrompts, t]);

  const handleExport = useCallback(async (tab: "script" | "storyboard" | "prompts") => {
    try {
      if (tab === "script") {
        if (!script.trim()) { showToast(t("scriptEmpty"), "warning"); return; }
        const { Document, Packer, Paragraph, TextRun } = await import("docx");
        const doc = new Document({
          sections: [{
            children: script.split("\n").map((line) => new Paragraph({ children: [new TextRun(line)] })),
          }],
        });
        const blob = await Packer.toBlob(doc);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "script.docx"; a.click();
        URL.revokeObjectURL(url);
      } else if (tab === "storyboard") {
        if (shots.length === 0) { showToast(t("storyboardExportEmpty"), "warning"); return; }
        const XLSX = await import("xlsx");
        const data = shots.map((s) => ({
          "镜号": s.shotNumber,
          "时长": s.duration,
          "景别": s.shotType,
          "运镜": s.movement,
          "画面描述": s.visual,
          "音效": s.audio,
          "台词": s.dialogue || "",
          "备注": s.note,
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        // Auto-width columns
        const colWidths = Object.keys(data[0]).map((key) => ({
          wch: Math.max(key.length * 2, ...data.map((r) => String((r as Record<string, string>)[key] || "").length).slice(0, 20), 8),
        }));
        ws["!cols"] = colWidths;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Storyboard");
        XLSX.writeFile(wb, "storyboard.xlsx");
      } else {
        if (!finalPrompts.trim()) { showToast(t("promptsEmpty"), "warning"); return; }
        const blob = new Blob([finalPrompts], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "prompts.md"; a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("[storyboard] export error:", err);
    }
  }, [script, shots, finalPrompts, t]);

  // Compute step statuses and progress for nav
  const stepStatuses: StepStatus[] = useMemo(() => {
    return STEPS.map((step) => {
      if (step.num === currentStep) return "active";
      switch (step.num) {
        case 1: return script.trim().length > 0 ? "completed" : "pending";
        case 2: return globalPrefix.trim().length > 0 ? "completed" : "pending";
        case 3: return assets.length > 0 ? "completed" : "pending";
        case 4: return shots.length > 0 ? "completed" : "pending";
        case 5: return finalPrompts.trim().length > 0 ? "completed" : "pending";
        default: return "pending";
      }
    });
  }, [currentStep, script, globalPrefix, assets, shots, finalPrompts]);

  const stepProgress: number[] = useMemo(() => {
    const assetPct = assets.length > 0 ? Math.round(assets.filter((a) => a.imageUrl).length / assets.length * 100) : 0;
    return [
      script.trim().length > 0 ? 100 : 0,
      globalPrefix.trim().length > 0 ? 100 : 0,
      assetPct,
      shots.length > 0 ? 100 : 0,
      finalPrompts.trim().length > 0 ? 100 : 0,
    ];
  }, [script, globalPrefix, assets, shots, finalPrompts]);

  // Map currentStep to import/export tab key
  const importExportKey = useMemo(() => {
    const map: Record<number, "script" | "storyboard" | "prompts" | null> = { 1: "script", 4: "storyboard", 5: "prompts" };
    return map[currentStep] ?? null;
  }, [currentStep]);

  // Session helpers
  const openSession = useCallback((session: StoryboardSession) => {
    setActiveSessionId(session.id);
    setEditingTitle(session.title ?? "");
    setScript(session.script);
    setGlobalPrefix(session.styleDescription);
    setStylePreset(session.stylePreset);
    setAspectRatio(session.aspectRatio ?? "16:9");
    setStyleImageUrl(session.styleImageUrl);
    setMaterialRoles(session.materialRoles);
    setShots(renumberShots(session.shots.map((s) => ({ ...s, dialogue: s.dialogue ?? "" }))));
    setGenerationLog(session.generationLog);
    setFinalPrompts(session.finalPrompts);
    setHistory(session.history ?? []);
    setAssetsHistory(session.assetsHistory ?? []);
    setStoryboardHistory(session.storyboardHistory ?? []);
    setPromptsHistory(session.promptsHistory ?? []);
    setAssets(session.assets);
    setLlmModel(session.llmModel);
    setCurrentStep(session.currentStep || 1);
    setCurrentView("editor");
  }, []);

  const createNewSession = useCallback(() => {
    const session = createEmptySession();
    setSessions((prev) => [session, ...prev]);
    openSession(session);
  }, [openSession]);

  const backToList = useCallback(() => {
    // Save current session state before going back
    if (activeSessionId) {
      void forceSave();
    }
    setCurrentView("list");
  }, [activeSessionId, forceSave]);

  const deleteSession = useCallback((sessionId: string) => {
    const updated = sessions.filter((s) => s.id !== sessionId);
    setSessions(updated);
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setCurrentView("list");
    }
    // Persist deletion
    const payload = { storyboard_data: { sessions: updated }, version: versionRef.current };
    void doSave(payload);
  }, [activeSessionId, sessions, doSave]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    /* ── Full-screen overlay ── */
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {/* ── Modal ── */}
      <div
        className="relative w-[calc(100vw-48px)] h-[calc(100vh-48px)] max-w-[1400px] flex flex-col bg-white dark:bg-[#141414] rounded-2xl border border-zinc-200 dark:border-white/[0.08] text-zinc-800 dark:text-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between h-12 px-4 border-b border-zinc-100 dark:border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-3">
            {currentView === "editor" && (
              <button onClick={backToList} className="flex items-center justify-center size-7 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-400 dark:text-white/40 hover:text-zinc-800 dark:hover:text-white transition-colors cursor-pointer mr-1">
                <ChevronLeft size={16} />
              </button>
            )}
            <Clapperboard size={16} className="text-lime-600 dark:text-[#CCFF00]/70" />
            {currentView === "editor" ? (
              <input
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                placeholder={t("untitledSession")}
                className="text-sm font-semibold text-zinc-800 dark:text-white/90 bg-transparent border-none outline-none placeholder:text-zinc-400 dark:placeholder:text-white/30 w-40 truncate"
              />
            ) : (
              <span className="text-sm font-semibold text-zinc-800 dark:text-white/90">{t("mySessions")}</span>
            )}
            {currentView === "editor" && (
              <>
                {saveStatus === "saving" && <span className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-white/30"><Loader2 size={10} className="animate-spin" /></span>}
                {saveStatus === "unsaved" && <span className="size-1.5 rounded-full bg-amber-400" />}
                {saveStatus === "saved" && <span className="size-1.5 rounded-full bg-emerald-400" />}
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onClose}
              className="flex items-center justify-center size-8 rounded-lg hover:bg-zinc-100 dark:hover:bg-white/[0.06] text-zinc-400 dark:text-white/40 hover:text-zinc-800 dark:hover:text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {!loaded ? (
            <div className="flex items-center justify-center w-full h-full">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400 dark:text-white/20" />
            </div>
          ) : currentView === "list" ? (
            /* ── Session list (landing page) ── */
            <div className="flex-1 overflow-auto p-6 bg-zinc-50 dark:bg-transparent">
              <div>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {/* Create new — first card */}
                  <button
                    onClick={createNewSession}
                    className="group flex flex-col items-center justify-center aspect-[9/16] rounded-xl border-2 border-dashed border-zinc-200 dark:border-white/[0.1] hover:border-lime-500 dark:hover:border-[#CCFF00]/40 bg-white dark:bg-white/[0.02] hover:bg-lime-50/20 dark:hover:bg-[#CCFF00]/[0.04] text-zinc-400 dark:text-white/30 hover:text-lime-600 dark:hover:text-[#CCFF00]/80 transition-all cursor-pointer shadow-sm"
                  >
                    <Sparkles size={24} className="mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-medium">{t("createNew")}</span>
                  </button>

                  {/* Session cards */}
                  {sessions.map((session) => {
                    const title = sessionTitle(session) || t("untitledSession");
                    const shotCount = session.shots.length;
                    const stepNum = session.currentStep || 1;
                    return (
                      <div
                        key={session.id}
                        onClick={() => openSession(session)}
                        className="group relative flex flex-col aspect-[9/16] rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] hover:bg-zinc-50 dark:hover:bg-white/[0.05] hover:border-zinc-300 dark:hover:border-white/[0.15] transition-all cursor-pointer overflow-hidden text-left shadow-sm"
                      >
                        {/* Card top — dark area */}
                        <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-white/[0.03] dark:to-white/[0.01] relative border-b border-zinc-100 dark:border-transparent">
                          <Clapperboard size={28} className="text-zinc-300 dark:text-white/10" />
                          {shotCount > 0 && (
                            <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-lime-100 dark:bg-[#CCFF00]/20 text-lime-700 dark:text-[#CCFF00]/80">
                              {t("sessionShotCount", { count: shotCount })}
                            </span>
                          )}
                        </div>
                        {/* Card bottom — title + meta */}
                        <div className="p-2.5 border-t border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-transparent">
                          <p className="text-[11px] font-medium text-zinc-700 dark:text-white/80 truncate">{title}</p>
                          <p className="text-[10px] text-zinc-400 dark:text-white/30 mt-0.5">
                            {new Date(session.updatedAt).toLocaleDateString()}
                          </p>
                          <div className="flex items-center gap-1 mt-1.5">
                            {STEPS.map((s) => (
                              <div key={s.num} className={`size-1.5 rounded-full ${s.num <= stepNum ? "bg-lime-600 dark:bg-[#CCFF00]/60" : "bg-zinc-200 dark:bg-white/[0.1]"}`} />
                            ))}
                          </div>
                        </div>
                        {/* Delete button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                          className="absolute top-2 left-2 size-6 flex items-center justify-center rounded bg-white/80 dark:bg-black/40 text-zinc-400 dark:text-white/30 hover:text-red-500 dark:hover:text-red-400 border border-zinc-200 dark:border-transparent shadow-sm opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* ── Editor: left sidebar + content ── */
            <>
              {/* Left step nav */}
              <div className="w-48 flex-shrink-0 border-r border-white/[0.06] flex flex-col py-3 px-2 gap-0.5">
                {STEPS.map((step, i) => {
                  const status = stepStatuses[i];
                  const isActive = status === "active";
                  const pct = stepProgress[i];
                  // Compute subtitle(s) for each step
                  let subtitle: string | null = null;
                  let subtitleLines: string[] = [];
                  if (step.num === 2 && stylePreset) {
                    const preset = STYLE_PRESETS.find((p) => p.id === stylePreset);
                    if (preset) subtitle = t(preset.labelKey);
                  } else if (step.num === 3 && assets.length > 0) {
                    const scenes = assets.filter((a) => a.type === "scene").length;
                    const chars = assets.filter((a) => a.type === "character").length;
                    const props = assets.filter((a) => a.type === "prop").length;
                    if (scenes > 0) subtitleLines.push(t("navSceneCount", { count: scenes }));
                    if (chars > 0) subtitleLines.push(t("navCharacterCount", { count: chars }));
                    if (props > 0) subtitleLines.push(t("navPropCount", { count: props }));
                  } else if (step.num === 4 && shots.length > 0) {
                    subtitle = t("navShotCount", { count: shots.length });
                  }
                  return (
                    <button
                      key={step.num}
                      onClick={() => setCurrentStep(step.num)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${
                        isActive
                          ? "bg-lime-500/10 text-lime-700 dark:bg-[#CCFF00]/10 dark:text-[#CCFF00]"
                          : "text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:text-white/50 dark:hover:text-white/70 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      {/* Step number / status icon */}
                      <span className={`size-6 flex items-center justify-center rounded-full text-[11px] font-bold flex-shrink-0 ${
                        status === "completed" ? "bg-lime-500/20 text-lime-700 dark:bg-[#CCFF00]/20 dark:text-[#CCFF00]" :
                        isActive ? "bg-lime-600 dark:bg-[#CCFF00] text-white dark:text-black" :
                        "bg-zinc-200/50 dark:bg-white/[0.08] text-zinc-400 dark:text-white/40"
                      }`}>
                        {status === "completed" ? <Check size={12} /> : step.num}
                      </span>
                      <div className="min-w-0">
                        <span className="text-xs font-medium truncate block">{t(step.labelKey)}</span>
                        {subtitle && <span className="text-[10px] text-zinc-400 dark:text-white/30 truncate block">{subtitle}</span>}
                        {subtitleLines.length > 0 && subtitleLines.map((line, li) => (
                          <span key={li} className="text-[10px] text-zinc-400 dark:text-white/30 truncate block">{line}</span>
                        ))}
                        {!subtitle && subtitleLines.length === 0 && pct > 0 && pct < 100 && (
                          <span className="text-[9px] text-zinc-400 dark:text-white/25 font-mono block">{pct}%</span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {/* Import/Export for applicable steps */}
                {importExportKey && (
                  <div className="mt-auto pt-3 border-t border-white/[0.06] flex flex-col gap-0.5">
                    <button type="button" onClick={() => handleImport(importExportKey)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] text-white/30 hover:text-white/60 transition-colors cursor-pointer text-[11px]">
                      <Upload size={12} />
                      {importExportKey === "script" ? t("importScript") : importExportKey === "storyboard" ? t("importStoryboard") : t("importPrompts")}
                    </button>
                    <button type="button" onClick={() => handleExport(importExportKey)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/[0.04] text-white/30 hover:text-white/60 transition-colors cursor-pointer text-[11px]">
                      <Download size={12} />
                      {importExportKey === "script" ? t("exportScript") : importExportKey === "storyboard" ? t("exportStoryboard") : t("exportPrompts")}
                    </button>
                  </div>
                )}
              </div>

              {/* Right content area */}
              <div className="flex-1 overflow-hidden">
                {currentStep === 1 ? (
                  <ScriptTab
                    script={script}
                    setScript={setScript}
                    onNext={() => setCurrentStep(2)}
                    t={t}
                  />
                ) : currentStep === 2 ? (
                  <StyleTab
                    globalPrefix={globalPrefix}
                    setGlobalPrefix={setGlobalPrefix}
                    stylePreset={stylePreset}
                    setStylePreset={setStylePreset}
                    aspectRatio={aspectRatio}
                    setAspectRatio={setAspectRatio}
                    hasScript={script.trim().length > 0}
                    script={script}
                    projectId={projectId}
                    onNext={() => setCurrentStep(3)}
                    t={t}
                  />
                ) : currentStep === 3 ? (
                  <AssetsTab
                    assets={assets}
                    setAssets={setAssets}
                    isExtracting={isExtracting}
                    hasScript={script.trim().length > 0}
                    onReExtract={extractAssets}
                    onNextStep={() => setCurrentStep(4)}
                    materials={materials}
                    materialFolders={materialFolders}
                    refreshMaterials={refreshMaterials}
                    globalPrefix={globalPrefix}
                    llmModel={llmModel}
                    setLlmModel={setLlmModel}
                    showModelPicker={showModelPicker}
                    setShowModelPicker={setShowModelPicker}
                    modelPickerRef={modelPickerRef}
                    assetsHistory={assetsHistory}
                    onRestoreAssets={(entry) => { setAssets(entry.assets); }}
                    t={t}
                  />
                ) : currentStep === 4 ? (
                  <StoryboardTab
                    shots={shots}
                    onShotsChange={setShots}
                    isGenerating={isGenerating}
                    hasScript={script.trim().length > 0}
                    generationLog={generationLog}
                    onGenerate={generateStoryboard}
                    onNextStep={generatePrompts}
                    llmModel={llmModel}
                    setLlmModel={setLlmModel}
                    showModelPicker={showModelPicker}
                    setShowModelPicker={setShowModelPicker}
                    modelPickerRef={modelPickerRef}
                    storyboardHistory={storyboardHistory}
                    onRestoreStoryboard={(entry) => { setShots(entry.shots); setGenerationLog(entry.generationLog); }}
                    t={t}
                  />
                ) : (
                  <PromptsTab
                    finalPrompts={finalPrompts}
                    isGenerating={isGeneratingPrompts}
                    progress={promptsProgress}
                    onGenerate={generatePrompts}
                    onCancel={cancelPromptGeneration}
                    onSendToCanvas={handleSendToCanvas}
                    hasShots={shots.length > 0}
                    llmModel={llmModel}
                    setLlmModel={setLlmModel}
                    showModelPicker={showModelPicker}
                    setShowModelPicker={setShowModelPicker}
                    modelPickerRef={modelPickerRef}
                    promptsHistory={promptsHistory}
                    onRestorePrompts={(entry) => { setFinalPrompts(entry.finalPrompts); }}
                    t={t}
                  />
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </div>,
    document.body,
  );
}

/* ─── Style Tab (Step 2) ───────────────────────────── */

const ASPECT_RATIO_OPTIONS: { value: AspectRatioValue; ratio: string; descKey: string }[] = [
  { value: "9:16", ratio: "9:16", descKey: "ratio916Desc" },
  { value: "16:9", ratio: "16:9", descKey: "ratio169Desc" },
  { value: "1:1",  ratio: "1:1",  descKey: "ratio11Desc" },
  { value: "4:3",  ratio: "4:3",  descKey: "ratio43Desc" },
  { value: "3:4",  ratio: "3:4",  descKey: "ratio34Desc" },
  { value: "21:9", ratio: "21:9", descKey: "ratio219Desc" },
];

const VISIBLE_STYLE_COUNT = 7;

interface StyleRecommendation {
  styleId: string;
  reason: string;
}

function StyleTab({
  globalPrefix,
  setGlobalPrefix,
  stylePreset,
  setStylePreset,
  aspectRatio,
  setAspectRatio,
  hasScript,
  script,
  projectId,
  onNext,
  t,
}: {
  globalPrefix: string;
  setGlobalPrefix: (v: string) => void;
  stylePreset: string | null;
  setStylePreset: (v: string | null) => void;
  aspectRatio: AspectRatioValue;
  setAspectRatio: (v: AspectRatioValue) => void;
  hasScript: boolean;
  script: string;
  projectId: string;
  onNext: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const [showAllStyles, setShowAllStyles] = useState(false);
  const [recommendations, setRecommendations] = useState<StyleRecommendation[]>([]);
  const [isRecommending, setIsRecommending] = useState(false);

  const handlePresetSelect = (presetId: string) => {
    const preset = STYLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setStylePreset(presetId);
    setGlobalPrefix(t(`${preset.labelKey}Desc`));
  };

  const handleModalSelect = (presetId: string) => {
    handlePresetSelect(presetId);
    setShowAllStyles(false);
  };

  const handleRecommend = useCallback(async () => {
    if (!script.trim() || isRecommending) return;
    setIsRecommending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/storyboard/recommend-style`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });
      if (!res.ok) {
        console.error("[recommend-style] HTTP", res.status);
        return;
      }
      const data = await res.json();
      const recs: StyleRecommendation[] = (data.recommendations || [])
        .filter((r: StyleRecommendation) => STYLE_PRESETS.some((p) => p.id === r.styleId));
      setRecommendations(recs);
    } catch (err) {
      console.error("[recommend-style] error:", err);
    } finally {
      setIsRecommending(false);
    }
  }, [script, projectId, isRecommending]);

  // Build visible presets: selected first (if any), then remaining up to VISIBLE_STYLE_COUNT
  const visiblePresets = useMemo(() => {
    if (!stylePreset) return STYLE_PRESETS.slice(0, VISIBLE_STYLE_COUNT);
    const selected = STYLE_PRESETS.find((p) => p.id === stylePreset);
    const others = STYLE_PRESETS.filter((p) => p.id !== stylePreset);
    return selected ? [selected, ...others.slice(0, VISIBLE_STYLE_COUNT - 1)] : STYLE_PRESETS.slice(0, VISIBLE_STYLE_COUNT);
  }, [stylePreset]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto px-6 py-5 space-y-7">

        {/* ── Section: Aspect Ratio ── */}
        <section>
          <h3 className="text-sm font-medium text-zinc-700 dark:text-white/80 mb-3">{t("aspectRatio")}</h3>
          <div className="grid grid-cols-3 gap-2">
            {ASPECT_RATIO_OPTIONS.map((opt) => {
              const isSelected = aspectRatio === opt.value;
              const [w, h] = opt.ratio.split(":").map(Number);
              const scale = 20 / Math.max(w, h);
              const rw = Math.round(w * scale);
              const rh = Math.round(h * scale);
              return (
                <button
                  key={opt.value}
                  onClick={() => setAspectRatio(opt.value)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all cursor-pointer text-left ${
                    isSelected
                      ? "border-lime-500/80 bg-lime-500/10 text-lime-700 dark:border-[#CCFF00]/80 dark:bg-[#CCFF00]/10 dark:text-[#CCFF00]"
                      : "border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-100 dark:border-white/10 dark:text-white/50 dark:hover:border-white/20 dark:hover:bg-white/[0.03]"
                  }`}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                    <rect
                      x={(24 - rw) / 2} y={(24 - rh) / 2}
                      width={rw} height={rh}
                      rx={1.5}
                      stroke="currentColor" strokeWidth={isSelected ? 1.6 : 1}
                      fill={isSelected ? "currentColor" : "none"} fillOpacity={isSelected ? 0.15 : 0}
                    />
                  </svg>
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold block">{opt.ratio}</span>
                    <span className={`text-[10px] block truncate ${isSelected ? "text-lime-600/70 dark:text-[#CCFF00]/60" : "text-zinc-400 dark:text-white/30"}`}>{t(opt.descKey)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Section: AI Recommendation ── */}
        <section className="rounded-xl border border-lime-500/20 dark:border-[#CCFF00]/20 bg-lime-500/[0.03] dark:bg-[#CCFF00]/[0.03] p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <Atom size={14} className="text-lime-600 dark:text-[#CCFF00]" />
            <h3 className="text-sm font-medium text-lime-700 dark:text-[#CCFF00]/90">{t("aiRecommend")}</h3>
          </div>
          <p className="text-[11px] text-zinc-500 dark:text-white/40 mb-3">{t("aiRecommendHint")}</p>
          <button
            disabled={!hasScript || isRecommending}
            onClick={handleRecommend}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-lime-500/10 dark:bg-[#CCFF00]/10 border border-lime-500/30 dark:border-[#CCFF00]/30 text-lime-700 dark:text-[#CCFF00] text-xs font-medium hover:bg-lime-500/20 dark:hover:bg-[#CCFF00]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {isRecommending ? <Loader2 size={12} className="animate-spin" /> : <Atom size={12} />}
            <span>{isRecommending ? t("aiAnalyzing") : t("aiAnalyzeBtn")}</span>
          </button>

          {/* Recommendation results */}
          {recommendations.length > 0 && (
            <div className="mt-3 space-y-2">
              {recommendations.map((rec) => {
                const preset = STYLE_PRESETS.find((p) => p.id === rec.styleId);
                if (!preset) return null;
                const isSelected = stylePreset === rec.styleId;
                return (
                  <button
                    key={rec.styleId}
                    onClick={() => handlePresetSelect(rec.styleId)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left ${
                      isSelected
                        ? "border-lime-500/60 bg-lime-500/10 dark:border-[#CCFF00]/60 dark:bg-[#CCFF00]/10"
                        : "border-zinc-200 bg-zinc-50 hover:border-lime-500/30 hover:bg-lime-500/[0.03] dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-[#CCFF00]/30 dark:hover:bg-[#CCFF00]/[0.03]"
                    }`}
                  >
                    <img
                      src={`/styles/${preset.id}.png`}
                      alt={t(preset.labelKey)}
                      className="w-10 h-10 rounded-lg flex-shrink-0 object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <span className={`text-[12px] font-medium block ${isSelected ? "text-lime-700 dark:text-[#CCFF00]" : "text-zinc-800 dark:text-white/90"}`}>
                        {t(preset.labelKey)}
                      </span>
                      <span className="text-[10px] text-zinc-500 dark:text-white/40 block truncate">{rec.reason}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Section: Style Library (visible cards + "浏览全部") ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-700 dark:text-white/80">{t("styleDescription")}</h3>
            <button
              onClick={() => setShowAllStyles(true)}
              className="text-[11px] text-zinc-400 dark:text-white/40 hover:text-lime-600 dark:hover:text-[#CCFF00] transition-colors cursor-pointer"
            >
              {t("browseAll")} →
            </button>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2.5">
            {visiblePresets.map((preset) => {
              const isSelected = stylePreset === preset.id;
              return (
                <div
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset.id)}
                  className={`group relative w-full aspect-square overflow-hidden rounded-2xl border cursor-pointer transition-all ${
                    isSelected ? "border-lime-500 ring-1 ring-lime-500/40 dark:border-[#CCFF00] dark:ring-1 dark:ring-[#CCFF00]/40" : "border-transparent hover:border-zinc-200 dark:hover:border-white/20"
                  }`}
                >
                  <img
                    src={`/styles/${preset.id}.png`}
                    alt={t(preset.labelKey)}
                    className="absolute inset-0 w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-110"
                  />
                  {/* Name + short desc overlay */}
                  <div className="absolute bottom-0 left-0 right-0 h-[40%] rounded-b-2xl flex flex-col items-center justify-center bg-black/60 backdrop-blur-[5px] px-2">
                    <span className={`text-[12px] font-medium truncate w-full text-center ${isSelected ? "text-lime-400 dark:text-[#CCFF00]" : "text-white"}`}>
                      {t(preset.labelKey)}
                    </span>
                    <span className="text-[9px] text-white/40 truncate w-full text-center mt-0.5">
                      {t(`${preset.labelKey}Desc`).slice(0, 12)}...
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Section: Selected Style Detail (editable prompt) ── */}
        <section>
          <h3 className="text-sm font-medium text-zinc-700 dark:text-white/80 mb-2">
            {stylePreset ? t("selectedStyleDetail") : t("styleCustomInput")}
          </h3>
          <textarea
            value={globalPrefix}
            onChange={(e) => {
              setGlobalPrefix(e.target.value);
              if (stylePreset && e.target.value !== t(`${STYLE_PRESETS.find((p) => p.id === stylePreset)?.labelKey}Desc`)) {
                setStylePreset(null);
              }
            }}
            placeholder={t("styleDescPlaceholder")}
            className={`w-full h-24 rounded-xl border px-4 py-3 text-xs outline-none resize-none leading-relaxed transition-colors text-zinc-800 dark:text-white/80 placeholder:text-zinc-400 dark:placeholder:text-white/20 ${
              stylePreset
                ? "bg-lime-500/[0.03] border-lime-500/20 focus:border-lime-500/40 dark:bg-[#CCFF00]/[0.03] dark:border-[#CCFF00]/20 dark:focus:border-[#CCFF00]/40"
                : "bg-zinc-50 dark:bg-white/[0.03] border-zinc-200 dark:border-white/[0.08] focus:border-zinc-300 dark:focus:border-white/20"
            }`}
          />
        </section>

        {/* ── Section: Upload Reference Image ── */}
        <section>
          <h3 className="text-sm font-medium text-zinc-700 dark:text-white/80 mb-1">{t("uploadStyleImage")}</h3>
          <p className="text-[11px] text-zinc-400 dark:text-white/30 mb-3">{t("uploadStyleImageHint")}</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2">
            <button className="w-full aspect-square rounded-2xl border border-dashed border-zinc-200 dark:border-white/30 flex flex-col items-center justify-center gap-1.5 bg-zinc-50 dark:bg-white/[0.02] hover:bg-zinc-100 dark:hover:bg-white/[0.05] hover:border-zinc-300 dark:hover:border-white/50 text-zinc-400 dark:text-white/50 transition-all cursor-pointer">
              <Upload size={18} className="text-zinc-400 dark:text-white/50" />
              <span className="text-[11px] text-white/50">{t("addStyle")}</span>
            </button>
          </div>
        </section>
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-end w-full p-2 h-14 border-t border-zinc-100 dark:border-white/[0.06] flex-shrink-0">
        <div
          className="flex items-center gap-1.5 rounded-full p-1 pl-2.5 border cursor-pointer"
          style={{
            backdropFilter: "blur(10px)",
            background: "var(--credits-pill-bg)",
            borderColor: "var(--credits-pill-border)",
          }}
        >
          <span className="text-xs" style={{ color: "var(--credits-pill-text)" }}>{t("navNext")}</span>
          <button
            disabled={!hasScript}
            onClick={onNext}
            className="w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90 hover:scale-105 active:scale-95"
            style={{
              background: "var(--credits-pill-btn-bg)",
              color: "var(--credits-pill-btn-text)",
            }}
          >
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* ── All Styles Modal ── */}
      {showAllStyles && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAllStyles(false)} />
          <div
            className="relative w-[700px] max-w-[90vw] max-h-[756px] rounded-[20px] border border-white/10 flex flex-col overflow-hidden"
            style={{ background: "#1c1e20" }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0 border-b border-white/[0.06]">
              <h3 className="text-lg font-medium text-white">{t("allStyles")}</h3>
              <button
                onClick={() => setShowAllStyles(false)}
                className="text-white/60 hover:text-white text-2xl leading-none cursor-pointer"
              >
                ×
              </button>
            </div>
            {/* Modal body */}
            <div className="flex-1 overflow-auto p-6">
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-3 list-none p-0 m-0">
                {STYLE_PRESETS.map((preset) => {
                  const isSelected = stylePreset === preset.id;
                  return (
                    <li
                      key={preset.id}
                      onClick={() => handleModalSelect(preset.id)}
                      className={`group relative w-full aspect-square overflow-hidden rounded-2xl border cursor-pointer transition-all ${
                        isSelected ? "border-[#CCFF00] ring-1 ring-[#CCFF00]/40" : "border-transparent hover:border-white/20"
                      }`}
                    >
                      <img
                        src={`/styles/${preset.id}.png`}
                        alt={t(preset.labelKey)}
                        className="absolute inset-0 w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-110"
                      />
                      <div className="absolute bottom-0 left-0 right-0 h-[38%] rounded-b-2xl flex flex-col items-center justify-center bg-black/60 backdrop-blur-[5px] px-2">
                        <span className={`text-[12px] font-medium truncate w-full text-center ${isSelected ? "text-[#CCFF00]" : "text-white"}`}>
                          {t(preset.labelKey)}
                        </span>
                        <span className="text-[9px] text-white/40 truncate w-full text-center mt-0.5">
                          {t(`${preset.labelKey}Desc`).slice(0, 14)}...
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ─── Script Tab ───────────────────────────────────── */

const TYPE_ICON = { IMAGE: ImageIcon, VIDEO: Video, AUDIO: Music } as const;

function ScriptTab({
  script,
  setScript,
  onNext,
  t,
}: {
  script: string;
  setScript: (v: string) => void;
  onNext: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 px-4 pt-4 pb-4 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] font-medium uppercase tracking-widest text-zinc-500 dark:text-white/30">
            {t("scriptInput")}
          </label>
          <span className="text-[10px] tabular-nums text-zinc-400 dark:text-white/20">
            {t("scriptCharCount", { count: script.length.toLocaleString(), max: "50,000" })}
          </span>
        </div>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value.slice(0, 50000))}
          maxLength={50000}
          placeholder={t("scriptPlaceholder")}
          className="flex-1 w-full rounded-lg bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200 dark:border-white/[0.06] p-3 text-sm text-zinc-800 dark:text-white/80 placeholder:text-zinc-400 dark:placeholder:text-white/20 outline-none focus:border-zinc-300 dark:focus:border-white/15 transition-colors resize-none leading-relaxed"
        />
      </div>
      {/* Bottom action bar */}
      <div className="flex items-center justify-end w-full p-2 h-14 border-t border-zinc-100 dark:border-white/[0.06] flex-shrink-0">
        <div
          className="flex items-center gap-1.5 rounded-full p-1 pl-2.5 border cursor-pointer"
          style={{
            backdropFilter: "blur(10px)",
            background: "var(--credits-pill-bg)",
            borderColor: "var(--credits-pill-border)",
          }}
        >
          <span className="text-xs" style={{ color: "var(--credits-pill-text)" }}>{t("navNext")}</span>
          <button
            disabled={!script.trim()}
            onClick={onNext}
            className="w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90 hover:scale-105 active:scale-95"
            style={{
              background: "var(--credits-pill-btn-bg)",
              color: "var(--credits-pill-btn-text)",
            }}
          >
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Assets Tab ───────────────────────────────────── */

/* ── 3D Animated Folder Icon (brand neon green — matches MaterialPanel) ── */
function PickerFolderIcon({ hasContent = false }: { hasContent?: boolean }) {
  const uid = useRef(`pf-${Math.random().toString(36).slice(2, 7)}`).current;
  return (
    <div className="group/asset-folder relative w-6 h-6 shrink-0 select-none">
      <svg className="absolute left-0 w-6" viewBox="0 0 24 16" fill="none" style={{ top: 3, height: "15.25px" }}>
        <defs>
          <linearGradient id={`${uid}-back`} x1="12" y1="0" x2="12" y2="5.25" gradientUnits="userSpaceOnUse">
            <stop offset="0.3" stopColor="#7a9900" /><stop offset="1" stopColor="#4d6600" />
          </linearGradient>
        </defs>
        <path d="M1.90714 0C0.853857 0 0 0.853857 0 1.90714V15.25H24V3.83571C24 2.77059 23.1366 1.90714 22.0714 1.90714H11.1L10.4306 1.86058C10.0631 1.83501 9.71068 1.70474 9.4149 1.48517L8.09689 0.506737C7.65362 0.177671 7.11621 0 6.56415 0H1.90714Z" fill={`url(#${uid}-back)`} />
      </svg>
      {hasContent && (
        <div className="absolute z-[1] left-1 bottom-0 w-5 h-5 transition-transform duration-200 ease-out -rotate-[10deg] -translate-y-[8px] group-hover/asset-folder:-translate-y-[12px]" style={{ transformOrigin: "right bottom" }}>
          <svg className="h-full w-full" viewBox="-1 -0.5 22 17" fill="none">
            <defs>
              <linearGradient id={`${uid}-ib`} x1="10" y1="0" x2="10" y2="5" gradientUnits="userSpaceOnUse"><stop stopColor="#8fb300" /><stop offset="1" stopColor="#5c7a00" /></linearGradient>
              <radialGradient id={`${uid}-if`} cx="0.5" cy="0.5" r="0.6" gradientUnits="objectBoundingBox"><stop stopColor="#d4f04c" /><stop offset="1" stopColor="#8fb300" /></radialGradient>
            </defs>
            <path d="M1.5 0C.67 0 0 .67 0 1.5V14.5c0 .83.67 1.5 1.5 1.5h17c.83 0 1.5-.67 1.5-1.5V3.5c0-.83-.67-1.5-1.5-1.5H9.2l-.5-.04a2.4 2.4 0 0 1-.9-.46L6.7.6A1.8 1.8 0 0 0 5.6.1H1.5Z" fill={`url(#${uid}-ib)`} />
            <rect y="4" width="20" height="12" rx="1.5" fill={`url(#${uid}-if)`} />
          </svg>
        </div>
      )}
      <div className="absolute z-[2] bottom-0 left-0 w-6 rounded-[2px] overflow-hidden transition-[transform] duration-200 ease-out [transform:perspective(60px)_rotateX(0deg)] group-hover/asset-folder:[transform:perspective(60px)_rotateX(-30deg)]" style={{ height: 16, transformOrigin: "center bottom", boxShadow: "rgba(17,26,0,0.07) 0px -0.104px 1.166px 0px, rgba(17,26,0,0.25) 0px 0.207px 0.207px 0px, rgba(204,255,0,0.15) 0px 0.104px 0.207px 0px inset" }}>
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 24 16" fill="none">
          <defs>
            <radialGradient id={`${uid}-fr`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(12 8) scale(12 16.41)"><stop stopColor="#CCFF00" /><stop offset="1" stopColor="#6b8c00" /></radialGradient>
          </defs>
          <rect width="24" height="16" rx="2" fill={`url(#${uid}-fr)`} />
        </svg>
      </div>
    </div>
  );
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  character: "assetCharacter",
  scene: "assetScene",
  prop: "assetProp",
};

const ASSET_TYPES: ("character" | "scene" | "prop")[] = ["character", "scene", "prop"];

const ASSET_GEN_MODELS = IMAGE_MODELS.filter((m) => m.id in MODEL_QUALITY_PRICE).map((m) => {
  const prices = MODEL_QUALITY_PRICE[m.id];
  return { id: m.id, label: m.name, sizes: Object.keys(prices), price: prices };
});
const ASSET_TYPE_GEN_CONFIG: Record<string, { ratio: string }> = {
  character: { ratio: "16:9" },
  scene: { ratio: "16:9" },
  prop: { ratio: "16:9" },
};

function assetNodeSize(type: string, short = 260): { w: number; h: number } {
  const ratio = (ASSET_TYPE_GEN_CONFIG[type] ?? ASSET_TYPE_GEN_CONFIG.prop).ratio;
  const [rw, rh] = ratio.split(":").map(Number);
  if (!rw || !rh) return { w: short, h: short };
  const r = rw / rh;
  return r >= 1 ? { w: Math.round(short * r), h: short } : { w: short, h: Math.round(short / r) };
}

function IconTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 pointer-events-none z-[100]">
          <span className="whitespace-nowrap rounded-md bg-[#232323] border border-white/10 px-2 py-1 text-[10px] text-zinc-200 shadow-lg">
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

/* ─── Reusable History Dropdown ──────────────────────── */

function StepHistoryDropdown<T extends { timestamp: string; label: string; llmModel: string }>({
  entries,
  onRestore,
  t,
}: {
  entries: T[];
  onRestore: (entry: T) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  if (entries.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
        title={t("history")}
      >
        <History size={13} />
        <span>{entries.length}</span>
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-1 z-50 w-56 rounded-lg border border-white/10 bg-zinc-900/95 backdrop-blur-md shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-white/5 text-xs text-zinc-400 font-medium">{t("history")}</div>
          <div className="max-h-48 overflow-y-auto">
            {[...entries].reverse().map((entry, i) => (
              <button
                key={entry.timestamp}
                onClick={() => { onRestore(entry); setOpen(false); }}
                className="w-full flex items-center justify-between px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5 transition-colors"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{entry.label}</span>
                  <span className="text-[10px] text-zinc-500">{entry.llmModel} · {new Date(entry.timestamp).toLocaleString()}</span>
                </div>
                <Undo2 size={12} className="text-zinc-500 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AssetsTab({
  assets,
  setAssets,
  isExtracting,
  hasScript,
  onReExtract,
  onNextStep,
  materials,
  materialFolders,
  refreshMaterials,
  globalPrefix,
  llmModel,
  setLlmModel,
  showModelPicker,
  setShowModelPicker,
  modelPickerRef,
  assetsHistory,
  onRestoreAssets,
  t,
}: {
  assets: StoryboardAsset[];
  setAssets: (v: StoryboardAsset[] | ((prev: StoryboardAsset[]) => StoryboardAsset[])) => void;
  isExtracting: boolean;
  hasScript: boolean;
  onReExtract: () => void;
  onNextStep: () => void;
  materials: MaterialItem[];
  materialFolders: MaterialFolder[];
  refreshMaterials: () => Promise<void>;
  globalPrefix: string;
  llmModel: string;
  setLlmModel: (v: string) => void;
  showModelPicker: boolean;
  setShowModelPicker: (v: boolean) => void;
  modelPickerRef: React.RefObject<HTMLDivElement | null>;
  assetsHistory: AssetsHistoryEntry[];
  onRestoreAssets: (entry: AssetsHistoryEntry) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const tc = useTranslations("canvas");
  const { getQualityPrices: dynamicGetQualityPrices, getOutputQualityPrices: dynamicGetOutputQualityPrices } = useAllPricing();
  const [filterType, setFilterType] = useState<"all" | "character" | "scene" | "prop">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string; imagePrompt: string; type: "character" | "scene" | "prop" }>({ name: "", description: "", imagePrompt: "", type: "character" });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [moreMenuAssetId, setMoreMenuAssetId] = useState<string | null>(null);
  const [moreMenuPos, setMoreMenuPos] = useState<{ x: number; y: number } | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [canvasPickerForAssetId, setCanvasPickerForAssetId] = useState<string | null>(null);
  const [canvasPickerFilter, setCanvasPickerFilter] = useState<"all" | "image" | "video" | "audio">("all");
  const [materialPickerForAssetId, setMaterialPickerForAssetId] = useState<string | null>(null);
  const [refPickerMode, setRefPickerMode] = useState(false);
  const [pickerExpandedFolders, setPickerExpandedFolders] = useState<Set<string>>(new Set());
  const [materialPickerFilter, setMaterialPickerFilter] = useState<"all" | "image" | "video" | "audio">("all");
  const [pickerFolderMats, setPickerFolderMats] = useState<Record<string, MaterialItem[]>>({});
  const [pickerFolderLoading, setPickerFolderLoading] = useState(false);
  const openDetailView = useCanvasStore((s) => s.openDetailView);

  // ── Click-outside: close more menu ──
  useEffect(() => {
    if (!moreMenuAssetId) return;
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as unknown as globalThis.Node)) setMoreMenuAssetId(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreMenuAssetId]);

  // ── Recover asset generation state when panel re-opens ──
  const recoveredRef = useRef(false);
  useEffect(() => {
    if (recoveredRef.current) return;
    const pending = assets.filter((a) => a._genJobId);
    if (pending.length === 0) return;
    recoveredRef.current = true;

    setGeneratingIds((prev) => {
      const next = new Set(prev);
      pending.forEach((a) => next.add(a.id));
      return next;
    });

    const eventSources: EventSource[] = [];
    for (const asset of pending) {
      const assetId = asset.id;
      const jobId = asset._genJobId!;

      const es = new EventSource(`/api/jobs/${jobId}/sse`);
      eventSources.push(es);

      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.status === "SUCCEEDED" && data.url) {
            es.close();
            setAssets((prev) => prev.map((a) =>
              a.id === assetId
                ? { ...a, imageUrl: data.url, thumbnailUrl: data.thumbnailUrl || data.url, source: "generated" as AssetSource, _genJobId: undefined }
                : a,
            ));
            setGeneratingIds((prev) => { const s = new Set(prev); s.delete(assetId); return s; });
          } else if (data.status === "FAILED" || data.status === "CANCELED" || data.status === "CANCELLED") {
            es.close();
            showToast(t("assetGenFailed"), "warning");
            setAssets((prev) => prev.map((a) => a.id === assetId ? { ...a, _genJobId: undefined, _genFailed: true, _genError: t("assetGenFailed") } : a));
            setGeneratingIds((prev) => { const s = new Set(prev); s.delete(assetId); return s; });
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        es.close();
        showToast(t("assetGenFailed"), "warning");
        setAssets((prev) => prev.map((a) => a.id === assetId ? { ...a, _genJobId: undefined, _genFailed: true, _genError: t("assetGenFailed") } : a));
        setGeneratingIds((prev) => { const s = new Set(prev); s.delete(assetId); return s; });
      };
    }

    return () => { eventSources.forEach((es) => es.close()); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  // ─── Sync: clear canvasNodeId when canvas node is deleted ───
  const canvasNodesLength = useCanvasStore((s) => s.nodes.length);
  useEffect(() => {
    const nodeMap = useCanvasStore.getState()._nodeMap;
    const stale = assets.filter((a) => a.canvasNodeId && !nodeMap.has(a.canvasNodeId));
    if (stale.length > 0) {
      setAssets((prev) => prev.map((a) =>
        a.canvasNodeId && !nodeMap.has(a.canvasNodeId)
          ? { ...a, canvasNodeId: undefined }
          : a
      ));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasNodesLength]);

  // ─── Canvas integration ───
  const addNodeWithData = useCanvasStore((s) => s.addNodeWithData);
  const { screenToFlowPosition } = useReactFlow();

  const placeAssetOnCanvas = useCallback(async (assetId: string, imageUrl: string, thumbnailUrl: string | undefined, name: string, type: string, imagePrompt: string, imgW?: number, imgH?: number, modelId?: string, imageSize?: string) => {
    // Probe actual image dimensions when not provided
    let w = imgW, h = imgH;
    if ((!w || !h) && imageUrl) {
      try {
        const dim = await new Promise<{ w: number; h: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = reject;
          img.src = imageUrl;
        });
        w = dim.w; h = dim.h;
      } catch { /* probe failed, fall back to type ratio */ }
    }
    // Use actual image dimensions when available, fall back to type-based ratio
    let nodeW: number, nodeH: number, ratio: string;
    if (w && h && w > 0 && h > 0) {
      const short = 260;
      const r = w / h;
      if (r >= 1) { nodeW = Math.round(short * r); nodeH = short; }
      else { nodeW = short; nodeH = Math.round(short / r); }
      ratio = `${w}:${h}`;
    } else {
      const size = assetNodeSize(type);
      nodeW = size.w; nodeH = size.h;
      ratio = (ASSET_TYPE_GEN_CONFIG[type] ?? ASSET_TYPE_GEN_CONFIG.prop).ratio;
    }
    const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const existingCount = assets.filter((a) => a.canvasNodeId).length;
    const x = center.x - nodeW / 2 + existingCount * (nodeW + 40);
    const y = center.y - nodeH / 2;
    const nodeId = addNodeWithData("image-gen", x, y, {
      label: name || t("assetUntitled"),
      imageUrl,
      originalUrl: imageUrl,
      thumbnailUrl: thumbnailUrl || imageUrl,
      status: "succeeded",
      prompt: imagePrompt || "",
      model_id: modelId,
      image_size: imageSize,
      aspect_ratio: ratio,
    }, { w: nodeW, h: nodeH });

    // Store latest canvasNodeId in asset (old node stays on canvas)
    setAssets((prev) => prev.map((a) => a.id === assetId ? { ...a, canvasNodeId: nodeId } : a));
    return nodeId;
  }, [addNodeWithData, screenToFlowPosition, assets, setAssets, t]);

  const sendAllAssetsToCanvas = useCallback(async () => {
    const nodeMap = useCanvasStore.getState()._nodeMap;
    const needSend = assets.filter((a) => a.imageUrl && (!a.canvasNodeId || !nodeMap.has(a.canvasNodeId)));
    if (needSend.length === 0) {
      showToast(t("assetNoImagesToSend"), "warning");
      return;
    }
    for (const asset of needSend) {
      await placeAssetOnCanvas(asset.id, asset.imageUrl!, asset.thumbnailUrl, asset.name, asset.type, asset.imagePrompt, asset.imageWidth, asset.imageHeight);
    }
    showToast(t("assetSentToCanvas", { count: needSend.length }), "success");
  }, [assets, placeAssetOnCanvas, t]);

  const filtered = filterType === "all" ? assets : assets.filter((a) => a.type === filterType);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: assets.length, character: 0, scene: 0, prop: 0 };
    assets.forEach((a) => { c[a.type] = (c[a.type] || 0) + 1; });
    return c;
  }, [assets]);

  const addAsset = useCallback((type: "character" | "scene" | "prop") => {
    const newAsset: StoryboardAsset = {
      id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      name: "",
      description: "",
      imagePrompt: "",
    };
    setAssets((prev) => [...prev, newAsset]);
    setEditingId(newAsset.id);
    setEditForm({ name: "", description: "", imagePrompt: "", type });
  }, [setAssets]);

  const saveEdit = useCallback(() => {
    if (!editingId) return;
    setAssets((prev) => prev.map((a) =>
      a.id === editingId ? { ...a, name: editForm.name, description: editForm.description, imagePrompt: editForm.imagePrompt, type: editForm.type } : a
    ));
    setEditingId(null);
  }, [editingId, editForm, setAssets]);

  const removeAsset = useCallback((id: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    setDeletingId(null);
  }, [setAssets]);

  const startEdit = useCallback((asset: StoryboardAsset) => {
    setEditingId(asset.id);
    setEditForm({ name: asset.name, description: asset.description, imagePrompt: asset.imagePrompt, type: asset.type });
  }, []);

  // ─── Generate modal state ───
  const [genModalAssetId, setGenModalAssetId] = useState<string | null>(null);
  const [genPrompt, setGenPrompt] = useState("");
  const [genModel, setGenModel] = useState("nano-banana-pro");
  const [genSize, setGenSize] = useState("1K");
  const [genRatio, setGenRatio] = useState("16:9");
  const [genOutputQuality, setGenOutputQuality] = useState<string | null>(null);
  const [genRefImages, setGenRefImages] = useState<string[]>([]);
  const [showGenModelPicker, setShowGenModelPicker] = useState(false);
  const [showGenRatioPicker, setShowGenRatioPicker] = useState(false);
  const genModelRef = useRef<HTMLDivElement>(null);
  const genRatioRef = useRef<HTMLDivElement>(null);
  useClickOutside(genModelRef, showGenModelPicker, () => setShowGenModelPicker(false));
  useClickOutside(genRatioRef, showGenRatioPicker, () => setShowGenRatioPicker(false));

  // ── ESC: close sub-modals first, prevent parent from closing storyboard ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (canvasPickerForAssetId) { setCanvasPickerForAssetId(null); setRefPickerMode(false); e.stopImmediatePropagation(); return; }
      if (materialPickerForAssetId) { setMaterialPickerForAssetId(null); setRefPickerMode(false); e.stopImmediatePropagation(); return; }
      if (showGenModelPicker) { setShowGenModelPicker(false); e.stopImmediatePropagation(); return; }
      if (showGenRatioPicker) { setShowGenRatioPicker(false); e.stopImmediatePropagation(); return; }
      if (genModalAssetId) { setGenModalAssetId(null); e.stopImmediatePropagation(); return; }
      if (editingId) { setEditingId(null); e.stopImmediatePropagation(); return; }
      if (deletingId) { setDeletingId(null); e.stopImmediatePropagation(); return; }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [editingId, deletingId, genModalAssetId, canvasPickerForAssetId, materialPickerForAssetId, showGenModelPicker, showGenRatioPicker]);

  // ─── Generate image for asset via /api/generate/image + SSE ───
  const generateAssetImage = useCallback(async (assetId: string, prompt: string, assetType: string, modelId: string, imageSize: string, ratio?: string, refImages?: string[], outputQuality?: string | null) => {
    if (!prompt.trim() || generatingIds.has(assetId)) return;
    setGenModalAssetId(null);
    setGenRefImages([]);
    setGeneratingIds((prev) => new Set(prev).add(assetId));

    // Capture asset info for canvas placement after generation
    const asset = assets.find((a) => a.id === assetId);

    // Save old image for recovery and clear card so loading/failure states are visible
    if (asset?.imageUrl) {
      setAssets((prev) => prev.map((a) => a.id === assetId ? { ...a, _prevImageUrl: a.imageUrl, _prevThumbnailUrl: a.thumbnailUrl, imageUrl: undefined, thumbnailUrl: undefined, _genFailed: false, _genError: undefined } : a));
    } else {
      setAssets((prev) => prev.map((a) => a.id === assetId ? { ...a, _genFailed: false, _genError: undefined } : a));
    }

    const typeCfg = ASSET_TYPE_GEN_CONFIG[assetType] ?? ASSET_TYPE_GEN_CONFIG.prop;
    const finalPrompt = globalPrefix?.trim() && !prompt.includes(globalPrefix.trim())
      ? `${prompt}, ${globalPrefix.trim()}`
      : prompt;
    const aspectRatio = ratio || typeCfg.ratio;

    try {
      const res = await fetch("/api/generate/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: finalPrompt,
          model_id: modelId,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          count: 1,
          ...(outputQuality ? { output_quality: outputQuality } : {}),
          ...(refImages && refImages.length > 0 ? { reference_images: refImages } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.code === "INSUFFICIENT_BALANCE") {
          showToast(t("assetGenInsufficientBalance"), "warning");
        } else {
          showToast(t("assetGenFailed"), "warning");
        }
        setAssets((prev) => prev.map((a) => a.id === assetId ? { ...a, _genFailed: true, _genError: t("assetGenFailed") } : a));
        setGeneratingIds((prev) => { const s = new Set(prev); s.delete(assetId); return s; });
        return;
      }

      const { jobId } = await res.json();
      if (!jobId) {
        setAssets((prev) => prev.map((a) => a.id === assetId ? { ...a, _genFailed: true, _genError: t("assetGenFailed") } : a));
        setGeneratingIds((prev) => { const s = new Set(prev); s.delete(assetId); return s; });
        return;
      }

      // Persist jobId + gen params on asset for recovery & detail view
      setAssets((prev) => prev.map((a) => a.id === assetId ? { ...a, _genJobId: jobId, genModelId: modelId, genImageSize: imageSize, genAspectRatio: aspectRatio } : a));

      // Listen to SSE for completion
      const es = new EventSource(`/api/jobs/${jobId}/sse`);
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.status === "SUCCEEDED" && data.url) {
            const genW = typeof data.width === "number" ? data.width : undefined;
            const genH = typeof data.height === "number" ? data.height : undefined;
            setAssets((prev) => prev.map((a) =>
              a.id === assetId
                ? { ...a, imageUrl: data.url, thumbnailUrl: data.thumbnailUrl || data.url, imageWidth: genW, imageHeight: genH, source: "generated" as AssetSource, _genJobId: undefined, _prevImageUrl: undefined, _prevThumbnailUrl: undefined }
                : a
            ));
            // Auto-place on canvas
            placeAssetOnCanvas(assetId, data.url, data.thumbnailUrl || data.url, asset?.name || "", assetType, prompt, genW, genH, modelId, imageSize);
            es.close();
            setGeneratingIds((prev) => { const s = new Set(prev); s.delete(assetId); return s; });
          } else if (data.status === "FAILED" || data.status === "CANCELED" || data.status === "CANCELLED") {
            const errMsg = t("assetGenFailed");
            showToast(errMsg, "warning");
            es.close();
            setAssets((prev) => prev.map((a) => a.id === assetId ? { ...a, _genJobId: undefined, _genFailed: true, _genError: errMsg } : a));
            setGeneratingIds((prev) => { const s = new Set(prev); s.delete(assetId); return s; });
          }
        } catch { /* ignore parse errors */ }
      };
      es.onerror = () => {
        es.close();
        showToast(t("assetGenFailed"), "warning");
        setAssets((prev) => prev.map((a) => a.id === assetId ? { ...a, _genJobId: undefined, _genFailed: true, _genError: t("assetGenFailed") } : a));
        setGeneratingIds((prev) => { const s = new Set(prev); s.delete(assetId); return s; });
      };
    } catch {
      showToast(t("assetGenFailed"), "warning");
      setAssets((prev) => prev.map((a) => a.id === assetId ? { ...a, _genFailed: true, _genError: t("assetGenFailed") } : a));
      setGeneratingIds((prev) => { const s = new Set(prev); s.delete(assetId); return s; });
    }
  }, [generatingIds, assets, setAssets, placeAssetOnCanvas, t]);

  // ─── Batch generate selected assets ───
  const batchGenerateSelected = useCallback(() => {
    const pending = assets.filter((a) => selectedAssetIds.has(a.id) && a.imagePrompt?.trim() && !generatingIds.has(a.id));
    if (pending.length === 0) {
      showToast(t("assetBatchGenerateNone"), "info");
      return;
    }
    const modelCfg = ASSET_GEN_MODELS.find((m) => m.id === genModel) ?? ASSET_GEN_MODELS[0];
    const size = modelCfg.sizes.includes(genSize) ? genSize : modelCfg.sizes[0];
    for (const asset of pending) {
      const ratio = (ASSET_TYPE_GEN_CONFIG[asset.type] ?? ASSET_TYPE_GEN_CONFIG.prop).ratio;
      generateAssetImage(asset.id, asset.imagePrompt, asset.type, genModel, size, ratio);
    }
    setSelectMode(false);
    setSelectedAssetIds(new Set());
  }, [assets, selectedAssetIds, generatingIds, genModel, genSize, generateAssetImage, t]);

  // ─── Selection helpers ───
  const toggleAssetSelect = useCallback((id: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllGeneratable = useCallback(() => {
    const ids = assets.filter((a) => a.imagePrompt?.trim() && !generatingIds.has(a.id)).map((a) => a.id);
    setSelectedAssetIds(new Set(ids));
  }, [assets, generatingIds]);

  // ─── Upload image for asset ───
  const uploadAssetImage = useCallback(async (assetId: string) => {
    const file = await openFilePicker("image");
    if (!file) return;
    try {
      const result = await uploadFile(file, { projectId: useCanvasStore.getState().projectId ?? undefined });
      const url = (result as { url: string }).url;
      const thumbUrl = "thumbnailUrl" in result ? (result.thumbnailUrl as string) : url;
      const upW = "width" in result ? (result as { width: number }).width : undefined;
      const upH = "height" in result ? (result as { height: number }).height : undefined;
      const asset = assets.find((a) => a.id === assetId);
      setAssets((prev) => prev.map((a) =>
        a.id === assetId
          ? { ...a, imageUrl: url, thumbnailUrl: thumbUrl, imageWidth: upW, imageHeight: upH, source: "uploaded" as AssetSource }
          : a
      ));
      // Auto-place on canvas
      placeAssetOnCanvas(assetId, url, thumbUrl, asset?.name || "", asset?.type || "prop", asset?.imagePrompt || "", upW, upH);
    } catch {
      showToast(t("assetUploadFailed"), "warning");
    }
  }, [assets, setAssets, placeAssetOnCanvas, t]);

  // ─── Pick media from canvas nodes ───
  const canvasMediaNodes = useCanvasStore((s) => s.nodes).filter((n) => !!(n.data?.imageUrl || n.data?.videoUrl || n.data?.audioUrl));

  const pickFromCanvas = useCallback((assetId: string) => {
    setCanvasPickerFilter("all");
    setCanvasPickerForAssetId(assetId);
  }, []);

  const applyCanvasMedia = useCallback((assetId: string, node: { id: string; data: NodeData }) => {
    const url = String(node.data.imageUrl ?? node.data.videoUrl ?? node.data.audioUrl ?? node.data.originalUrl ?? "");
    const thumb = node.data.thumbnailUrl ? String(node.data.thumbnailUrl) : url;
    if (!url) return;
    if (refPickerMode) {
      setGenRefImages((prev) => prev.includes(url) ? prev : [...prev, url]);
      setCanvasPickerForAssetId(null);
      setRefPickerMode(false);
      return;
    }
    // Extract width/height from canvas node for proper aspect ratio on send-to-canvas
    const nw = typeof node.data.width === "number" ? node.data.width : undefined;
    const nh = typeof node.data.height === "number" ? node.data.height : undefined;
    setAssets((prev) => prev.map((a) =>
      a.id === assetId
        ? { ...a, imageUrl: url, thumbnailUrl: thumb, imageWidth: nw, imageHeight: nh, source: "library" as AssetSource, canvasNodeId: node.id }
        : a
    ));
    setCanvasPickerForAssetId(null);
  }, [setAssets, refPickerMode]);

  // ─── Pick media from material library ───
  const fetchPickerFolderMats = useCallback(async (folderId: string) => {
    if (pickerFolderMats[folderId]) return; // already cached
    setPickerFolderLoading(true);
    try {
      const res = await fetch(`/api/materials?folder_id=${folderId}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setPickerFolderMats((prev) => ({ ...prev, [folderId]: data.materials ?? [] }));
      }
    } catch { /* ignore */ }
    setPickerFolderLoading(false);
  }, [pickerFolderMats]);


  const togglePickerFolder = useCallback((folderId: string) => {
    setPickerExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) { next.delete(folderId); } else { next.add(folderId); fetchPickerFolderMats(folderId); }
      return next;
    });
  }, [fetchPickerFolderMats]);

  const pickFromMaterial = useCallback(async (assetId: string) => {
    setPickerExpandedFolders(new Set());
    setMaterialPickerFilter("all");
    setPickerFolderMats({});
    setPickerFolderLoading(false);
    setMaterialPickerForAssetId(assetId);
    // Refresh folders
    try {
      await fetch("/api/materials?limit=1");
    } catch { /* ignore */ }
    refreshMaterials();
  }, [refreshMaterials]);

  const applyMaterialImage = useCallback((assetId: string, mat: MaterialItem) => {
    // storage_key is already a valid URL path (e.g. "/api/files/image/display/uuid.webp" or "https://...")
    // Only prepend /api/files/ if it's a bare filename (no leading / or http)
    const fullUrl = mat.storage_key.startsWith("http") || mat.storage_key.startsWith("/")
      ? mat.storage_key
      : `/api/files/${mat.storage_key}`;
    if (refPickerMode) {
      setGenRefImages((prev) => prev.includes(fullUrl) ? prev : [...prev, fullUrl]);
      setMaterialPickerForAssetId(null);
      setRefPickerMode(false);
      return;
    }
    // thumbnail_url is the compressed version for card display
    const thumb = mat.thumbnail_url || fullUrl;
    setAssets((prev) => prev.map((a) =>
      a.id === assetId
        ? { ...a, imageUrl: fullUrl, thumbnailUrl: thumb, imageWidth: mat.width, imageHeight: mat.height, source: "library" as AssetSource }
        : a
    ));
    setMaterialPickerForAssetId(null);
  }, [setAssets, refPickerMode]);

  return (
    <div className="flex flex-col h-full">
      {/* Header: filters + actions */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center gap-1">
          {(["all", ...ASSET_TYPES] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-2.5 h-7 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                filterType === type
                  ? "bg-white/[0.1] text-white"
                  : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
              }`}
            >
              {type === "all" ? t("assetFilterAll") : t(ASSET_TYPE_LABELS[type])}
              <span className="ml-1 text-[10px] opacity-50">{counts[type] || 0}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {selectMode ? (
            <>
              <button
                onClick={() => {
                  if (selectedAssetIds.size > 0) setSelectedAssetIds(new Set());
                  else selectAllGeneratable();
                }}
                className="px-2.5 h-7 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-white/60 hover:text-white text-[11px] transition-colors cursor-pointer"
              >
                {selectedAssetIds.size > 0 ? t("assetDeselectAll") : t("assetSelectAll")}
              </button>
              <button
                onClick={batchGenerateSelected}
                disabled={selectedAssetIds.size === 0}
                className="flex items-center gap-1 px-2.5 h-7 rounded-md bg-[#CCFF00]/10 hover:bg-[#CCFF00]/20 text-[#CCFF00]/80 hover:text-[#CCFF00] text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Sparkles size={12} />
                {t("assetGenerateSelected", { n: selectedAssetIds.size })}
              </button>
              <button
                onClick={() => { setSelectMode(false); setSelectedAssetIds(new Set()); }}
                className="size-7 rounded-md bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-white/40 hover:text-white/70 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setSelectMode(true); selectAllGeneratable(); }}
                disabled={isExtracting || assets.every((a) => !a.imagePrompt?.trim() || generatingIds.has(a.id))}
                className="flex items-center gap-1 px-2.5 h-7 rounded-md bg-[#CCFF00]/10 hover:bg-[#CCFF00]/20 text-[#CCFF00]/80 hover:text-[#CCFF00] text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Sparkles size={12} />
                {t("assetBatchGenerate")}
              </button>
              <button
                onClick={() => addAsset(filterType === "all" ? "character" : filterType)}
                className="flex items-center gap-1 px-2.5 h-7 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-white/60 hover:text-white text-[11px] transition-colors cursor-pointer"
              >
                <span className="text-lg leading-none">+</span>
                {t("assetAdd")}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isExtracting ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 size={28} className="animate-spin text-[#CCFF00]/60" />
            <span className="text-[13px] text-white/50">{t("extractingAssets")}</span>
            <span className="text-[11px] text-white/25">{llmModel === "gpt-5.5" ? t("generatingHintSlow") : t("extractingAssetsHint")}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/20 text-[12px] gap-2">
            <Package size={28} className="opacity-30" />
            <span>{t("assetsEmpty")}</span>
            {hasScript && (
              <span className="text-[11px] text-white/30">{t("assetsEmptyHint")}</span>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-1">
            {filtered.map((asset) => (
                <div
                  key={asset.id}
                  onClick={selectMode ? () => toggleAssetSelect(asset.id) : undefined}
                  className={`group rounded-xl border transition-all overflow-hidden ${
                    selectMode && selectedAssetIds.has(asset.id)
                      ? "border-[#CCFF00]/50 bg-[#CCFF00]/[0.04]"
                      : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1]"
                  } ${selectMode ? "cursor-pointer" : ""}`}
                >
                  {/* Thumbnail area */}
                  <div className="aspect-square relative bg-white/[0.03] flex items-center justify-center overflow-hidden">
                    {/* Selection checkbox */}
                    {selectMode && (
                      <div className={`absolute top-1.5 right-1.5 z-10 size-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        selectedAssetIds.has(asset.id)
                          ? "bg-[#CCFF00] border-[#CCFF00]"
                          : "border-white/30 bg-black/40"
                      }`}>
                        {selectedAssetIds.has(asset.id) && <Check size={11} className="text-black" />}
                      </div>
                    )}
                    {asset.imageUrl ? (
                      <img src={asset.thumbnailUrl || asset.imageUrl} alt={asset.name} className="w-full h-full object-cover" />
                    ) : asset._genFailed && !generatingIds.has(asset.id) ? (
                      <div className="flex flex-col items-center gap-2 text-red-400/70 px-3 text-center">
                        <div className="size-8 rounded-full bg-red-500/10 flex items-center justify-center">
                          <X size={16} className="text-red-400/80" />
                        </div>
                        <span className="text-[10px] leading-tight line-clamp-2">{asset._genError || t("assetGenFailed")}</span>
                        <div className="flex items-center gap-1.5">
                          {asset._prevImageUrl && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, imageUrl: a._prevImageUrl, thumbnailUrl: a._prevThumbnailUrl || a._prevImageUrl, _prevImageUrl: undefined, _prevThumbnailUrl: undefined, _genFailed: false, _genError: undefined } : a)); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-[10px] text-white/50 hover:text-white/80 cursor-pointer transition-colors"
                            >
                              <Undo2 size={10} />
                              <span>{t("assetRestorePrev")}</span>
                            </button>
                          )}
                          {asset.imagePrompt && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setAssets((prev) => prev.map((a) => a.id === asset.id ? { ...a, _genFailed: false, _genError: undefined, _prevImageUrl: undefined, _prevThumbnailUrl: undefined } : a)); setGenModalAssetId(asset.id); setGenPrompt(asset.imagePrompt); setGenRatio((ASSET_TYPE_GEN_CONFIG[asset.type] ?? ASSET_TYPE_GEN_CONFIG.prop).ratio); setGenRefImages([]); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-[10px] text-white/50 hover:text-white/80 cursor-pointer transition-colors"
                            >
                              <RotateCcw size={10} />
                              <span>{t("assetRetry")}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : !generatingIds.has(asset.id) ? (
                      <div className="flex flex-col items-center gap-1.5 text-white/15">
                        <ImageIcon size={24} />
                        <span className="text-[10px]">{t("assetNoImage")}</span>
                      </div>
                    ) : null}
                    {generatingIds.has(asset.id) && <MeteorShowerOverlay />}
                    {/* Canvas indicator */}
                    {asset.canvasNodeId && (
                      <span className="absolute top-1.5 right-1.5 size-5 rounded-full bg-[#CCFF00]/20 flex items-center justify-center" title={t("assetOnCanvas")}>
                        <Send size={9} className="text-[#CCFF00]" />
                      </span>
                    )}
                    {/* Type badge */}
                    <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-medium ${
                      asset.type === "character" ? "bg-blue-500/20 text-blue-300" :
                      asset.type === "scene" ? "bg-green-500/20 text-green-300" :
                      "bg-orange-500/20 text-orange-300"
                    }`}>
                      {t(ASSET_TYPE_LABELS[asset.type])}
                    </span>
                    {/* Hover action bar — primary buttons + ⋮ more menu */}
                    {!generatingIds.has(asset.id) && (
                      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {asset.imageUrl && (
                          <IconTip label={t("assetPreview")}>
                            <button
                              onClick={() => {
                                const canvasNode = asset.canvasNodeId ? useCanvasStore.getState()._nodeMap.get(asset.canvasNodeId) : undefined;
                                const nodeData = canvasNode?.data as Record<string, unknown> | undefined;
                                openDetailView({
                                  imageUrl: asset.imageUrl!,
                                  originalUrl: (nodeData?.originalUrl as string) || asset.imageUrl!,
                                  nodeId: asset.canvasNodeId,
                                  data: nodeData ?? { prompt: asset.imagePrompt || "", imageUrl: asset.imageUrl, model_id: asset.genModelId, image_size: asset.genImageSize, aspect_ratio: asset.genAspectRatio },
                                });
                              }}
                              className="size-8 rounded-lg bg-black/60 backdrop-blur-sm hover:bg-black/80 flex items-center justify-center text-white/80 hover:text-white cursor-pointer transition-colors"
                            >
                              <Eye size={14} />
                            </button>
                          </IconTip>
                        )}
                        {asset.imagePrompt && (
                          <IconTip label={asset.imageUrl ? t("assetRegenerate") : t("assetGenerate")}>
                            <button
                              onClick={() => { setGenModalAssetId(asset.id); setGenPrompt(asset.imagePrompt); setGenRatio((ASSET_TYPE_GEN_CONFIG[asset.type] ?? ASSET_TYPE_GEN_CONFIG.prop).ratio); setGenRefImages([]); }}
                              className="size-8 rounded-lg bg-black/60 backdrop-blur-sm hover:bg-black/80 flex items-center justify-center text-white/80 hover:text-white cursor-pointer transition-colors"
                            >
                              <Sparkles size={14} />
                            </button>
                          </IconTip>
                        )}
                        {/* More menu trigger */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (moreMenuAssetId === asset.id) { setMoreMenuAssetId(null); setMoreMenuPos(null); return; }
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setMoreMenuPos({ x: rect.right, y: rect.top });
                            setMoreMenuAssetId(asset.id);
                          }}
                          className="size-8 rounded-lg bg-black/60 backdrop-blur-sm hover:bg-black/80 flex items-center justify-center text-white/80 hover:text-white cursor-pointer transition-colors"
                        >
                          <EllipsisVertical size={14} />
                        </button>
                      </div>
                    )}
                    
                  </div>

                  {/* Info area */}
                  <div className="p-2.5">
                    <div className="text-[12px] text-white/80 font-medium truncate">
                      {asset.name || <span className="text-white/20 italic">{t("assetUntitled")}</span>}
                    </div>
                    {asset.description && (
                      <div className="text-[10px] text-white/35 mt-0.5 line-clamp-2 leading-relaxed">
                        {asset.description}
                      </div>
                    )}
                  </div>
                </div>
            ))}
          </div>
        )}
      </div>

      {/* Portal: more menu dropdown */}
      {moreMenuAssetId && moreMenuPos && (() => {
        const menuAsset = assets.find((a) => a.id === moreMenuAssetId);
        if (!menuAsset) return null;
        return createPortal(
          <div ref={moreMenuRef} className="fixed z-[9999] w-36 rounded-xl border border-white/[0.1] bg-[#1c1c1c]/95 backdrop-blur-xl shadow-2xl py-1 animate-in fade-in slide-in-from-bottom-2 duration-150" style={{ top: moreMenuPos.y, left: moreMenuPos.x, transform: "translate(-100%, -100%)" }}>
            <button
              onClick={() => { uploadAssetImage(menuAsset.id); setMoreMenuAssetId(null); setMoreMenuPos(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-colors"
            >
              <Upload size={13} />
              <span>{t("assetUpload")}</span>
            </button>
            <button
              onClick={() => { pickFromCanvas(menuAsset.id); setMoreMenuAssetId(null); setMoreMenuPos(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-colors"
            >
              <LayoutGrid size={13} />
              <span>{t("assetFromCanvas")}</span>
            </button>
            <button
              onClick={() => { pickFromMaterial(menuAsset.id); setMoreMenuAssetId(null); setMoreMenuPos(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-colors"
            >
              <FolderOpen size={13} />
              <span>{t("assetFromLibrary")}</span>
            </button>
            {menuAsset.imagePrompt && (
              <button
                onClick={() => {
                  const refCandidates = assets.filter((a) => a.id !== menuAsset.id && a.imageUrl).map((a) => a.imageUrl!);
                  setGenModalAssetId(menuAsset.id);
                  setGenPrompt(menuAsset.imagePrompt);
                  setGenRatio((ASSET_TYPE_GEN_CONFIG[menuAsset.type] ?? ASSET_TYPE_GEN_CONFIG.prop).ratio);
                  setGenRefImages(refCandidates.slice(0, 1));
                  setMoreMenuAssetId(null);
                  setMoreMenuPos(null);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-colors"
              >
                <ImagePlus size={13} />
                <span>{t("assetRefGen")}</span>
              </button>
            )}
            <button
              onClick={() => { startEdit(menuAsset); setMoreMenuAssetId(null); setMoreMenuPos(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-colors"
            >
              <Pencil size={13} />
              <span>{t("assetEdit")}</span>
            </button>
            <div className="my-1 h-px bg-white/[0.06]" />
            <button
              onClick={() => { setDeletingId(menuAsset.id); setMoreMenuAssetId(null); setMoreMenuPos(null); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-red-400/80 hover:text-red-300 hover:bg-red-500/[0.06] cursor-pointer transition-colors"
            >
              <Trash2 size={13} />
              <span>{t("assetDelete")}</span>
            </button>
          </div>,
          document.body,
        );
      })()}

      {/* Bottom bar — matches canvas generation panel style */}
      <div className="flex items-center justify-between w-full p-2 h-14 border-t border-white/[0.06] flex-shrink-0">
        {/* Left: model selector */}
        <div className="flex items-center gap-1">
          <div className="relative" ref={modelPickerRef}>
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 transition-colors text-zinc-300 cursor-pointer ${showModelPicker ? "bg-zinc-800" : ""}`}
            >
              {(() => { const ic = TEXT_MODELS.find((m) => m.id === llmModel)?.icon ?? "gemini"; return ic === "openai" ? <OpenAIIcon /> : ic === "deepseek" ? <DeepSeekIcon /> : <GeminiIcon />; })()}
              <span className="whitespace-nowrap">{TEXT_MODELS.find((m) => m.id === llmModel)?.name ?? llmModel}</span>
            </button>
            {showModelPicker && (
              <div className="absolute left-0 bottom-full mb-1.5 z-50 w-72 rounded-2xl border border-zinc-700/60 p-1 animate-in fade-in slide-in-from-bottom-2 duration-150" style={{ background: "#1c1c1c" }}>
                {TEXT_MODELS.map((m) => {
                  const isSelected = m.id === llmModel;
                  return (
                    <button
                      key={m.id}
                      onClick={() => { setLlmModel(m.id); setShowModelPicker(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                        isSelected ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                      }`}
                    >
                      {m.icon === "openai" ? <OpenAIIcon /> : m.icon === "deepseek" ? <DeepSeekIcon /> : <GeminiIcon />}
                      <div className="flex flex-col">
                        <span className="text-[13px] font-medium">{m.name}</span>
                        <span className="text-[11px] text-zinc-500">{LLM_TOKENS_PER_XIN[m.id] ? t("modelTokensPerXin", { tokens: LLM_TOKENS_PER_XIN[m.id] }) : t(m.descKey)}</span>
                      </div>
                      {isSelected && <span className="ml-auto text-[#CCFF00] text-xs">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: history + extract + next-step pill */}
        <div className="flex items-center gap-2">
          <StepHistoryDropdown entries={assetsHistory} onRestore={onRestoreAssets} t={t} />
          {/* Extract / Re-extract assets */}
          {hasScript && (
            <div
              className="flex items-center gap-1.5 rounded-full p-1 pl-2.5 border border-white/10 cursor-pointer transition-opacity"
              style={{ backdropFilter: "blur(10px)", background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)" }}
            >
              <span className="text-xs tabular-nums text-zinc-200 font-medium">≤{LLM_MAX_PRICE[llmModel] ?? 15}</span>
              <span className="text-xs text-zinc-400">{assets.length > 0 ? t("assetReExtract") : t("assetExtract")}</span>
              <button
                onClick={onReExtract}
                disabled={isExtracting}
                className="w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isExtracting ? <Loader2 size={12} className="animate-spin" /> : assets.length > 0 ? <RotateCcw size={12} /> : <Sparkles size={12} />}
              </button>
            </div>
          )}

          {/* Send to canvas — dark pill with Send icon */}
          <div
            className="flex items-center gap-1.5 rounded-full p-1 pl-2.5 border border-white/10 cursor-pointer transition-opacity disabled:opacity-30"
            style={{ backdropFilter: "blur(10px)", background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)" }}
          >
            <span className="text-xs text-zinc-400">{t("assetSendAllToCanvas")}</span>
            <button
              onClick={sendAllAssetsToCanvas}
              disabled={!assets.some((a) => a.imageUrl)}
              className="w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Send size={12} />
            </button>
          </div>

          {/* Next step — dark pill with text + ArrowRight */}
          <div
            className="flex items-center gap-1.5 rounded-full p-1 pl-2.5 border cursor-pointer"
            style={{
              backdropFilter: "blur(10px)",
              background: "var(--credits-pill-bg)",
              borderColor: "var(--credits-pill-border)",
            }}
          >
            <span className="text-xs" style={{ color: "var(--credits-pill-text)" }}>{t("assetNextStep")}</span>
            <button
              onClick={onNextStep}
              disabled={assets.length === 0}
              className="w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90 hover:scale-105 active:scale-95"
              style={{
                background: "var(--credits-pill-btn-bg)",
                color: "var(--credits-pill-btn-text)",
              }}
            >
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deletingId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
          <div className="bg-[#1a1a1a] border border-white/[0.1] rounded-xl p-5 w-80 shadow-2xl">
            <p className="text-sm text-white/80 mb-4">{t("assetConfirmDelete")}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/60 text-[12px] cursor-pointer transition-colors"
              >
                {t("cancelDelete")}
              </button>
              <button
                onClick={() => removeAsset(deletingId)}
                className="flex-1 h-8 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[12px] font-medium cursor-pointer transition-colors"
              >
                {t("confirmDelete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit asset modal */}
      {editingId && (() => {
        const editAsset = assets.find((a) => a.id === editingId);
        if (!editAsset) return null;
        return (
          <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditingId(null)}>
            <div
              className="border border-white/[0.08] rounded-2xl w-[480px] max-h-[85vh] flex flex-col overflow-hidden backdrop-blur-xl"
              style={{ background: "rgba(48,48,48,0.92)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 0.5px 0 rgba(255,255,255,0.1)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 pb-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Pencil size={16} className="text-[#CCFF00]" />
                  <span className="text-sm font-medium text-white/90">{t("assetEdit")}</span>
                  <span className="text-xs text-white/30">— {editAsset.name || t("assetUntitled")}</span>
                </div>
                <button onClick={() => setEditingId(null)} className="text-white/30 hover:text-white/60 cursor-pointer"><X size={16} /></button>
              </div>

              {/* Body */}
              <div className="p-4 space-y-4 overflow-y-auto">
                {/* Type selector */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-white/40 font-medium">{t("assetTypeLabel")}</label>
                  <div className="flex items-center gap-1.5">
                    {ASSET_TYPES.map((at) => (
                      <button
                        key={at}
                        onClick={() => setEditForm((f) => ({ ...f, type: at }))}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-colors ${
                          editForm.type === at
                            ? at === "character" ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" :
                              at === "scene" ? "bg-green-500/20 text-green-300 border border-green-500/30" :
                              "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                            : "bg-white/[0.04] text-white/40 border border-white/[0.06] hover:text-white/60 hover:bg-white/[0.06]"
                        }`}
                      >
                        {t(ASSET_TYPE_LABELS[at])}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-white/40 font-medium">{t("assetNameLabel")}</label>
                  <input
                    autoFocus
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t("assetNamePlaceholder")}
                    className="w-full h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 text-[13px] text-white/80 placeholder:text-white/20 outline-none focus:border-white/20 transition-colors"
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-white/40 font-medium">{t("assetDescLabel")}</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder={t("assetDescPlaceholder")}
                    rows={3}
                    className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-[13px] text-white/80 placeholder:text-white/20 outline-none focus:border-white/20 resize-none transition-colors"
                  />
                </div>

              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 p-4 pt-3 border-t border-white/[0.06]">
                <button
                  onClick={() => setEditingId(null)}
                  className="h-9 px-4 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/50 text-[12px] font-medium cursor-pointer transition-colors"
                >
                  {t("assetCancelEdit")}
                </button>
                <button
                  onClick={saveEdit}
                  className="h-9 px-5 rounded-lg bg-[#CCFF00]/20 hover:bg-[#CCFF00]/30 text-[#CCFF00] text-[12px] font-medium cursor-pointer transition-colors"
                >
                  {t("assetSave")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Canvas image picker modal */}
      {canvasPickerForAssetId && (() => {
        const filteredCanvasNodes = canvasMediaNodes.filter((n) => {
          if (canvasPickerFilter === "all") return true;
          if (canvasPickerFilter === "image") return !!n.data?.imageUrl;
          if (canvasPickerFilter === "video") return !!n.data?.videoUrl;
          if (canvasPickerFilter === "audio") return !!n.data?.audioUrl;
          return true;
        });
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setCanvasPickerForAssetId(null); setRefPickerMode(false); }}>
            <div
              className="border border-white/[0.08] rounded-2xl p-4 w-[560px] max-h-[70vh] flex flex-col backdrop-blur-xl"
              style={{ background: "rgba(48,48,48,0.92)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 0.5px 0 rgba(255,255,255,0.1)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-white/80 font-medium">{t("assetFromCanvas")}</span>
                <button onClick={() => { setCanvasPickerForAssetId(null); setRefPickerMode(false); }} className="text-white/30 hover:text-white/60 cursor-pointer"><X size={16} /></button>
              </div>
              {/* Type filter tabs */}
              <div className="flex items-center gap-1 mb-3">
                {(["all", "image", "video", "audio"] as const).map((ft) => (
                  <button
                    key={ft}
                    onClick={() => setCanvasPickerFilter(ft)}
                    className={`px-2.5 h-7 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                      canvasPickerFilter === ft ? "bg-white/[0.1] text-white" : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
                    }`}
                  >
                    {t(`pickerFilter_${ft}`)}
                  </button>
                ))}
              </div>
              {filteredCanvasNodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-white/20 text-[12px]">
                  <ImageIcon size={24} className="mb-2 opacity-40" />
                  {t("noCanvasNodes")}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 overflow-y-auto" style={{ maxHeight: "calc(70vh - 120px)" }}>
                  {[...filteredCanvasNodes].reverse().map((node) => (
                    <button
                      key={node.id}
                      onClick={() => applyCanvasMedia(canvasPickerForAssetId, node as { id: string; data: NodeData })}
                      className="group/cv relative aspect-square rounded-lg border border-white/[0.06] overflow-hidden hover:border-[#CCFF00]/40 transition-colors cursor-pointer bg-white/[0.02]"
                    >
                      {node.data?.videoUrl && !node.data?.imageUrl ? (
                        <div className="flex items-center justify-center w-full h-full">
                          <Video size={24} className="text-white/20" />
                        </div>
                      ) : node.data?.audioUrl && !node.data?.imageUrl ? (
                        <div className="flex items-center justify-center w-full h-full">
                          <Music size={24} className="text-white/20" />
                        </div>
                      ) : (
                        <img
                          src={String(node.data?.thumbnailUrl ?? node.data?.imageUrl ?? "")}
                          alt={String(node.data?.label ?? "")}
                          className="w-full h-full object-cover"
                        />
                      )}
                      {/* Type badge */}
                      <span className="absolute top-1 left-1 px-1 py-0.5 rounded text-[9px] font-medium bg-black/50 text-white/60">
                        {node.data?.videoUrl ? t("pickerFilter_video") : node.data?.audioUrl ? t("pickerFilter_audio") : t("pickerFilter_image")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Material library picker modal — tree list style matching sidebar */}
      {materialPickerForAssetId && (() => {
        // Build folder tree
        const folderMap = new Map<string, MaterialFolder & { children: MaterialFolder[] }>();
        for (const f of materialFolders) folderMap.set(f.id, { ...f, children: [] });
        const rootFolders: (MaterialFolder & { children: MaterialFolder[] })[] = [];
        for (const f of folderMap.values()) {
          if (f.parent_id && folderMap.has(f.parent_id)) folderMap.get(f.parent_id)!.children.push(f);
          else rootFolders.push(f);
        }

        const renderMatRow = (mat: MaterialItem) => {
          const thumbUrl = mat.thumbnail_url || (mat.storage_key.startsWith("http") ? mat.storage_key : `/api/files/${mat.storage_key}`);
          return (
            <button
              key={mat.id}
              onClick={() => applyMaterialImage(materialPickerForAssetId!, mat)}
              className="group/mat flex w-full min-w-0 items-center gap-2.5 p-1 rounded-sm hover:bg-white/10 transition-colors cursor-pointer"
            >
              <div className="flex size-6 shrink-0 items-center justify-center">
                <div className="flex size-6 items-center justify-center aspect-square rounded-[4px] border border-white/10 bg-white/5 shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.16),0_4px_8px_0_rgba(0,0,0,0.16)] overflow-hidden relative">
                  {mat.type === "AUDIO" ? (
                    <Music size={12} className="text-pink-400 opacity-60" />
                  ) : mat.thumbnail_url ? (
                    <img src={thumbUrl} alt={mat.name} className="block size-6 object-cover" loading="lazy" />
                  ) : (
                    <ImageIcon size={12} className="text-zinc-600" />
                  )}
                </div>
              </div>
              <span className="min-w-0 flex-1 truncate text-sm leading-snug font-normal text-[rgb(169,169,169)]">{mat.name}</span>
            </button>
          );
        };

        const renderFolder = (folder: MaterialFolder & { children: MaterialFolder[] }, depth: number): React.ReactNode => {
          const isExpanded = pickerExpandedFolders.has(folder.id);
          const hasChildren = folder.children.length > 0;
          const hasExpandable = hasChildren || folder.material_count > 0;
          const mats = pickerFolderMats[folder.id] ?? [];
          const isLoadingMats = pickerFolderLoading && !pickerFolderMats[folder.id] && isExpanded;
          return (
            <div key={folder.id}>
              <div
                className="group/asset-folder flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm py-1 pr-1 transition-colors hover:bg-white/10"
                style={{ paddingLeft: depth * 24 + 6 }}
                onClick={() => togglePickerFolder(folder.id)}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="flex size-6 shrink-0 items-center justify-center">
                    <ChevronDown
                      size={16}
                      className={`-ml-0.5 transition-transform ${
                        hasExpandable
                          ? isExpanded ? "rotate-0 text-white/90" : "-rotate-90 text-white/40"
                          : "text-transparent"
                      }`}
                    />
                  </div>
                  <PickerFolderIcon hasContent={folder.material_count > 0} />
                  <span className={`min-w-0 flex-1 truncate text-sm leading-snug font-semibold ${folder.material_count > 0 ? "text-white/90" : "text-white/60"}`}>
                    {folder.name}
                  </span>
                </div>
              </div>
              {isExpanded && (
                <div className="relative mt-0.5 space-y-0.5" style={{ marginLeft: depth * 24 + 17, paddingLeft: 11 }}>
                  <span className="absolute left-0 top-0 bottom-0 w-px bg-[#CCFF00]/[0.15]" aria-hidden="true" />
                  {hasChildren && folder.children.map((child) => renderFolder(child as MaterialFolder & { children: MaterialFolder[] }, 0))}
                  {isLoadingMats && (
                    <div className="flex items-center gap-2 py-2 pl-2 text-white/30 text-[11px]">
                      <Loader2 size={12} className="animate-spin" />
                    </div>
                  )}
                  {!isLoadingMats && mats.length > 0 && mats.map(renderMatRow)}
                  {!isLoadingMats && mats.length === 0 && !hasChildren && (
                    <div className="py-1.5 pl-2 text-[11px] text-white/25">{t("noMaterialImages")}</div>
                  )}
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setMaterialPickerForAssetId(null); setRefPickerMode(false); }}>
            <div
              className="border border-white/[0.08] rounded-2xl w-[380px] max-h-[460px] flex flex-col backdrop-blur-xl"
              style={{ background: "rgba(48,48,48,0.92)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 0.5px 0 rgba(255,255,255,0.1)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div className="flex items-center gap-2">
                  <PickerFolderIcon hasContent />
                  <span className="text-base font-semibold text-white/90">{t("assetFromLibrary")}</span>
                </div>
                <button onClick={() => { setMaterialPickerForAssetId(null); setRefPickerMode(false); }} className="text-white/30 hover:text-white/60 cursor-pointer transition-colors"><X size={16} /></button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <div className="space-y-0.5">
                  {rootFolders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-white/20 text-[12px]">
                      <FolderOpen size={24} className="mb-2 opacity-40" />
                      {t("noMaterialImages")}
                    </div>
                  ) : (
                    rootFolders.map((f) => renderFolder(f, 0))
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Generate image modal */}
      {genModalAssetId && (() => {
        const asset = assets.find((a) => a.id === genModalAssetId);
        if (!asset) return null;
        const modelCfg = ASSET_GEN_MODELS.find((m) => m.id === genModel) ?? ASSET_GEN_MODELS[0];
        const validSize = modelCfg.sizes.includes(genSize) ? genSize : modelCfg.sizes[0];
        const dynPrices = dynamicGetQualityPrices(genModel);
        const oqMap = dynamicGetOutputQualityPrices(genModel);
        const price = oqMap?.[validSize]?.[genOutputQuality ?? "high"] ?? dynPrices?.[validSize] ?? modelCfg.price[validSize] ?? 0;
        const showOutputQuality = OUTPUT_QUALITY_MODELS.has(genModel);
        const typeCfg = ASSET_TYPE_GEN_CONFIG[asset.type] ?? ASSET_TYPE_GEN_CONFIG.prop;
        return (
          <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setGenModalAssetId(null)}>
            <div
              className="border border-white/[0.08] rounded-2xl w-[780px] max-h-[85vh] flex flex-col backdrop-blur-xl"
              style={{ background: "rgba(48,48,48,0.92)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 0.5px 0 rgba(255,255,255,0.1)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 pb-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-[#CCFF00]" />
                  <span className="text-[13px] text-white/90 font-medium">
                    {asset.imageUrl ? t("assetRegenerate") : t("assetGenerate")}
                  </span>
                  <span className="text-[10px] text-white/25">— {asset.name}</span>
                </div>
                <button onClick={() => setGenModalAssetId(null)} className="text-white/30 hover:text-white/60 cursor-pointer transition-colors">
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-4 overflow-y-auto overflow-x-hidden">
                {/* Prompt editor (TipTap) */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-white/40 font-medium">{t("assetImagePromptLabel")}</label>
                  <div className="rounded-lg bg-white/[0.04] border border-white/[0.08] focus-within:border-[#CCFF00]/30 transition-colors">
                    <PromptEditor
                      content={genPrompt}
                      onChange={(text) => setGenPrompt(text)}
                      placeholder={t("assetImagePromptLabel")}
                      style={{ minHeight: 120, maxHeight: 200 }}
                    />
                  </div>
                </div>

                {/* Reference images picker */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <ImagePlus size={12} className="text-white/40" />
                    <label className="text-[11px] text-white/40 font-medium">{t("assetRefImageLabel")}</label>
                    {genRefImages.length > 0 && (
                      <span className="text-[10px] text-[#CCFF00]/60 ml-1">({genRefImages.length})</span>
                    )}
                  </div>
                  <p className="text-[10px] text-white/25 -mt-1">{t("assetRefImageHint")}</p>
                  <div className="grid grid-cols-8 gap-2">
                    {/* 1. Upload ref image */}
                    <button
                      type="button"
                      onClick={async () => {
                        const file = await openFilePicker("image");
                        if (!file) return;
                        try {
                          const result = await uploadFile(file, { projectId: useCanvasStore.getState().projectId ?? undefined });
                          const url = (result as { url: string }).url;
                          setGenRefImages((prev) => prev.includes(url) ? prev : [...prev, url]);
                        } catch { showToast(t("assetUploadFailed"), "warning"); }
                      }}
                      className="aspect-square w-full rounded-lg border-2 border-dashed border-white/10 hover:border-white/25 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <Upload size={16} className="text-white/30" />
                      <span className="text-[9px] text-white/30">{t("assetUpload")}</span>
                    </button>
                    {/* 2. Pick from canvas */}
                    <button
                      type="button"
                      onClick={() => { setRefPickerMode(true); setCanvasPickerFilter("image"); setCanvasPickerForAssetId(genModalAssetId); }}
                      className="aspect-square w-full rounded-lg border-2 border-dashed border-white/10 hover:border-white/25 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <LayoutGrid size={16} className="text-white/30" />
                      <span className="text-[9px] text-white/30">{t("assetFromCanvas")}</span>
                    </button>
                    {/* 3. Pick from material library */}
                    <button
                      type="button"
                      onClick={() => { setRefPickerMode(true); setMaterialPickerForAssetId(genModalAssetId); }}
                      className="aspect-square w-full rounded-lg border-2 border-dashed border-white/10 hover:border-white/25 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <FolderOpen size={16} className="text-white/30" />
                      <span className="text-[9px] text-white/30">{t("assetFromLibrary")}</span>
                    </button>
                    {/* Existing assets with images */}
                    {assets.filter((a) => a.id !== genModalAssetId && a.imageUrl).map((a) => {
                      const isRef = genRefImages.includes(a.imageUrl!);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            setGenRefImages((prev) =>
                              isRef ? prev.filter((u) => u !== a.imageUrl) : [...prev, a.imageUrl!]
                            );
                          }}
                          className={`relative group aspect-square w-full rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                            isRef ? "border-[#CCFF00] ring-1 ring-[#CCFF00]/40" : "border-transparent hover:border-white/20"
                          }`}
                        >
                          <img src={a.thumbnailUrl || a.imageUrl} alt={a.name} className="w-full h-full object-cover" />
                          {isRef && (
                            <div className="absolute inset-0 bg-[#CCFF00]/10 flex items-center justify-center">
                              <Check size={18} className="text-[#CCFF00]" />
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                            <span className="text-[9px] text-white/70 truncate block">{a.name}</span>
                          </div>
                        </button>
                      );
                    })}
                    {/* External ref images (uploaded/picked, not from assets) */}
                    {genRefImages.filter((url) => !assets.some((a) => a.imageUrl === url)).map((url) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setGenRefImages((prev) => prev.filter((u) => u !== url))}
                        className="relative group aspect-square w-full rounded-lg overflow-hidden border-2 border-[#CCFF00] ring-1 ring-[#CCFF00]/40 cursor-pointer"
                      >
                        <img src={url} alt="ref" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-[#CCFF00]/10 flex items-center justify-center">
                          <Check size={18} className="text-[#CCFF00]" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Model / Size+Ratio toolbar — outside scroll container so popovers aren't clipped */}
              <div className="relative px-5 py-1 flex items-center gap-1 border-t border-white/[0.06]">
                {/* ── Model picker ── */}
                <div className="relative" ref={genModelRef}>
                  <button
                    type="button"
                    className={`flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-white/[0.06] transition-colors text-zinc-300 cursor-pointer ${showGenModelPicker ? "bg-white/[0.06]" : ""}`}
                    onClick={() => { setShowGenModelPicker((v) => !v); setShowGenRatioPicker(false); }}
                  >
                    <ImageModelIcon modelId={genModel} />
                    <span className="whitespace-nowrap">{modelCfg.label}</span>
                  </button>

                  {showGenModelPicker && (
                    <div
                      className="absolute bottom-full mb-2 left-0 w-72 rounded-2xl border border-zinc-700/60 p-1 z-[80] max-h-[300px] overflow-y-auto"
                      style={{ background: "#1c1c1c" }}
                    >
                      {ASSET_GEN_MODELS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                            genModel === m.id ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                          }`}
                          onClick={() => {
                            setGenModel(m.id);
                            if (!m.sizes.includes(genSize)) setGenSize(m.sizes[0]);
                            setShowGenModelPicker(false);
                          }}
                        >
                          <ImageModelIcon modelId={m.id} />
                          <span className="text-sm font-medium">{m.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="w-px h-4 bg-zinc-700" />

                {/* ── Ratio + Quality picker ── */}
                <div className="relative" ref={genRatioRef}>
                  <button
                    type="button"
                    className={`flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-white/[0.06] transition-colors text-zinc-300 cursor-pointer ${showGenRatioPicker ? "bg-white/[0.06]" : ""}`}
                    onClick={() => { setShowGenRatioPicker((v) => !v); setShowGenModelPicker(false); }}
                  >
                    <AspectRatioIcon w={(() => { const r = ASPECT_RATIOS.find((a) => a.value === genRatio); return r?.w ?? 16; })()} h={(() => { const r = ASPECT_RATIOS.find((a) => a.value === genRatio); return r?.h ?? 9; })()} />
                    <span>{genRatio} · {validSize}</span>
                  </button>

                  {showGenRatioPicker && (
                    <div
                      className="absolute bottom-full mb-2 left-0 w-[340px] rounded-[20px] border border-zinc-700/60 p-1.5 z-[80]"
                      style={{ background: "#1c1c1c" }}
                    >
                      {/* Quality */}
                      <div className="p-2 flex flex-col gap-1.5">
                        <div className="text-xs font-medium text-zinc-500 px-1">{t("assetSizeLabel")}</div>
                        <div className="relative flex bg-white/[0.06] rounded-lg p-0.5">
                          {modelCfg.sizes.map((q) => (
                            <button
                              key={q}
                              type="button"
                              className={`relative z-10 flex-1 px-2 py-1.5 rounded-md text-sm transition-colors duration-200 cursor-pointer ${
                                validSize === q ? "text-white bg-white/[0.08]" : "text-zinc-500 hover:text-zinc-200"
                              }`}
                              onClick={() => setGenSize(q)}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 精细度 (Output Quality) — GPT Image 2 only */}
                      {showOutputQuality && (
                        <div className="p-2 flex flex-col gap-1.5">
                          <div className="text-xs font-medium text-zinc-500 px-1">{tc("outputQuality")}</div>
                          <div className="relative flex bg-white/[0.06] rounded-lg p-0.5">
                            {OUTPUT_QUALITY_OPTIONS.map((oq) => (
                              <button
                                key={oq}
                                type="button"
                                className={`relative z-10 flex-1 px-2 py-1.5 rounded-md text-sm transition-colors duration-200 cursor-pointer ${
                                  (genOutputQuality ?? "high") === oq ? "text-white bg-white/[0.08]" : "text-zinc-500 hover:text-zinc-200"
                                }`}
                                onClick={() => setGenOutputQuality(oq)}
                              >
                                {tc(`outputQuality_${oq}`)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Ratio grid */}
                      <div className="p-2 flex flex-col gap-1.5">
                        <div className="text-xs font-medium text-zinc-500 px-1">{t("assetRatioLabel")}</div>
                        <div className="grid gap-1 bg-white/[0.06] rounded-lg p-1" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
                          {ASPECT_RATIOS.filter((r) => !GROK_ONLY_RATIOS.has(r.value)).map((r) => {
                            const iconMax = 14;
                            const ratio = r.w / r.h;
                            const iW = ratio >= 1 ? iconMax : Math.round(iconMax * ratio);
                            const iH = ratio >= 1 ? Math.round(iconMax / ratio) : iconMax;
                            return (
                              <button
                                key={r.value}
                                type="button"
                                className={`flex flex-col items-center justify-center rounded-md transition-colors duration-200 py-1.5 gap-0.5 cursor-pointer ${
                                  genRatio === r.value ? "text-white bg-white/[0.1]" : "text-zinc-500 hover:text-zinc-200"
                                }`}
                                onClick={() => setGenRatio(r.value)}
                              >
                                <div className="flex items-center justify-center flex-none" style={{ width: 14, height: 14 }}>
                                  <div className="border-[1.5px] border-current rounded-[2px]" style={{ width: iW, height: iH }} />
                                </div>
                                <span className="text-[10px]">{r.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/[0.06]">
                <span className="text-[11px] text-white/25">{price} Xins · {genRatio}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setGenModalAssetId(null)}
                    className="px-4 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/50 text-[12px] cursor-pointer transition-colors"
                  >
                    {t("assetCancelEdit")}
                  </button>
                  <button
                    onClick={() => generateAssetImage(genModalAssetId, genPrompt, asset.type, genModel, validSize, genRatio, genRefImages.length > 0 ? genRefImages : undefined, genOutputQuality)}
                    disabled={!genPrompt.trim() || generatingIds.has(genModalAssetId)}
                    className="flex items-center gap-1.5 px-5 h-8 rounded-lg bg-[#CCFF00]/20 hover:bg-[#CCFF00]/30 text-[#CCFF00] text-[12px] font-medium cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Sparkles size={13} />
                    {t("assetGenerate")} · {price} Xins
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

/* ─── Storyboard Tab ───────────────────────────────── */

const SHOT_FIELDS: { key: keyof StoryboardShot; labelKey: string; className: string; flex?: string; pill?: { bg: string; text: string; border: string; icon: typeof Aperture }; combined?: { key2: keyof StoryboardShot; pill2: { bg: string; text: string; border: string; icon: typeof Aperture }; label2Key: string } }[] = [
  { key: "shotNumber", labelKey: "colShot", className: "w-12 text-white/60 font-mono" },
  { key: "duration", labelKey: "colDuration", className: "w-14 text-white/50" },
  { key: "shotType", labelKey: "colShotType", className: "w-32 text-white/50",
    pill: { bg: "bg-blue-500/10", text: "text-blue-300", border: "border-blue-500/20", icon: Aperture },
    combined: { key2: "movement", label2Key: "colMovement", pill2: { bg: "bg-purple-500/10", text: "text-purple-300", border: "border-purple-500/20", icon: Navigation } },
  },
  { key: "visual", labelKey: "colVisual", className: "text-white/70 leading-relaxed", flex: "3" },
  { key: "audio", labelKey: "colAudio", className: "text-white/50", flex: "1.5" },
  { key: "dialogue", labelKey: "colDialogue", className: "text-white/50", flex: "1.5" },
  { key: "note", labelKey: "colNote", className: "text-white/40 italic", flex: "2" },
];

function TrashSvg({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function DragHandleSvg({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="6" r="1" fill="currentColor" /><circle cx="15" cy="6" r="1" fill="currentColor" />
      <circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" />
      <circle cx="9" cy="18" r="1" fill="currentColor" /><circle cx="15" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

function PlusSvg({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function EditableCell({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };

  if (editing) {
    return (
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className="w-full bg-white/[0.06] border border-[#CCFF00]/30 rounded px-1.5 py-1 text-[11px] text-white/90 outline-none resize-none leading-relaxed"
        rows={Math.max(1, Math.ceil(draft.length / 40))}
      />
    );
  }

  return (
    <div
      onDoubleClick={() => setEditing(true)}
      className={`cursor-text select-none min-h-[20px] ${className ?? ""}`}
      title="双击编辑"
    >
      {value || <span className="text-white/15">-</span>}
    </div>
  );
}

function PillCell({
  value,
  onChange,
  pill,
}: {
  value: string;
  onChange: (v: string) => void;
  pill: { bg: string; text: string; border: string; icon: typeof Aperture };
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={`w-full bg-white/[0.06] border border-[#CCFF00]/30 rounded-lg px-2 py-1 text-[11px] text-white/90 outline-none`}
      />
    );
  }

  const Icon = pill.icon;
  if (!value.trim()) {
    return (
      <div
        onDoubleClick={() => setEditing(true)}
        className="cursor-text select-none min-h-[20px] text-white/15"
        title="双击编辑"
      >
        -
      </div>
    );
  }

  return (
    <div
      onDoubleClick={() => setEditing(true)}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border ${pill.bg} ${pill.text} ${pill.border} text-[11px] leading-none cursor-text select-none whitespace-nowrap`}
      title="双击编辑"
    >
      <Icon size={11} className="shrink-0 opacity-70" />
      <span className="truncate">{value}</span>
    </div>
  );
}

function StoryboardTab({
  shots,
  onShotsChange,
  isGenerating,
  hasScript,
  generationLog,
  onGenerate,
  onNextStep,
  llmModel,
  setLlmModel,
  showModelPicker,
  setShowModelPicker,
  modelPickerRef,
  storyboardHistory,
  onRestoreStoryboard,
  t,
}: {
  shots: StoryboardShot[];
  onShotsChange: (shots: StoryboardShot[]) => void;
  isGenerating: boolean;
  hasScript: boolean;
  generationLog: string;
  onGenerate: () => void;
  onNextStep: () => void;
  llmModel: string;
  setLlmModel: (v: string) => void;
  showModelPicker: boolean;
  setShowModelPicker: (v: boolean) => void;
  modelPickerRef: React.RefObject<HTMLDivElement | null>;
  storyboardHistory: StoryboardHistoryEntry[];
  onRestoreStoryboard: (entry: StoryboardHistoryEntry) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const hasShots = shots.length > 0;
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // Custom scrollbar state
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumbHeight, setThumbHeight] = useState(0);
  const [thumbTop, setThumbTop] = useState(0);
  const [showThumb, setShowThumb] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isDraggingThumb = useRef(false);
  const dragStartY = useRef(0);
  const dragStartScroll = useRef(0);

  const updateThumb = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight) { setShowThumb(false); return; }
    setShowThumb(true);
    const trackH = clientHeight - 8; // 4px padding top+bottom
    const ratio = clientHeight / scrollHeight;
    const tH = Math.max(ratio * trackH, 32);
    const tTop = (scrollTop / (scrollHeight - clientHeight)) * (trackH - tH);
    setThumbHeight(tH);
    setThumbTop(tTop);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateThumb();
    const onScroll = () => {
      setScrolling(true);
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => setScrolling(false), 800);
      updateThumb();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(updateThumb);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); clearTimeout(scrollTimerRef.current); };
  }, [updateThumb, shots.length]);

  const handleThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingThumb.current = true;
    setScrolling(true);
    clearTimeout(scrollTimerRef.current);
    dragStartY.current = e.clientY;
    dragStartScroll.current = scrollRef.current?.scrollTop ?? 0;

    const onMove = (ev: MouseEvent) => {
      if (!isDraggingThumb.current || !scrollRef.current) return;
      const el = scrollRef.current;
      const trackH = el.clientHeight - 8;
      const ratio = el.clientHeight / el.scrollHeight;
      const tH = Math.max(ratio * trackH, 32);
      const maxThumbTravel = trackH - tH;
      const maxScroll = el.scrollHeight - el.clientHeight;
      const dy = ev.clientY - dragStartY.current;
      const scrollDelta = (dy / maxThumbTravel) * maxScroll;
      el.scrollTop = dragStartScroll.current + scrollDelta;
    };
    const onUp = () => {
      isDraggingThumb.current = false;
      scrollTimerRef.current = setTimeout(() => setScrolling(false), 800);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current || !trackRef.current) return;
    const el = scrollRef.current;
    const trackRect = trackRef.current.getBoundingClientRect();
    const clickY = e.clientY - trackRect.top - 4; // 4px padding
    const trackH = el.clientHeight - 8;
    const ratio = clickY / trackH;
    el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
  }, []);

  const updateField = useCallback(
    (shotId: string, field: keyof StoryboardShot, value: string) => {
      onShotsChange(shots.map((s) => (s.id === shotId ? { ...s, [field]: value } : s)));
    },
    [shots, onShotsChange],
  );

  const deleteShot = useCallback(
    (shotId: string) => {
      const next = shots.filter((s) => s.id !== shotId);
      // Renumber
      onShotsChange(next.map((s, i) => ({ ...s, shotNumber: String(i + 1) })));
    },
    [shots, onShotsChange],
  );

  const addShot = useCallback(() => {
    const newShot: StoryboardShot = {
      id: `shot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      shotNumber: String(shots.length + 1),
      duration: "3.0",
      shotType: "",
      movement: "",
      visual: "",
      audio: "",
      dialogue: "",
      note: "",
    };
    onShotsChange([...shots, newShot]);
  }, [shots, onShotsChange]);

  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setOverIdx(idx);
  }, []);

  const handleDrop = useCallback(
    (targetIdx: number) => {
      if (dragIdx === null || dragIdx === targetIdx) {
        setDragIdx(null);
        setOverIdx(null);
        return;
      }
      const next = [...shots];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(targetIdx, 0, moved);
      // Renumber
      onShotsChange(next.map((s, i) => ({ ...s, shotNumber: String(i + 1) })));
      setDragIdx(null);
      setOverIdx(null);
    },
    [dragIdx, shots, onShotsChange],
  );

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setOverIdx(null);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="relative flex-1 overflow-hidden">
        <div ref={scrollRef} className="h-full overflow-auto">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center h-full text-white/30 text-sm gap-4">
            <div className="relative">
              <div className="size-16 rounded-full border-2 border-white/[0.06]" />
              <div className="absolute inset-0 size-16 rounded-full border-2 border-transparent border-t-[#CCFF00] animate-spin" />
              <Sparkles size={20} className="absolute inset-0 m-auto text-[#CCFF00]/60" />
            </div>
            <div className="text-center">
              <p className="font-medium text-xs text-white/50">{t("generatingStoryboard")}</p>
              <p className="text-[11px] mt-1 text-white/20">{llmModel === "gpt-5.5" ? t("generatingHintSlow") : t("generatingHint")}</p>
            </div>
            {generationLog && (
              <div className="max-w-md w-full mx-auto mt-2 px-4">
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 max-h-32 overflow-y-auto">
                  <pre className="text-[10px] text-white/30 whitespace-pre-wrap font-mono leading-relaxed">{generationLog}</pre>
                </div>
              </div>
            )}
          </div>
        ) : shots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/20 text-sm">
            <Clapperboard size={36} className="mb-3 opacity-30" />
            <p className="font-medium text-xs">{t("emptyStoryboard")}</p>
            <p className="text-[11px] mt-1 text-white/15">{t("emptyStoryboardHint")}</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Table header */}
            <div className="flex items-center px-1 py-2 border-b border-white/[0.06] bg-[#111111] sticky top-0 z-10 text-white/30 text-[10px] uppercase tracking-wider">
              <div className="w-6 flex-shrink-0" />
              {SHOT_FIELDS.map((f) => (
                <div key={f.key} className={`px-2 min-w-0 ${f.flex ? '' : f.className.split(' ')[0]}`} style={f.flex ? { flex: f.flex } : undefined}>
                  {f.combined ? `${t(f.labelKey)}/${t(f.combined.label2Key)}` : t(f.labelKey)}
                </div>
              ))}
              <div className="w-10 flex-shrink-0 text-center">{t("colAction")}</div>
            </div>

            {/* Rows */}
            {shots.map((shot, idx) => (
              <div
                key={shot.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
                className={`flex items-start group border-b transition-colors ${
                  overIdx === idx && dragIdx !== null && dragIdx !== idx
                    ? "border-[#CCFF00]/40 bg-[#CCFF00]/[0.04]"
                    : "border-white/[0.04] hover:bg-white/[0.02]"
                } ${dragIdx === idx ? "opacity-40" : ""}`}
              >
                {/* Drag handle */}
                <div className="w-6 flex-shrink-0 flex items-center justify-center pt-2.5 cursor-grab active:cursor-grabbing text-white/15 group-hover:text-white/30">
                  <DragHandleSvg size={12} />
                </div>

                {/* Cells */}
                {SHOT_FIELDS.map((f) => (
                  <div
                    key={f.key}
                    className={`px-2 py-2 text-[11px] min-w-0 ${f.flex ? '' : f.className.split(' ')[0]}`}
                    style={f.flex ? { flex: f.flex } : undefined}
                  >
                    {f.pill && f.combined ? (
                      <div className="flex flex-col gap-1.5">
                        <PillCell
                          value={String(shot[f.key] ?? "")}
                          onChange={(v) => updateField(shot.id, f.key, v)}
                          pill={f.pill}
                        />
                        <PillCell
                          value={String(shot[f.combined.key2] ?? "")}
                          onChange={(v) => updateField(shot.id, f.combined!.key2, v)}
                          pill={f.combined.pill2}
                        />
                      </div>
                    ) : f.pill ? (
                      <PillCell
                        value={String(shot[f.key] ?? "")}
                        onChange={(v) => updateField(shot.id, f.key, v)}
                        pill={f.pill}
                      />
                    ) : (
                      <EditableCell
                        value={String(shot[f.key] ?? "")}
                        onChange={(v) => updateField(shot.id, f.key, v)}
                        className={f.className}
                      />
                    )}
                  </div>
                ))}

                {/* Delete button */}
                <div className="w-10 flex-shrink-0 flex items-center justify-center pt-2">
                  <button
                    onClick={() => deleteShot(shot.id)}
                    className="p-1 rounded text-white/15 hover:text-red-400 hover:bg-red-400/10 transition-all cursor-pointer"
                    title={t("deleteShot")}
                  >
                    <TrashSvg size={13} />
                  </button>
                </div>
              </div>
            ))}

            {/* Add shot button */}
            <button
              onClick={addShot}
              className="flex items-center justify-center gap-1.5 w-full py-3 text-[11px] text-white/25 hover:text-white/50 hover:bg-white/[0.02] transition-colors cursor-pointer border-b border-white/[0.04]"
            >
              <PlusSvg size={13} />
              {t("addShot")}
            </button>
          </div>
        )}
        </div>
        {/* Custom scrollbar track */}
        {showThumb && (
          <div
            ref={trackRef}
            className="absolute top-0 right-0 w-[5px] h-full z-20 cursor-pointer"
            onClick={handleTrackClick}
          >
            <div
              className="absolute right-0 w-full rounded-full cursor-grab active:cursor-grabbing"
              style={{
                top: thumbTop + 4,
                height: thumbHeight,
                background: scrolling ? "#CCFF00" : "rgba(255, 255, 255, 0.15)",
                transition: "background 0.4s ease",
              }}
              onMouseDown={handleThumbMouseDown}
            />
          </div>
        )}
      </div>

      {/* Bottom action bar — matches canvas generation panel style */}
      <div className="flex items-center justify-between w-full p-2 h-14 border-t border-white/[0.06] flex-shrink-0">
        {/* Left: model selector */}
        <div className="flex items-center gap-1">
          <div className="relative" ref={modelPickerRef}>
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 transition-colors text-zinc-300 cursor-pointer ${showModelPicker ? "bg-zinc-800" : ""}`}
            >
              {(() => { const ic = TEXT_MODELS.find((m) => m.id === llmModel)?.icon ?? "gemini"; return ic === "openai" ? <OpenAIIcon /> : ic === "deepseek" ? <DeepSeekIcon /> : <GeminiIcon />; })()}
              <span className="whitespace-nowrap">{TEXT_MODELS.find((m) => m.id === llmModel)?.name ?? llmModel}</span>
            </button>
            {showModelPicker && (
              <div className="absolute left-0 bottom-full mb-1.5 z-50 w-72 rounded-2xl border border-zinc-700/60 p-1 animate-in fade-in slide-in-from-bottom-2 duration-150" style={{ background: "#1c1c1c" }}>
                {TEXT_MODELS.map((m) => {
                  const isSelected = m.id === llmModel;
                  return (
                    <button
                      key={m.id}
                      onClick={() => { setLlmModel(m.id); setShowModelPicker(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                        isSelected ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="size-7 rounded-md bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                        {m.icon === "openai" ? <OpenAIIcon /> : m.icon === "deepseek" ? <DeepSeekIcon /> : <GeminiIcon />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{m.name}</div>
                        {LLM_TOKENS_PER_XIN[m.id] && <div className="text-[10px] text-white/30">{t("modelTokensPerXin", { tokens: LLM_TOKENS_PER_XIN[m.id] })}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Center: AI disclaimer */}
        <span className="text-[10px] text-white/20 hidden sm:inline">{t("aiDisclaimer")}</span>

        {/* Right: action pills */}
        <div className="flex items-center gap-2">
          <StepHistoryDropdown entries={storyboardHistory} onRestore={onRestoreStoryboard} t={t} />
          {isGenerating ? (
            /* Generating indicator (non-cancellable — cost already incurred) */
            <div
              className="flex items-center gap-1.5 rounded-full p-1 pl-2.5 border border-white/10"
              style={{ backdropFilter: "blur(10px)", background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)" }}
            >
              <span className="text-xs tabular-nums text-zinc-200 font-medium">≤{LLM_MAX_PRICE[llmModel] ?? 15}</span>
              <span className="text-xs text-zinc-400">{t("generating")}</span>
              <div className="w-[26px] h-[26px] rounded-full flex items-center justify-center bg-white text-black">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="50 20" />
                </svg>
              </div>
            </div>
          ) : (
            <>
              {/* Regenerate pill (only when shots exist) */}
              {hasShots && (
                <div
                  className="flex items-center gap-1.5 rounded-full p-1 pl-2.5 border border-white/10 cursor-pointer"
                  style={{ backdropFilter: "blur(10px)", background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)" }}
                >
                  <span className="text-xs tabular-nums text-zinc-200 font-medium">≤{LLM_MAX_PRICE[llmModel] ?? 15}</span>
                  <span className="text-xs text-zinc-400">{t("regenerate")}</span>
                  <button
                    onClick={onGenerate}
                    disabled={!hasScript}
                    className="w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              )}

              {/* Next step / Generate pill */}
              <div
                className="flex items-center gap-1.5 rounded-full p-1 pl-2.5 border border-white/10 cursor-pointer"
                style={{ backdropFilter: "blur(10px)", background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)" }}
              >
                {hasShots ? (
                  <>
                    <span className="text-xs text-zinc-400">{t("nextStep")}</span>
                    <button
                      onClick={onNextStep}
                      className="w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/80 transition-all"
                    >
                      <ArrowRight size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs tabular-nums text-zinc-200 font-medium">≤{LLM_MAX_PRICE[llmModel] ?? 15}</span>
                    <span className="text-xs text-zinc-400">{t("generateStoryboard")}</span>
                    <button
                      onClick={onGenerate}
                      disabled={!hasScript}
                      className="w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <ArrowRight size={14} />
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Prompts Tab ──────────────────────────────────── */

function PromptsTab({
  finalPrompts,
  isGenerating,
  progress,
  onGenerate,
  onCancel,
  onSendToCanvas,
  hasShots,
  llmModel,
  setLlmModel,
  showModelPicker,
  setShowModelPicker,
  modelPickerRef,
  promptsHistory,
  onRestorePrompts,
  t,
}: {
  finalPrompts: string;
  isGenerating: boolean;
  progress?: string;
  onGenerate: () => void;
  onCancel?: () => void;
  onSendToCanvas: () => void;
  hasShots: boolean;
  llmModel: string;
  setLlmModel: (v: string) => void;
  showModelPicker: boolean;
  setShowModelPicker: (v: boolean) => void;
  modelPickerRef: React.RefObject<HTMLDivElement | null>;
  promptsHistory: PromptsHistoryEntry[];
  onRestorePrompts: (entry: PromptsHistoryEntry) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const hasPrompts = !!finalPrompts;
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto px-4 py-4">
        {isGenerating && !finalPrompts ? (
          <div className="flex flex-col items-center justify-center h-full text-white/30 text-sm gap-4">
            <div className="relative">
              <div className="size-16 rounded-full border-2 border-white/[0.06]" />
              <div className="absolute inset-0 size-16 rounded-full border-2 border-transparent border-t-[#CCFF00] animate-spin" />
              <ScrollText size={20} className="absolute inset-0 m-auto text-[#CCFF00]/60" />
            </div>
            <div className="text-center">
              <p className="font-medium text-xs text-white/50">{t("generatingPrompts")}</p>
              {progress && <p className="text-[11px] mt-1 text-[#CCFF00]/50 font-mono">{progress}</p>}
              <p className="text-[11px] mt-1 text-white/20">{llmModel === "gpt-5.5" ? t("generatingHintSlow") : t("generatingHint")}</p>
              {onCancel && (
                <button onClick={onCancel} className="mt-3 text-[11px] text-white/30 hover:text-white/60 transition-colors underline cursor-pointer">
                  {t("cancel")}
                </button>
              )}
            </div>
          </div>
        ) : finalPrompts ? (
          <div className="flex flex-col h-full">
            {isGenerating && progress && (
              <div className="flex items-center gap-2 px-1 py-1.5 mb-2 text-[11px] text-[#CCFF00]/60 font-mono">
                <div className="size-3 rounded-full border border-[#CCFF00]/40 border-t-[#CCFF00] animate-spin" />
                <span>{progress}</span>
                {onCancel && (
                  <button onClick={onCancel} className="ml-auto text-white/30 hover:text-white/60 underline cursor-pointer">
                    {t("cancel")}
                  </button>
                )}
              </div>
            )}
            <pre className="text-[11px] text-white/70 leading-relaxed whitespace-pre-wrap font-mono bg-white/[0.02] border border-white/[0.06] rounded-lg p-4 flex-1 overflow-auto">
              {finalPrompts}
            </pre>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-white/20 text-sm">
            <ScrollText size={36} className="mb-3 opacity-30" />
            <p className="font-medium text-xs">{t("emptyPrompts")}</p>
            <p className="text-[11px] mt-1 text-white/15">{t("emptyPromptsHint")}</p>
          </div>
        )}
      </div>

      {/* Bottom action bar — matches canvas generation panel style */}
      <div className="flex items-center justify-between w-full p-2 h-14 border-t border-white/[0.06] flex-shrink-0">
        {/* Left: model selector */}
        <div className="flex items-center gap-1">
          <div className="relative" ref={modelPickerRef}>
            <button
              onClick={() => setShowModelPicker(!showModelPicker)}
              className={`flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-lg hover:bg-zinc-800 transition-colors text-zinc-300 cursor-pointer ${showModelPicker ? "bg-zinc-800" : ""}`}
            >
              {(() => { const ic = TEXT_MODELS.find((m) => m.id === llmModel)?.icon ?? "gemini"; return ic === "openai" ? <OpenAIIcon /> : ic === "deepseek" ? <DeepSeekIcon /> : <GeminiIcon />; })()}
              <span className="whitespace-nowrap">{TEXT_MODELS.find((m) => m.id === llmModel)?.name ?? llmModel}</span>
            </button>
            {showModelPicker && (
              <div className="absolute left-0 bottom-full mb-1.5 z-50 w-72 rounded-2xl border border-zinc-700/60 p-1 animate-in fade-in slide-in-from-bottom-2 duration-150" style={{ background: "#1c1c1c" }}>
                {TEXT_MODELS.map((m) => {
                  const isSelected = m.id === llmModel;
                  return (
                    <button
                      key={m.id}
                      onClick={() => { setLlmModel(m.id); setShowModelPicker(false); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                        isSelected ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="size-7 rounded-md bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                        {m.icon === "openai" ? <OpenAIIcon /> : m.icon === "deepseek" ? <DeepSeekIcon /> : <GeminiIcon />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{m.name}</div>
                        {LLM_TOKENS_PER_XIN[m.id] && <div className="text-[10px] text-white/30">{t("modelTokensPerXin", { tokens: LLM_TOKENS_PER_XIN[m.id] })}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Center: AI disclaimer */}
        <span className="text-[10px] text-white/20 hidden sm:inline">{t("aiDisclaimer")}</span>

        {/* Right: action pills */}
        <div className="flex items-center gap-2">
          <StepHistoryDropdown entries={promptsHistory} onRestore={onRestorePrompts} t={t} />
          {isGenerating ? (
            /* Generating indicator (non-cancellable — cost already incurred) */
            <div
              className="flex items-center gap-1.5 rounded-full p-1 pl-2.5 border border-white/10"
              style={{ backdropFilter: "blur(10px)", background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)" }}
            >
              <span className="text-xs tabular-nums text-zinc-200 font-medium">≤{LLM_MAX_PRICE[llmModel] ?? 15}</span>
              <span className="text-xs text-zinc-400">{t("generating")}</span>
              <div className="w-[26px] h-[26px] rounded-full flex items-center justify-center bg-white text-black">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="50 20" />
                </svg>
              </div>
            </div>
          ) : (
            <>
              {/* Regenerate / Generate pill */}
              <div
                className="flex items-center gap-1.5 rounded-full p-1 pl-2.5 border border-white/10 cursor-pointer"
                style={{ backdropFilter: "blur(10px)", background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)" }}
              >
                <span className="text-xs tabular-nums text-zinc-200 font-medium">≤{LLM_MAX_PRICE[llmModel] ?? 15}</span>
                <span className="text-xs text-zinc-400">{hasPrompts ? t("regenerate") : t("generatePrompts")}</span>
                <button
                  onClick={onGenerate}
                  disabled={!hasShots}
                  className="w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {hasPrompts ? <RotateCcw size={12} /> : <ArrowRight size={14} />}
                </button>
              </div>

              {/* Send to canvas pill (only when prompts exist) */}
              {hasPrompts && (
                <div
                  className="flex items-center gap-1.5 rounded-full p-1 pl-2.5 border border-white/10 cursor-pointer"
                  style={{ backdropFilter: "blur(10px)", background: "radial-gradient(94.74% 157.5% at 50% 21.25%, #1a1a1a 0%, #656766 100%)" }}
                >
                  <span className="text-xs text-zinc-400">{t("sendToCanvas")}</span>
                  <button
                    onClick={onSendToCanvas}
                    className="w-[26px] h-[26px] rounded-full cursor-pointer flex items-center justify-center bg-white text-black hover:bg-white/80 transition-all"
                  >
                    <Send size={12} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Canvas Asset Picker Modal ────────────────────── */

type CanvasFilterTab = "all" | "image" | "video" | "audio";

function CanvasAssetPickerModal({
  canvasNodes,
  addingNodeId,
  onAdd,
  onClose,
  t,
}: {
  canvasNodes: Node<NodeData>[];
  addingNodeId: string | null;
  onAdd: (nodeId: string) => Promise<void>;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const [filter, setFilter] = useState<CanvasFilterTab>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return canvasNodes;
    return canvasNodes.filter((n) => {
      const d = n.data;
      if (filter === "video") return !!d.videoUrl;
      if (filter === "audio") return !!d.audioUrl;
      return !!(d.imageUrl || d.originalUrl) && !d.videoUrl && !d.audioUrl;
    });
  }, [canvasNodes, filter]);

  const counts = useMemo(() => ({
    all: canvasNodes.length,
    image: canvasNodes.filter((n) => !!(n.data.imageUrl || n.data.originalUrl) && !n.data.videoUrl && !n.data.audioUrl).length,
    video: canvasNodes.filter((n) => !!n.data.videoUrl).length,
    audio: canvasNodes.filter((n) => !!n.data.audioUrl).length,
  }), [canvasNodes]);

  const TABS: { key: CanvasFilterTab; labelKey: string }[] = [
    { key: "all", labelKey: "filterAll" },
    { key: "image", labelKey: "filterImage" },
    { key: "video", labelKey: "filterVideo" },
    { key: "audio", labelKey: "filterAudio" },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-[85vw] max-w-[1100px] h-[75vh] flex flex-col bg-[#1a1a1a] rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-sm font-medium text-white">{t("canvasAssets")}</h3>
          <button onClick={onClose} className="size-7 flex items-center justify-center rounded-lg hover:bg-white/[0.08] text-white/40 hover:text-white transition-colors cursor-pointer">
            <X size={14} />
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 px-5 py-2.5 border-b border-white/[0.06]">
          {TABS.map(({ key, labelKey }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 h-7 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                filter === key
                  ? "bg-white/[0.1] text-white"
                  : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
              }`}
            >
              {t(labelKey)} ({counts[key]})
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/20 text-sm">
              <LayoutGrid size={32} className="mb-3 opacity-30" />
              <p>{t("noCanvasNodes")}</p>
            </div>
          ) : (
            <div className="columns-5 gap-3 space-y-3">
              {filtered.map((node) => {
                const d = node.data;
                const isVid = !!d.videoUrl;
                const isAud = !!d.audioUrl;
                const thumb = d.thumbnailUrl ?? d.imageUrl;
                const adding = addingNodeId === node.id;
                return (
                  <button
                    key={node.id}
                    disabled={adding}
                    onClick={() => onAdd(node.id)}
                    className="group relative w-full break-inside-avoid rounded-lg overflow-hidden border border-white/[0.06] hover:border-[#CCFF00]/30 transition-colors cursor-pointer disabled:opacity-40 bg-white/[0.02]"
                  >
                    {thumb && !isAud ? (
                      <img src={String(thumb)} alt="" className="w-full block" style={{ aspectRatio: "auto" }} loading="lazy" />
                    ) : (
                      <div className="w-full aspect-square flex items-center justify-center bg-white/[0.04]">
                        {isAud ? <Music size={24} className="text-white/20" /> : isVid ? <Video size={24} className="text-white/20" /> : <ImageIcon size={24} className="text-white/20" />}
                      </div>
                    )}
                    {isVid && (
                      <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 text-[9px] text-white/70 font-medium">
                        VIDEO
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="text-[10px] text-white truncate">{String(d.label || node.id)}</div>
                    </div>
                    {adding && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 size={18} className="animate-spin text-[#CCFF00]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
