import { execSync } from "child_process";

export interface VideoMetadata {
  durationS: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
}

export interface VideoSegment {
  index: number;
  startS: number;
  endS: number;
  midpointS: number;
  durationS: number;
}

const MAX_DURATION_S = 600;
const MAX_RESOLUTION = 3840;
const DEFAULT_AUTO_SHOTS = 60;
const MIN_SEGMENT_DURATION_S = 2;

export function probeVideo(filePath: string): VideoMetadata {
  const raw = execSync(
    `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
    { timeout: 30_000 },
  ).toString();

  const probe = JSON.parse(raw) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      duration?: string;
    }>;
  };

  const vs = probe.streams?.find((s) => s.codec_type === "video");
  if (!vs) throw new Error("No video stream found");

  const durationS = parseFloat(probe.format?.duration ?? vs.duration ?? "0");
  const width = vs.width ?? 0;
  const height = vs.height ?? 0;

  const [fpsNum, fpsDen] = (vs.r_frame_rate ?? "30/1").split("/").map(Number);
  const fps = fpsDen ? fpsNum / fpsDen : fpsNum || 30;
  const codec = vs.codec_name ?? "unknown";

  return { durationS, width, height, fps, codec };
}

export function validateVideoConstraints(meta: VideoMetadata): void {
  if (meta.durationS <= 0) {
    throw new Error("Could not determine video duration");
  }
  if (meta.durationS > MAX_DURATION_S) {
    throw new Error(
      `Video too long: ${Math.round(meta.durationS)}s (max ${MAX_DURATION_S}s / ${MAX_DURATION_S / 60} min)`,
    );
  }
  if (meta.width > MAX_RESOLUTION || meta.height > MAX_RESOLUTION) {
    throw new Error(
      `Video resolution too high: ${meta.width}×${meta.height} (max ${MAX_RESOLUTION}px)`,
    );
  }
}

/**
 * Divide a video into uniform segments for frame extraction.
 * - If maxShots is given, use that as the target count (capped by duration).
 * - Otherwise auto-decide based on duration (~5s per segment, capped at DEFAULT_AUTO_SHOTS).
 */
export function computeSegments(
  durationS: number,
  maxShots?: number,
): VideoSegment[] {
  const maxByDuration = Math.max(1, Math.floor(durationS / MIN_SEGMENT_DURATION_S));

  let numSegments: number;
  if (maxShots != null && maxShots > 0) {
    numSegments = Math.min(maxShots, maxByDuration);
  } else {
    numSegments = Math.min(
      DEFAULT_AUTO_SHOTS,
      maxByDuration,
      Math.max(1, Math.ceil(durationS / 5)),
    );
  }

  const segDur = durationS / numSegments;
  const segments: VideoSegment[] = [];

  for (let i = 0; i < numSegments; i++) {
    const startS = round2(i * segDur);
    const endS = round2(Math.min((i + 1) * segDur, durationS));
    segments.push({
      index: i,
      startS,
      endS,
      midpointS: round2((startS + endS) / 2),
      durationS: round2(endS - startS),
    });
  }

  return segments;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
