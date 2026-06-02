import { useCanvasStore } from "@/stores/canvas-store";

export interface UploadResult {
  url: string;
  originalUrl?: string;
  thumbnailUrl: string;
  thumbnailLevels?: Record<string, string>;
  width: number;
  height: number;
  fileName: string;
}

export interface VideoUploadResult {
  mediaType: "video";
  videoUrl: string;
  originalVideoUrl?: string;
  thumbnailUrl: string;
  thumbnailLevels?: Record<string, string>;
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

const VIDEO_EXTS = new Set(["mp4", "mov", "webm", "m4v", "mkv", "avi", "mpeg", "mpg", "ts", "m2ts"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "flac", "aac", "m4a", "opus", "weba", "aiff", "au"]);

function inferMediaType(file: File): "IMAGE" | "VIDEO" | "AUDIO" {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("audio/")) return "AUDIO";
  if (mime.startsWith("image/")) return "IMAGE";
  const name = (file.name || "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  if (VIDEO_EXTS.has(ext)) return "VIDEO";
  if (AUDIO_EXTS.has(ext)) return "AUDIO";
  return "IMAGE";
}

function getProjectId(opts?: { projectId?: string }): string {
  if (opts?.projectId) return opts.projectId;
  try {
    const id = useCanvasStore.getState().projectId;
    if (id) return id;
  } catch {}
  try {
    const store = (window as any).__ZUSTAND_CANVAS_STORE__;
    if (store) { const id = store.getState().projectId; if (id) return id; }
  } catch {}
  return new URLSearchParams(window.location.search).get("projectId") || "ps-local";
}

export function isMediaFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/")) return true;
  const ext = (file.name || "").toLowerCase().split(".").pop() || "";
  return VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext) || /^(jpg|jpeg|png|webp|gif|avif|bmp|tif|tiff|heic|heif)$/.test(ext);
}

export function openFilePicker(accept: "image" | "video" | "audio" | "media" = "image"): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept === "video" ? "video/*" : accept === "audio" ? "audio/*" : accept === "media" ? "image/*,video/*,audio/*" : "image/*";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function uploadFile(
  file: File,
  opts?: { projectId?: string; nodeId?: string }
): Promise<UploadResult | VideoUploadResult | AudioUploadResult> {
  const mediaType = inferMediaType(file);
  const isVideo = mediaType === "VIDEO";
  const isAudio = mediaType === "AUDIO";
  const objectUrl = URL.createObjectURL(file);

  const reader = new FileReader();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

  const projectId = getProjectId(opts);

  const response = await fetch("/api/upload-material", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      filename: file.name,
      type: mediaType,
      data_url: dataUrl
    })
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    const msg = `Upload failed: status=${response.status}, projectId=${projectId}, file=${file.name}, body=${errBody.slice(0, 200)}`;
    console.error("[upload-client]", msg);
    throw new Error(msg);
  }

  const uploadData = await response.json();
  const savedUrl = uploadData.path || uploadData.url || uploadData.item?.storage_key;
  if (!savedUrl) {
    const msg = `Upload response missing path: ${JSON.stringify(uploadData).slice(0, 300)}`;
    console.error("[upload-client]", msg);
    throw new Error(msg);
  }

  if (isAudio) {
    const audio = new Audio(objectUrl);
    const duration = await new Promise<number>((res) => {
      audio.onloadedmetadata = () => res(audio.duration);
      audio.onerror = () => res(0);
    });
    return { mediaType: "audio", audioUrl: savedUrl, audioDuration: duration, fileName: file.name } as AudioUploadResult;
  }

  if (isVideo) {
    const video = document.createElement("video");
    video.src = objectUrl;
    const dims = await new Promise<{ w: number; h: number }>((res) => {
      video.onloadedmetadata = () => res({ w: video.videoWidth, h: video.videoHeight });
      video.onerror = () => res({ w: 0, h: 0 });
    });
    return {
      mediaType: "video",
      videoUrl: savedUrl,
      originalVideoUrl: savedUrl,
      thumbnailUrl: savedUrl,
      width: dims.w,
      height: dims.h,
      fileName: file.name,
    } as VideoUploadResult;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        url: savedUrl,
        originalUrl: savedUrl,
        thumbnailUrl: savedUrl,
        width: img.naturalWidth || 512,
        height: img.naturalHeight || 512,
        fileName: file.name,
      } as UploadResult);
    img.onerror = () => {
      resolve({
        url: savedUrl,
        originalUrl: savedUrl,
        thumbnailUrl: savedUrl,
        width: 512,
        height: 512,
        fileName: file.name,
      } as UploadResult);
    };
    img.src = objectUrl;
  });
}

export async function uploadImageFile(file: File, opts?: { projectId?: string; nodeId?: string }): Promise<UploadResult> {
  const result = await uploadFile(file, opts);
  if (!("url" in result)) throw new Error("Selected file is not an image");
  return result;
}
