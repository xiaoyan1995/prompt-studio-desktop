/**
 * Shared connection validation rules.
 * Used by both isValidConnection (CanvasEditor) and blur logic (NodeShell).
 */

const IMAGE_TYPES = new Set(["image-gen", "source-image"]);

/** Check if sourceType -> targetType connection is allowed */
export function isConnectionAllowed(sourceType: string, targetType: string): boolean {
  // Video node as SOURCE can only connect to other video-gen nodes
  if (sourceType === "video-gen" && targetType !== "video-gen") {
    return false;
  }
  // Audio node as SOURCE can only connect to video-gen
  if (sourceType === "audio-gen" && targetType !== "video-gen") {
    return false;
  }
  // Audio node as TARGET can only accept text input
  if (targetType === "audio-gen" && sourceType !== "text") {
    return false;
  }
  // Text node as TARGET can only accept image nodes input
  if (targetType === "text" && !IMAGE_TYPES.has(sourceType)) {
    return false;
  }
  // Text node as SOURCE cannot connect to another text node
  if (sourceType === "text" && targetType === "text") {
    return false;
  }
  return true;
}

/** Check if a given targetType is a valid target when dragging FROM sourceType */
export function isValidTarget(sourceType: string, targetType: string): boolean {
  return isConnectionAllowed(sourceType, targetType);
}
