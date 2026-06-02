import type { ThumbnailLevels } from "@/lib/media-url";
import { useCanvasStore } from "@/stores/canvas-store";

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

function inferMediaTypeForLegacyUpload(file: File): "IMAGE" | "VIDEO" | "AUDIO" {
  const mime = String(file.type || "").toLowerCase();
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime.startsWith("image/")) return "IMAGE";

  const name = String(file.name || "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  if (["mp4", "mov", "webm", "m4v", "avi", "mkv"].includes(ext)) return "VIDEO";
  if (["mp3", "wav", "ogg", "flac", "aac", "m4a", "opus", "weba"].includes(ext)) return "AUDIO";
  return "IMAGE";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function uploadViaLegacyEndpoint(
  file: File,
  opts?: { projectId?: string; nodeId?: string },
): Promise<(UploadResult & { mediaType?: "image" }) | VideoUploadResult | AudioUploadResult> {
  const mediaType = inferMediaTypeForLegacyUpload(file);
  const dataUrl = await fileToDataUrl(file);
  
  // Get projectId: direct store > URL params > fallback
  let projectId = opts?.projectId;
  if (!projectId) {
    try {
      projectId = useCanvasStore.getState().projectId || undefined;
    } catch {}
  }
  if (!projectId) {
    try {
      const store = (window as any).__ZUSTAND_CANVAS_STORE__;
      if (store) projectId = store.getState().projectId || undefined;
    } catch {}
  }
  if (!projectId) {
    projectId = new URLSearchParams(window.location.search).get("projectId") || "ps-local";
  }
  
  const payload = {
    projectId,
    filename: file.name,
    type: mediaType,
    data_url: dataUrl.slice(0, 100) + "... (total size: " + dataUrl.length + ")",
  };

  try {
    const url = "/api/upload-material";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        filename: file.name,
        type: mediaType,
        data_url: dataUrl,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const errMsg = `[fetch fail] url: ${url}, status: ${res.status}, body: ${text.slice(0, 200)}, payload: ${JSON.stringify(payload)}`;
      alert(errMsg);
      throw new Error(errMsg);
    }

    const body = await res.json();
    const path = body.path || body.url || body.item?.storage_key;
    if (!path) {
      const errMsg = `[no path in json] keys: ${Object.keys(body).join(", ")}, full: ${JSON.stringify(body)}`;
      alert(errMsg);
      throw new Error(errMsg);
    }

    if (mediaType === "VIDEO") {
      return {
        mediaType: "video",
        videoUrl: path,
        originalVideoUrl: path,
        thumbnailUrl: path,
        width: 0,
        height: 0,
        fileName: file.name,
      } as VideoUploadResult;
    }

    if (mediaType === "AUDIO") {
      return {
        mediaType: "audio",
        audioUrl: path,
        audioDuration: 0,
        fileName: file.name,
      } as AudioUploadResult;
    }

    return {
      mediaType: "image",
      url: path,
      originalUrl: path,
      thumbnailUrl: path,
      width: 0,
      height: 0,
      fileName: file.name,
    } as UploadResult & { mediaType?: "image" };

  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : String(err || "");
    const finalErr = `[upload error catch] ${rawMsg}`;
    alert(finalErr);
    throw new Error(finalErr);
  }
}

export async function uploadImageFile(file: File, opts?: { projectId?: string; nodeId?: string }): Promise<UploadResult> {
  const result = await uploadFile(file, opts);
  if (!("url" in result)) throw new Error("Selected file is not an image");
  return result;
}

export async function uploadFile(
  file: File,
  opts?: { projectId?: string; nodeId?: string },
): Promise<(UploadResult & { mediaType?: "image" }) | VideoUploadResult | AudioUploadResult> {
  // Directly use the fully functional local database material upload endpoint
  // which is active and thoroughly supported in the packaged Electron server (server.py).
  return uploadViaLegacyEndpoint(file, opts);
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
