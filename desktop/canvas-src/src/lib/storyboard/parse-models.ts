/** T8Star model IDs currently supported by storyboard parsing */
export const STORYBOARD_PARSE_MODEL_IDS = [
  "google/gemini-2.5-flash-preview-05-20",
  "google/gemini-3.1-pro-preview-thinking-high",
] as const;

export type StoryboardParseModelId = (typeof STORYBOARD_PARSE_MODEL_IDS)[number];

export const DEFAULT_STORYBOARD_PARSE_MODEL_ID: StoryboardParseModelId =
  "google/gemini-2.5-flash-preview-05-20";

export const STORYBOARD_PARSE_MODEL_ID_SET = new Set<string>(STORYBOARD_PARSE_MODEL_IDS);

export function isStoryboardParseModelId(id: string): id is StoryboardParseModelId {
  return STORYBOARD_PARSE_MODEL_ID_SET.has(id);
}

export function resolveStoryboardParseModelId(id: string | undefined): StoryboardParseModelId {
  if (id && isStoryboardParseModelId(id)) return id;
  return DEFAULT_STORYBOARD_PARSE_MODEL_ID;
}
