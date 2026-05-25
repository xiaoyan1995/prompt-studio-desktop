/** Max shots per storyboard node (canvas-embedded rows). */
export const STORYBOARD_MAX_SHOTS = 200;

/** Max characters per description field. */
export const STORYBOARD_MAX_DESC_CHARS = 1000;

export interface ShotProvenance {
  kind?: "text" | "images" | "video";
  detail?: string;
}

export type StoryboardParseStrategy = "single_pass" | "director_then_compose";

export interface StoryboardDirectorBeat {
  beat: string;
  intent?: string;
}

export interface StoryboardDirectorPlan {
  planSummary: string;
  narrativeGoal?: string;
  emotionCurve?: string;
  visualStyle?: string;
  continuityRules?: string[];
  beats?: StoryboardDirectorBeat[];
  riskFlags?: string[];
  recommendedShotCount?: number;
}

export interface ShotRow {
  id: string;
  shotIndex: number;
  /** @deprecated use thumbnailUrls */
  thumbnailUrl?: string;
  thumbnailUrls?: string[];
  referenceImageUrls?: string[];
  visualDescription: string;
  contentDescription: string;
  startS?: number;
  endS?: number;
  durationS?: number;
  shotSize?: string;
  cameraNote?: string;
  sceneTag?: string;
  characterName?: string;
  characterDescription?: string;
  /** @deprecated use characterImageUrls */
  characterImageUrl?: string;
  characterImageUrls?: string[];
  characterAction?: string;
  emotion?: string;
  lightingAtmosphere?: string;
  soundEffect?: string;
  dialogue?: string;
  imagePrompt?: string;
  videoMotionPrompt?: string;
  provenance?: ShotProvenance;
}

export type StoryboardViewMode = "table" | "creative";

/** Node-local parse status (lowercase canceled per spec). */
export type StoryboardParseStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export interface StoryboardSourceSummary {
  type: "text" | "images" | "video";
  refs: string[];
}

export function createEmptyShotRow(shotIndex: number): ShotRow {
  return {
    id: crypto.randomUUID(),
    shotIndex,
    visualDescription: "",
    contentDescription: "",
  };
}

export function clampShotDescription(s: string): string {
  const t = s.slice(0, STORYBOARD_MAX_DESC_CHARS);
  return t;
}

/** Reassign shotIndex 1..n in array order. */
export function renumberShots(rows: ShotRow[]): ShotRow[] {
  return rows.map((r, i) => ({ ...r, shotIndex: i + 1 }));
}

/** Read storyboard fields from node data with safe defaults. */
export function getStoryboardState(data: Record<string, unknown>): {
  rows: ShotRow[];
  viewMode: StoryboardViewMode;
  parseStatus: StoryboardParseStatus;
  directorRules?: string;
  parseJobId?: string;
  errorMessage?: string;
  sourceSummary?: StoryboardSourceSummary;
} {
  const rows = Array.isArray(data.rows) ? (data.rows as ShotRow[]) : [];
  const viewMode = data.viewMode === "creative" ? "creative" : "table";
  const ps = data.parseStatus as string | undefined;
  const parseStatus: StoryboardParseStatus =
    ps === "queued" ||
    ps === "running" ||
    ps === "succeeded" ||
    ps === "failed" ||
    ps === "canceled"
      ? ps
      : "idle";
  return {
    rows,
    viewMode,
    parseStatus,
    directorRules: typeof data.directorRules === "string" ? data.directorRules : undefined,
    parseJobId: typeof data.parseJobId === "string" ? data.parseJobId : undefined,
    errorMessage: typeof data.errorMessage === "string" ? data.errorMessage : undefined,
    sourceSummary: data.sourceSummary as StoryboardSourceSummary | undefined,
  };
}
