import type { ThumbnailLevels } from "@/lib/media-url";

export interface UploadResult {
  url: string;
  originalUrl?: string;
  thumbnailUrl: string;
  thumbnailLevels?: ThumbnailLevels;
  width: number;
  height: number;
  fileName: string;
}

export interface VideoUploadResult {
  mediaType: "video";
  videoUrl: string;
  originalVideoUrl?: string;
  thumbnailUrl: string;
  thumbnailLevels?: ThumbnailLevels;
  width: number;
  height: number;
  fileName: string;
}

export interface AudioUploadResult {
  mediaType: "audio";
  audioUrl: string;
  audioDuration: number;
  fileName: string;
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm";
const AUDIO_ACCEPT = "audio/mpeg,audio/wav,audio/aac,audio/ogg,audio/flac,.m4a,.mp3,.wav,.ogg,.flac,.aac";
const MEDIA_ACCEPT = `${IMAGE_ACCEPT},${VIDEO_ACCEPT},${AUDIO_ACCEPT}`;

export async function uploadImageFile(file: File, opts?: { projectId?: string; nodeId?: string }): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  if (opts?.projectId) form.append("project_id", opts.projectId);
  if (opts?.nodeId) form.append("node_id", opts.nodeId);
  const res = await fetch("/api/assets/upload", { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Upload failed (${res.status})`);
  }
  return res.json();
}

export async function uploadFile(
  file: File,
  opts?: { projectId?: string; nodeId?: string },
): Promise<(UploadResult & { mediaType?: "image" }) | VideoUploadResult | AudioUploadResult> {
  const form = new FormData();
  form.append("file", file);
  if (opts?.projectId) form.append("project_id", opts.projectId);
  if (opts?.nodeId) form.append("node_id", opts.nodeId);
  const res = await fetch("/api/assets/upload", { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Upload failed (${res.status})`);
  }
  return res.json();
}

export function openFilePicker(accept?: "image" | "video" | "audio" | "media"): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept === "video" ? VIDEO_ACCEPT : accept === "audio" ? AUDIO_ACCEPT : accept === "media" ? MEDIA_ACCEPT : IMAGE_ACCEPT;
    input.style.display = "none";
    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      input.remove();
      resolve(file);
    });
    input.addEventListener("cancel", () => {
      input.remove();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

export function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/");
}

export function isMediaFile(file: File): boolean {
  return isImageFile(file) || isVideoFile(file) || isAudioFile(file);
}
