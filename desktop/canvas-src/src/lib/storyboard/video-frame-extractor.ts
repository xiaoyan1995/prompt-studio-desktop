import { execSync } from "child_process";
import { mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = join(process.cwd(), "data", "uploads");
const FRAME_MAX_WIDTH = 1280;

export interface ExtractedFrame {
  segmentIndex: number;
  timestampS: number;
  /** Publicly servable path, e.g. `/api/files/sb-xxx-frame-001.jpg` */
  servePath: string;
  /** Absolute filesystem path for reading the file */
  localPath: string;
}

/**
 * Extract one JPEG keyframe per timestamp from a video file.
 * Frames are resized to at most FRAME_MAX_WIDTH to keep file sizes small.
 */
export async function extractFrames(
  videoPath: string,
  timestamps: { index: number; timestampS: number }[],
  onProgress?: (current: number, total: number) => void,
): Promise<ExtractedFrame[]> {
  await mkdir(UPLOAD_DIR, { recursive: true });

  const batchId = randomUUID().slice(0, 8);
  const frames: ExtractedFrame[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const { index, timestampS } = timestamps[i];
    const frameName = `sb-${batchId}-frame-${String(index).padStart(3, "0")}.jpg`;
    const localPath = join(UPLOAD_DIR, frameName);

    try {
      execSync(
        `ffmpeg -ss ${timestampS} -i "${videoPath}" -vframes 1 -vf "scale='min(${FRAME_MAX_WIDTH},iw)':-1" -q:v 2 "${localPath}" -y`,
        { timeout: 20_000, stdio: "pipe" },
      );
    } catch (err) {
      console.warn(`[video-extractor] failed frame ${index} @${timestampS}s:`, err);
      continue;
    }

    frames.push({
      segmentIndex: index,
      timestampS,
      servePath: `/api/files/${frameName}`,
      localPath,
    });

    onProgress?.(i + 1, timestamps.length);
  }

  if (frames.length === 0) {
    throw new Error("Failed to extract any frames from video");
  }

  return frames;
}
