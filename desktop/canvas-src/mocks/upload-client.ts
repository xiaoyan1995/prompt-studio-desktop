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

export function isMediaFile(file: File): boolean {
  return file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/");
}

export function openFilePicker(accept: "image" | "video" | "audio" = "image"): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept === "image" ? "image/*" : accept === "video" ? "video/*" : "audio/*";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function uploadFile(
  file: File,
  opts?: { projectId?: string; nodeId?: string }
): Promise<UploadResult | VideoUploadResult | AudioUploadResult> {
  const isVideo = file.type.startsWith("video/");
  const isAudio = file.type.startsWith("audio/");
  const objectUrl = URL.createObjectURL(file);

  // Read file as base64
  const reader = new FileReader();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

  const projectId = opts?.projectId || new URLSearchParams(window.location.search).get("projectId") || "ps-local";
  const mediaType = isVideo ? "VIDEO" : isAudio ? "AUDIO" : "IMAGE";

  // Real upload to Python backend
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
  if (!response.ok) throw new Error("Material upload failed");
  const uploadData = await response.json();
  const savedUrl = uploadData.path; // e.g. /uploads/...

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

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        url: savedUrl,
        originalUrl: savedUrl,
        thumbnailUrl: savedUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
        fileName: file.name,
      } as UploadResult);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = objectUrl;
  });
}
