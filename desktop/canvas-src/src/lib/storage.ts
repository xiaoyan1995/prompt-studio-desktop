import { randomUUID } from "crypto";
import { mkdir, writeFile, stat, unlink, readFile } from "fs/promises";
import { join } from "path";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client, getR2Client, isR2Configured } from "./t8star-video";

const UPLOAD_DIR = join(process.cwd(), "data", "uploads");
const S3_BUCKET = process.env.S3_BUCKET_GENERATIONS ?? "generated";
const R2_BUCKET = process.env.R2_BUCKET ?? "xinyuai-v3";

function getS3PublicBaseUrl(): string {
  return process.env.S3_PUBLIC_BASE_URL ?? process.env.S3_ENDPOINT ?? "";
}

async function uploadToS3(key: string, buffer: Buffer, contentType: string): Promise<string> {
  // Prefer Cloudflare R2 (v3) when configured; fall back to MinIO (v2)
  if (isR2Configured()) {
    await getR2Client().send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
    // R2 public URL has no bucket in path: https://pub-xxx.r2.dev/{key}
    return `${process.env.R2_PUBLIC_URL}/${key}`;
  }
  await getS3Client().send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${getS3PublicBaseUrl()}/${S3_BUCKET}/${key}`;
}
const THUMB_SPECS = {
  sm: { width: 320, quality: 65, suffix: "thumb-sm" },
  md: { width: 640, quality: 72, suffix: "thumb-md" },
  lg: { width: 1280, quality: 80, suffix: "thumb-lg" },
} as const;
const VIDEO_DISPLAY_MAX_WIDTH = 1280;
const VIDEO_DISPLAY_CRF = 30;

export interface ThumbnailLevels {
  sm?: string;
  md?: string;
  lg?: string;
}

async function createThumbnailLevels(
  id: string,
  buffer: Buffer,
): Promise<{ thumbnailLevels: ThumbnailLevels; thumbPath: string }> {
  const levelEntries = await Promise.all(
    (Object.entries(THUMB_SPECS) as Array<[keyof ThumbnailLevels, (typeof THUMB_SPECS)[keyof typeof THUMB_SPECS]]>).map(
      async ([key, spec]) => {
        const name = `${id}-${spec.suffix}.webp`;
        const webp = await sharp(buffer)
          .resize({ width: spec.width, withoutEnlargement: true })
          .webp({ quality: spec.quality })
          .toBuffer();
        await writeFile(join(UPLOAD_DIR, name), webp);
        // Upload thumbnail to S3
        try {
          const s3Url = await uploadToS3(`image/thumb/${name}`, webp, "image/webp");
          return [key, s3Url] as const;
        } catch (e: any) {
          console.error("[storage] S3 thumb upload failed for %s, using local: %s", name, e.message);
          return [key, `/api/files/${name}`] as const;
        }
      },
    ),
  );

  const thumbnailLevels: ThumbnailLevels = Object.fromEntries(levelEntries);
  const thumbPath = thumbnailLevels.md ?? thumbnailLevels.lg ?? thumbnailLevels.sm ?? "";
  return { thumbnailLevels, thumbPath };
}

async function ensureDir() {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

export async function downloadAndCreateThumbnail(
  sourceUrl: string,
): Promise<{ originalPath: string; displayPath: string; thumbPath: string; thumbnailLevels: ThumbnailLevels; id: string; fileSize: number }> {
  await ensureDir();

  const id = randomUUID();

  let buffer: Buffer;
  let contentType: string;

  if (sourceUrl.startsWith("data:")) {
    const match = sourceUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match) throw new Error("Invalid data URI");
    contentType = match[1];
    buffer = Buffer.from(match[2], "base64");
  } else {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
    contentType = res.headers.get("content-type") ?? "";
    buffer = Buffer.from(await res.arrayBuffer());
  }

  const srcExt = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

  // Original is ALWAYS stored as-is — no compression, no conversion
  const originalBuf = buffer;
  const ext = srcExt;
  const originalName = `${id}-original.${ext}`;
  await writeFile(join(UPLOAD_DIR, originalName), originalBuf);

  // Display version — capped at 500KB for canvas rendering
  const MAX_DISPLAY_BYTES = 500 * 1024;
  let displayBuf: Buffer | undefined;
  if (originalBuf.length > MAX_DISPLAY_BYTES) {
    const meta = await sharp(buffer).metadata();
    const srcW = meta.width ?? 1024;
    for (const w of [srcW, 1600, 1200, 900, 700]) {
      const candidate = await sharp(buffer)
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      if (candidate.length <= MAX_DISPLAY_BYTES) { displayBuf = candidate; break; }
    }
    if (!displayBuf) {
      displayBuf = await sharp(buffer).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 60 }).toBuffer();
    }
  }
  const displayName = displayBuf ? `${id}-display.webp` : originalName;
  if (displayBuf) await writeFile(join(UPLOAD_DIR, displayName), displayBuf);

  const { thumbnailLevels, thumbPath } = await createThumbnailLevels(id, buffer);

  // Upload original + display to S3
  let originalPath = `/api/files/${originalName}`;
  let displayPath = `/api/files/${displayName}`;
  try {
    const origMime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    originalPath = await uploadToS3(`image/original/${originalName}`, originalBuf, origMime);
    if (displayBuf) {
      displayPath = await uploadToS3(`image/display/${displayName}`, displayBuf, "image/webp");
    } else {
      displayPath = originalPath;
    }
  } catch (e: any) {
    console.error("[storage] S3 upload failed, using local paths: %s", e.message);
  }

  return {
    originalPath,
    displayPath,
    thumbPath,
    thumbnailLevels,
    id,
    fileSize: originalBuf.length,
  };
}

/**
 * Dedicated storage for enhance/upscale results.
 * Saves 3 versions:
 *   - original high-res (for download only)
 *   - display version: capped at maxDisplayBytes (default 500KB) for canvas imageUrl
 *   - thumbnail: 600px webp for canvas thumbnailUrl
 */
export async function downloadEnhanceResult(
  sourceUrl: string,
  maxDisplayBytes = 500 * 1024, // 500KB
): Promise<{ originalPath: string; displayPath: string; thumbPath: string; thumbnailLevels: ThumbnailLevels; id: string; width: number; height: number; fileSize: number }> {
  await ensureDir();

  const id = randomUUID();

  let buffer: Buffer;
  let contentType: string;

  if (sourceUrl.startsWith("data:")) {
    const match = sourceUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match) throw new Error("Invalid data URI");
    contentType = match[1];
    buffer = Buffer.from(match[2], "base64");
  } else {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
    contentType = res.headers.get("content-type") ?? "";
    buffer = Buffer.from(await res.arrayBuffer());
  }

  // 1. Save original high-res — ALWAYS as-is, no compression
  const srcExt = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const originalBuf = buffer;
  const origExt = srcExt;
  const originalName = `${id}-original.${origExt}`;
  await writeFile(join(UPLOAD_DIR, originalName), originalBuf);

  // 2. Create display version — iteratively shrink until < maxDisplayBytes
  const meta = await sharp(buffer).metadata();
  const srcW = meta.width ?? 2048;
  const srcH = meta.height ?? 2048;
  let displayBuf: Buffer | null = null;

  // Try progressively smaller widths until we fit within budget
  const widths = [2048, 1600, 1280, 1024, 800];
  for (const w of widths) {
    if (w > srcW) continue; // skip if source is smaller
    const candidate = await sharp(buffer)
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    if (candidate.length <= maxDisplayBytes) {
      displayBuf = candidate;
      break;
    }
    // If close, try lower quality
    if (candidate.length <= maxDisplayBytes * 2) {
      const lq = await sharp(buffer)
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 60 })
        .toBuffer();
      if (lq.length <= maxDisplayBytes) {
        displayBuf = lq;
        break;
      }
    }
  }
  // Fallback: 800px at quality 50
  if (!displayBuf) {
    displayBuf = await sharp(buffer)
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 50 })
      .toBuffer();
  }
  const displayName = `${id}-display.webp`;
  await writeFile(join(UPLOAD_DIR, displayName), displayBuf);

  // 3. Create multi-level thumbnails for zoom-based canvas rendering.
  const { thumbnailLevels, thumbPath } = await createThumbnailLevels(id, buffer);

  console.log(
    "[storage] enhance result: original=%dKB display=%dKB thumb(md)=%s (src %dx%d)",
    Math.round(originalBuf.length / 1024),
    Math.round(displayBuf.length / 1024),
    thumbPath,
    srcW, srcH,
  );

  // Upload original + display to S3
  let originalPath = `/api/files/${originalName}`;
  let displayPath = `/api/files/${displayName}`;
  try {
    const origMime = origExt === "png" ? "image/png" : origExt === "webp" ? "image/webp" : "image/jpeg";
    originalPath = await uploadToS3(`image/original/${originalName}`, originalBuf, origMime);
    displayPath = await uploadToS3(`image/display/${displayName}`, displayBuf, "image/webp");
  } catch (e: any) {
    console.error("[storage] S3 enhance upload failed, using local paths: %s", e.message);
  }

  return {
    originalPath,
    displayPath,
    thumbPath,
    thumbnailLevels,
    id,
    width: srcW,
    height: srcH,
    fileSize: originalBuf.length,
  };
}

async function storeVideoWithDerivatives(
  id: string,
  originalBuffer: Buffer,
): Promise<{ videoPath: string; originalVideoPath: string; thumbPath: string; thumbnailLevels: ThumbnailLevels; id: string; width: number; height: number; originalSize: number }> {
  const originalName = `${id}-original.mp4`;
  const displayName = `${id}-display.mp4`;
  const originalFilePath = join(UPLOAD_DIR, originalName);
  const displayFilePath = join(UPLOAD_DIR, displayName);

  await writeFile(originalFilePath, originalBuffer);

  let width = 0;
  let height = 0;
  let thumbPath = "";
  let thumbnailLevels: ThumbnailLevels = {};
  let useDisplayVideo = false;

  // Probe source dimensions for downstream node sizing.
  try {
    const { execSync } = await import("child_process");
    const probeRaw = execSync(
      `ffprobe -v quiet -print_format json -show_streams "${originalFilePath}"`,
      { timeout: 15_000, stdio: "pipe" },
    ).toString();
    const probe = JSON.parse(probeRaw) as { streams?: Array<{ codec_type?: string; width?: number; height?: number }> };
    const vs = probe.streams?.find((s) => s.codec_type === "video");
    width = vs?.width ?? 0;
    height = vs?.height ?? 0;
  } catch {
    /* ffprobe unavailable; keep width/height as 0 */
  }

  // Ensure moov atom is at the start of the original file for browser streaming.
  try {
    const { execSync } = await import("child_process");
    const faststartPath = join(UPLOAD_DIR, `${id}-faststart.mp4`);
    execSync(
      `ffmpeg -y -i "${originalFilePath}" -c copy -movflags +faststart "${faststartPath}"`,
      { timeout: 60_000, stdio: "pipe" },
    );
    const [origStat, fsStat] = await Promise.all([stat(originalFilePath), stat(faststartPath)]);
    if (fsStat.size > 0 && fsStat.size <= origStat.size * 1.01) {
      const { renameSync } = await import("fs");
      renameSync(faststartPath, originalFilePath);
      originalBuffer = await readFile(originalFilePath);
    } else {
      await unlink(faststartPath).catch(() => {});
    }
  } catch {
    /* faststart remux failed; keep original as-is */
  }

  // Generate lightweight display stream for canvas playback.
  try {
    const { execSync } = await import("child_process");
    execSync(
      `ffmpeg -y -i "${originalFilePath}" -vf "scale='min(${VIDEO_DISPLAY_MAX_WIDTH},iw)':-2:flags=lanczos" -c:v libx264 -preset veryfast -crf ${VIDEO_DISPLAY_CRF} -c:a aac -b:a 96k -movflags +faststart "${displayFilePath}"`,
      { timeout: 120_000, stdio: "pipe" },
    );
    const [originStat, displayStat] = await Promise.all([stat(originalFilePath), stat(displayFilePath)]);
    if (displayStat.size < originStat.size) {
      useDisplayVideo = true;
    } else {
      await unlink(displayFilePath).catch(() => {});
    }
  } catch {
    await unlink(displayFilePath).catch(() => {});
  }

  // Extract thumbnail levels from original stream.
  try {
    const { execSync } = await import("child_process");
    const framePath = join(UPLOAD_DIR, `${id}-frame.png`);
    execSync(
      `ffmpeg -i "${originalFilePath}" -vframes 1 -ss 0.5 -q:v 2 "${framePath}" -y`,
      { timeout: 15_000, stdio: "pipe" },
    );
    const frameBuf = await readFile(framePath);
    const generated = await createThumbnailLevels(id, frameBuf);
    thumbnailLevels = generated.thumbnailLevels;
    thumbPath = generated.thumbPath;
    await unlink(framePath).catch(() => {});
  } catch (e: any) {
    console.error("[storage] video thumbnail extraction failed for %s: %s", id, e?.message ?? e);
  }

  // Upload video files to S3
  let videoPath = `/api/files/${useDisplayVideo ? displayName : originalName}`;
  let originalVideoPath = `/api/files/${originalName}`;
  try {
    const origS3 = await uploadToS3(`video/original/${originalName}`, originalBuffer, "video/mp4");
    originalVideoPath = origS3;
    if (useDisplayVideo) {
      const displayBuf = await readFile(displayFilePath);
      videoPath = await uploadToS3(`video/display/${displayName}`, displayBuf, "video/mp4");
    } else {
      videoPath = origS3;
    }
  } catch (e: any) {
    console.error("[storage] S3 video upload failed, using local paths: %s", e.message);
  }

  return {
    videoPath,
    originalVideoPath,
    thumbPath,
    thumbnailLevels,
    id,
    width,
    height,
    originalSize: originalBuffer.length,
  };
}

export async function downloadVideo(
  sourceUrl: string,
): Promise<{ videoPath: string; originalVideoPath: string; thumbPath: string; thumbnailLevels: ThumbnailLevels; id: string; width: number; height: number; originalSize: number }> {
  await ensureDir();

  let buffer: Buffer;
  if (sourceUrl.startsWith("data:")) {
    const match = sourceUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match) throw new Error("Invalid data URI");
    buffer = Buffer.from(match[2], "base64");
  } else {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  }

  return storeVideoWithDerivatives(randomUUID(), buffer);
}

export async function saveUploadedVideo(
  buffer: Buffer,
): Promise<{ videoPath: string; originalVideoPath: string; thumbPath: string; thumbnailLevels: ThumbnailLevels; id: string; width: number; height: number; originalSize: number }> {
  await ensureDir();
  return storeVideoWithDerivatives(randomUUID(), buffer);
}

export async function saveUploadedAudio(
  buffer: Buffer,
  originalName: string,
): Promise<{ audioPath: string; duration: number; id: string }> {
  await ensureDir();

  const id = randomUUID();
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "mp3";
  const safeExt = ["mp3", "wav", "aac", "ogg", "flac", "m4a", "webm"].includes(ext) ? ext : "mp3";
  const fileName = `${id}-original.${safeExt}`;
  await writeFile(join(UPLOAD_DIR, fileName), buffer);

  // Try to get duration via ffprobe (best-effort)
  let duration = 0;
  try {
    const { execFile: execFileCb } = await import("child_process");
    const { promisify } = await import("util");
    const execFile = promisify(execFileCb);
    const { stdout } = await execFile("ffprobe", [
      "-v", "quiet", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      join(UPLOAD_DIR, fileName),
    ], { timeout: 10_000 });
    const parsed = parseFloat(stdout.trim());
    if (Number.isFinite(parsed)) duration = Math.round(parsed * 10) / 10;
  } catch {
    // ffprobe not available or failed — duration stays 0
  }

  return {
    audioPath: `/api/files/${fileName}`,
    duration,
    id,
  };
}

export async function saveUploadedFile(
  buffer: Buffer,
  options?: { preserveFormat?: boolean },
): Promise<{ url: string; originalUrl: string; thumbnailUrl: string; thumbnailLevels: ThumbnailLevels; width: number; height: number; id: string }> {
  await ensureDir();

  const id = randomUUID();

  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const srcFormat = meta.format;
  const keepOriginal = options?.preserveFormat && (srcFormat === "png" || srcFormat === "jpeg" || srcFormat === "gif");

  let originalBuf: Buffer;
  let ext: string;
  if (keepOriginal) {
    originalBuf = buffer;
    ext = srcFormat === "jpeg" ? "jpg" : srcFormat!;
  } else {
    originalBuf = await sharp(buffer).webp({ quality: 85 }).toBuffer();
    ext = "webp";
  }
  const originalName = `${id}-original.${ext}`;
  await writeFile(join(UPLOAD_DIR, originalName), originalBuf);

  // Create display version if original is larger than 500KB (for reliable canvas/detail rendering)
  const MAX_DISPLAY_BYTES = 500 * 1024;
  let displayBuf: Buffer | undefined;
  if (originalBuf.length > MAX_DISPLAY_BYTES) {
    const srcW = meta.width ?? 1024;
    for (const w of [srcW, 1600, 1200, 900, 700]) {
      const candidate = await sharp(buffer)
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      if (candidate.length <= MAX_DISPLAY_BYTES) { displayBuf = candidate; break; }
    }
    if (!displayBuf) {
      displayBuf = await sharp(buffer).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 60 }).toBuffer();
    }
  }
  const displayName = displayBuf ? `${id}-display.webp` : originalName;
  if (displayBuf) await writeFile(join(UPLOAD_DIR, displayName), displayBuf);

  const { thumbnailLevels, thumbPath } = await createThumbnailLevels(id, buffer);

  // Upload to S3
  let originalPath = `/api/files/${originalName}`;
  let displayPath = `/api/files/${displayName}`;
  try {
    const origMime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
    originalPath = await uploadToS3(`image/original/${originalName}`, originalBuf, origMime);
    if (displayBuf) {
      displayPath = await uploadToS3(`image/display/${displayName}`, displayBuf, "image/webp");
    } else {
      displayPath = originalPath;
    }
  } catch (e: any) {
    console.error("[storage] S3 upload failed for saveUploadedFile, using local: %s", e.message);
  }

  return {
    url: displayPath,
    originalUrl: originalPath,
    thumbnailUrl: thumbPath,
    thumbnailLevels,
    width,
    height,
    id,
  };
}
