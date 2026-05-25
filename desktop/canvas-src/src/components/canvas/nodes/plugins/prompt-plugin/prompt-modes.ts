/**
 * Prompt mode presets mirrored from the Storyboard-Copilot mode board
 * (the 10-entry index prototype discussed in design review).
 */
export type PromptModeId =
  | "pureText"
  | "consistency"
  | "cameraReplicate"
  | "effectsReplicate"
  | "plotCompletion"
  | "videoExtend"
  | "voiceControl"
  | "oneTake"
  | "videoEdit"
  | "musicBeat";

export interface PromptModeInputPreset {
  enabled: boolean;
  min: number;
  max: number;
}

export interface PromptModePreset {
  id: PromptModeId;
  labelKey: string;
  guideKey: string;
  recipeKey: string;
  defaultModelId: string;
  inputs: {
    images: PromptModeInputPreset;
    videos: PromptModeInputPreset;
    audios: PromptModeInputPreset;
  };
}

export const PROMPT_MODE_PRESETS: PromptModePreset[] = [
  {
    id: "pureText",
    labelKey: "promptModePureText",
    guideKey: "promptModeGuidePureText",
    recipeKey: "promptModeRecipePureText",
    defaultModelId: "deepseek/deepseek-v3.2",
    inputs: {
      images: { enabled: false, min: 0, max: 0 },
      videos: { enabled: false, min: 0, max: 0 },
      audios: { enabled: false, min: 0, max: 0 },
    },
  },
  {
    id: "consistency",
    labelKey: "promptModeConsistency",
    guideKey: "promptModeGuideConsistency",
    recipeKey: "promptModeRecipeConsistency",
    defaultModelId: "deepseek/deepseek-v3.2",
    inputs: {
      images: { enabled: true, min: 1, max: 4 },
      videos: { enabled: false, min: 0, max: 0 },
      audios: { enabled: false, min: 0, max: 0 },
    },
  },
  {
    id: "cameraReplicate",
    labelKey: "promptModeCameraReplicate",
    guideKey: "promptModeGuideCameraReplicate",
    recipeKey: "promptModeRecipeCameraReplicate",
    defaultModelId: "deepseek/deepseek-v3.2",
    inputs: {
      images: { enabled: true, min: 1, max: 4 },
      videos: { enabled: true, min: 1, max: 1 },
      audios: { enabled: false, min: 0, max: 0 },
    },
  },
  {
    id: "effectsReplicate",
    labelKey: "promptModeEffectsReplicate",
    guideKey: "promptModeGuideEffectsReplicate",
    recipeKey: "promptModeRecipeEffectsReplicate",
    defaultModelId: "deepseek/deepseek-v3.2",
    inputs: {
      images: { enabled: true, min: 1, max: 4 },
      videos: { enabled: true, min: 1, max: 1 },
      audios: { enabled: false, min: 0, max: 0 },
    },
  },
  {
    id: "plotCompletion",
    labelKey: "promptModePlotCompletion",
    guideKey: "promptModeGuidePlotCompletion",
    recipeKey: "promptModeRecipePlotCompletion",
    defaultModelId: "deepseek/deepseek-v3.2",
    inputs: {
      images: { enabled: true, min: 0, max: 4 },
      videos: { enabled: false, min: 0, max: 0 },
      audios: { enabled: true, min: 0, max: 1 },
    },
  },
  {
    id: "videoExtend",
    labelKey: "promptModeVideoExtend",
    guideKey: "promptModeGuideVideoExtend",
    recipeKey: "promptModeRecipeVideoExtend",
    defaultModelId: "deepseek/deepseek-v3.2",
    inputs: {
      images: { enabled: true, min: 0, max: 4 },
      videos: { enabled: true, min: 1, max: 1 },
      audios: { enabled: false, min: 0, max: 0 },
    },
  },
  {
    id: "voiceControl",
    labelKey: "promptModeVoiceControl",
    guideKey: "promptModeGuideVoiceControl",
    recipeKey: "promptModeRecipeVoiceControl",
    defaultModelId: "deepseek/deepseek-v3.2",
    inputs: {
      images: { enabled: true, min: 0, max: 4 },
      videos: { enabled: true, min: 1, max: 2 },
      audios: { enabled: true, min: 0, max: 1 },
    },
  },
  {
    id: "oneTake",
    labelKey: "promptModeOneTake",
    guideKey: "promptModeGuideOneTake",
    recipeKey: "promptModeRecipeOneTake",
    defaultModelId: "deepseek/deepseek-v3.2",
    inputs: {
      images: { enabled: true, min: 2, max: 6 },
      videos: { enabled: false, min: 0, max: 0 },
      audios: { enabled: false, min: 0, max: 0 },
    },
  },
  {
    id: "videoEdit",
    labelKey: "promptModeVideoEdit",
    guideKey: "promptModeGuideVideoEdit",
    recipeKey: "promptModeRecipeVideoEdit",
    defaultModelId: "deepseek/deepseek-v3.2",
    inputs: {
      images: { enabled: true, min: 1, max: 4 },
      videos: { enabled: true, min: 1, max: 1 },
      audios: { enabled: false, min: 0, max: 0 },
    },
  },
  {
    id: "musicBeat",
    labelKey: "promptModeMusicBeat",
    guideKey: "promptModeGuideMusicBeat",
    recipeKey: "promptModeRecipeMusicBeat",
    defaultModelId: "deepseek/deepseek-v3.2",
    inputs: {
      images: { enabled: true, min: 2, max: 8 },
      videos: { enabled: true, min: 1, max: 2 },
      audios: { enabled: true, min: 0, max: 1 },
    },
  },
];

export const PROMPT_MODE_IDS = new Set<PromptModeId>(PROMPT_MODE_PRESETS.map((item) => item.id));

const LEGACY_MODE_MAP: Record<string, PromptModeId> = {
  cinematic: "pureText",
  ad: "consistency",
  character: "consistency",
  action: "cameraReplicate",
  anime: "pureText",
  documentary: "plotCompletion",
  product: "consistency",
  social: "musicBeat",
  musicVideo: "musicBeat",
  storyboard: "plotCompletion",
};

export function normalizePromptModeId(mode: unknown): PromptModeId {
  const value = typeof mode === "string" ? mode : "";
  if (PROMPT_MODE_IDS.has(value as PromptModeId)) return value as PromptModeId;
  if (LEGACY_MODE_MAP[value]) return LEGACY_MODE_MAP[value];
  return "pureText";
}

export function getPromptModePreset(mode: unknown): PromptModePreset {
  const id = normalizePromptModeId(mode);
  return PROMPT_MODE_PRESETS.find((item) => item.id === id) ?? PROMPT_MODE_PRESETS[0];
}
