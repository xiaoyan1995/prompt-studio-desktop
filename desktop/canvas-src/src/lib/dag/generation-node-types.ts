/**
 * Node types that participate in DAG generation (prompt + model + billing).
 * Analysis/orchestration nodes (e.g. storyboard) must be excluded.
 */
export const DAG_GENERATION_NODE_TYPES = [
  "text",
  "image-gen",
  "video-gen",
  "upscale",
  "video-upscale",
  "rembg",
  "audio-gen",
] as const;

export type DagGenerationNodeType = (typeof DAG_GENERATION_NODE_TYPES)[number];

export function isDagGenerationNodeType(type: string | undefined): boolean {
  if (!type) return false;
  return (DAG_GENERATION_NODE_TYPES as readonly string[]).includes(type);
}
