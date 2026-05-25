/**
 * Extract material reference URLs from TipTap prompt JSON.
 * Material mentions have IDs starting with "material-" and their
 * thumbnailUrl contains the actual file URL to use as a reference.
 */
export function extractMaterialUrls(promptJson: any): {
  images: string[];
  videos: string[];
  audios: string[];
} {
  const imageSet = new Set<string>();
  const videoSet = new Set<string>();
  const audioSet = new Set<string>();

  if (!promptJson || !promptJson.content) return { images: [], videos: [], audios: [] };

  const walk = (node: any) => {
    if (node.type === "refMention" && node.attrs) {
      const mentionId = String(node.attrs.id ?? "");
      const refType = String(node.attrs.refType ?? "image");
      const thumb = String(node.attrs.thumbnailUrl ?? "");

      if (mentionId.startsWith("material-") && thumb) {
        if (refType === "video") videoSet.add(thumb);
        else if (refType === "audio") audioSet.add(thumb);
        else imageSet.add(thumb);
      }
    }
    if (node.content) node.content.forEach(walk);
  };

  walk(promptJson);
  return { images: [...imageSet], videos: [...videoSet], audios: [...audioSet] };
}

/**
 * Strip material mention markers from the prompt text.
 * Replaces @material-{uuid} with empty string since the material
 * is used as a reference image, not as part of the text prompt.
 */
export function stripMaterialMentions(prompt: string): string {
  return prompt.replace(/@material-[a-f0-9-]+/gi, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * Auto-register a generated asset into the project's real Asset Library (image_prompts or video_prompts)
 * with all generation parameters (prompt, model, aspect ratio, etc.) automatically attached.
 * Fire-and-forget: failures are logged but never block the generation flow.
 */
export function autoRegisterToAssetLibrary(opts: {
  url: string;
  type: "IMAGE" | "VIDEO";
  projectId?: string | null;
  title?: string;
  prompt?: string;
  model?: string;
  aspect?: string;
}) {
  const { url, type, projectId, title, prompt, model, aspect } = opts;
  if (!url) return;
  const pid = projectId || (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("projectId") : null);
  if (!pid) return;

  const isVideo = type === "VIDEO";
  const category = isVideo ? "video_prompts" : "image_prompts";

  async function getPostUrl(): Promise<string> {
    if (url.startsWith("blob:")) {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn("[auto-asset] Failed to read blob to base64:", e);
        return url;
      }
    }
    return url;
  }

  getPostUrl().then((finalUrl) => {
    console.log("[auto-asset] Saving to Asset Library...", { url: finalUrl.substring(0, 80), category, pid, prompt, model, aspect });

    fetch("/api/save-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: finalUrl,
        mediaType: isVideo ? "video" : "image",
        projectId: pid,
        category,
        title: title || (isVideo ? "Canvas Video" : "Canvas Image"),
        prompt: prompt || "",
        model: model || "",
        aspect: aspect || "",
      }),
    })
      .then(async (res) => {
        if (res.ok) {
          console.log("[auto-asset] Successfully saved to asset library!");
          // Notify both main index.html and material panels to refresh
          window.dispatchEvent(new CustomEvent("material-saved", { detail: {} }));
        } else {
          const err = await res.text().catch(() => "");
          console.warn("[auto-asset] Save media failed:", res.status, err);
        }
      })
      .catch((err) => console.warn("[auto-asset] Error calling save-media:", err));
  });
}
